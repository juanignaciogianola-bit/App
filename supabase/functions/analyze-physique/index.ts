// POST { session_id } -> { analysis } | 422 { error: "cannot_analyze", message }
// The session's three photos must already be in "physique-photos/<uid>/<session id>/".
import { analyzeImages, DEFAULT_MODEL } from '../_shared/claude.ts';
import { enforceDailyLimit, getServiceClient, getUserClient, handle, HttpError, json, logAiRequest } from '../_shared/http.ts';
import {
  buildPhysiqueBriefing,
  buildPhysiqueSchema,
  isAdult,
  MUSCLE_IDS,
  normalizePhysiqueAnalysis,
  PHYSIQUE_SYSTEM_PROMPT,
  type CatalogExercise,
  type MuscleId,
} from '../_shared/physique.ts';
import { mediaTypeFor } from '../_shared/meal.ts';

const MODEL = Deno.env.get('PHYSIQUE_MODEL') || DEFAULT_MODEL;
const DAILY_LIMIT = Number(Deno.env.get('PHYSIQUE_DAILY_LIMIT') || 5);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

Deno.serve(
  handle(async (req) => {
    const { supabase, user } = await getUserClient(req);
    const body = await req.json().catch(() => ({}));
    if (typeof body.session_id !== 'string' || !UUID.test(body.session_id)) throw new HttpError(400, 'bad_session', 'Sesión inválida');

    const { data: profile } = await supabase
      .from('profiles')
      .select('sex, birth_date, height_cm, weight_kg, goal, experience')
      .eq('id', user.id)
      .single();
    if (!isAdult(profile?.birth_date ?? null)) {
      throw new HttpError(403, 'adults_only', 'El análisis de físico está disponible solo para mayores de 18 años.');
    }

    // RLS: only the owner's session is visible.
    const { data: session } = await supabase
      .from('physique_sessions')
      .select('id, taken_at, weight_kg, front_path, back_path, side_path')
      .eq('id', body.session_id)
      .maybeSingle();
    if (!session) throw new HttpError(404, 'session_not_found', 'No encontramos esa sesión');
    const paths = [session.front_path, session.back_path, session.side_path];
    if (paths.some((p) => !p)) throw new HttpError(400, 'missing_photos', 'Faltan fotos (frente, espalda y perfil)');

    const service = getServiceClient();
    await enforceDailyLimit(service, user.id, 'physique', DAILY_LIMIT);

    const photos = await Promise.all(
      paths.map(async (p) => {
        const { data, error } = await supabase.storage.from('physique-photos').download(p!);
        if (error || !data) throw new HttpError(404, 'photo_not_found', 'No encontramos una de las fotos');
        if (data.size > 5 * 1024 * 1024) throw new HttpError(413, 'photo_too_large', 'Una foto es demasiado grande');
        return { bytes: new Uint8Array(await data.arrayBuffer()), mediaType: mediaTypeFor(p!) };
      }),
    );

    // Training and nutrition context (all read as the user, through RLS)
    const now = new Date();
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 3600 * 1000);
    const [targetsRes, volumeRes, routinesRes, catalogRes, previousRes] = await Promise.all([
      supabase.from('current_nutrition_targets').select('kcal, protein_g, carbs_g, fat_g').maybeSingle(),
      supabase.rpc('muscle_volume', { p_from: fourWeeksAgo.toISOString(), p_to: now.toISOString() }),
      supabase.from('routines').select('name, routine_exercises(position, exercise:exercises(name))').order('position'),
      supabase.from('exercises').select('id, slug, name, exercise_muscles(muscle_id, role)').not('slug', 'is', null).order('slug'),
      supabase
        .from('physique_analyses')
        .select('created_at, summary, lagging')
        .neq('session_id', session.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (catalogRes.error) throw new Error(catalogRes.error.message);

    const catalog: CatalogExercise[] = (catalogRes.data ?? []).map((e: any) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      primary: e.exercise_muscles.filter((m: any) => m.role === 'primary').map((m: any) => m.muscle_id),
    }));
    const weeklyVolume: Partial<Record<MuscleId, number>> = {};
    for (const r of (volumeRes.data ?? []) as { muscle_id: MuscleId; sets: number }[]) {
      if ((MUSCLE_IDS as readonly string[]).includes(r.muscle_id)) weeklyVolume[r.muscle_id] = Number(r.sets) / 4;
    }
    const birth = profile!.birth_date as string;
    const age = now.getFullYear() - Number(birth.slice(0, 4)) - (now.toISOString().slice(5, 10) < birth.slice(5, 10) ? 1 : 0);
    const briefing = buildPhysiqueBriefing({
      profile: {
        sex: profile!.sex, age, height_cm: Number(profile!.height_cm),
        weight_kg: Number(session.weight_kg ?? profile!.weight_kg), goal: profile!.goal, experience: profile!.experience,
      },
      targets: targetsRes.data ?? null,
      weeklyVolume,
      routines: (routinesRes.data ?? []).map((r: any) => ({
        name: r.name,
        exercises: [...r.routine_exercises].sort((a: any, b: any) => a.position - b.position).map((x: any) => x.exercise?.name).filter(Boolean),
      })),
      catalog,
      previous: previousRes.data
        ? {
            date: String(previousRes.data.created_at).slice(0, 10),
            summary: previousRes.data.summary,
            lagging: (previousRes.data.lagging as { muscle_id: string }[]).map((l) => l.muscle_id),
          }
        : null,
    });

    let analysis;
    try {
      const result = await analyzeImages({
        model: MODEL,
        effort: 'high',
        system: PHYSIQUE_SYSTEM_PROMPT,
        images: [
          { ...photos[0], label: 'Foto 1: frente' },
          { ...photos[1], label: 'Foto 2: espalda' },
          { ...photos[2], label: 'Foto 3: perfil' },
        ],
        text: briefing,
        schema: buildPhysiqueSchema(catalog.map((c) => c.slug)),
        maxTokens: 16000,
      });
      analysis = normalizePhysiqueAnalysis(result.data, catalog);
      await logAiRequest(service, {
        user_id: user.id, kind: 'physique', model: result.model, ok: true,
        input_tokens: result.inputTokens, output_tokens: result.outputTokens,
      });
      if (!analysis.can_analyze) throw new HttpError(422, 'cannot_analyze', analysis.reason_if_not);

      const { data: saved, error } = await service
        .from('physique_analyses')
        .insert({
          session_id: session.id,
          user_id: user.id,
          summary: analysis.summary,
          strengths: analysis.strengths,
          lagging: analysis.lagging,
          imbalances: analysis.imbalances,
          routine_suggestions: analysis.routine_suggestions,
          diet_suggestions: analysis.diet_suggestions,
          model: result.model,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return json({ analysis: saved });
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.code !== 'cannot_analyze') await logAiRequest(service, { user_id: user.id, kind: 'physique', model: MODEL, ok: false });
        throw e;
      }
      await logAiRequest(service, { user_id: user.id, kind: 'physique', model: MODEL, ok: false });
      if (e instanceof Error && e.message.startsWith('analysis')) throw new HttpError(502, 'ai_bad_shape', 'La IA devolvió un resultado inválido.');
      throw e;
    }
  }),
);
