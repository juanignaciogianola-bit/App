// POST { photo_path: "<uid>/<file>.jpg", note?: string }
// -> { estimate: MealEstimate, model: string }
// The photo must already be uploaded to the private "meal-photos" bucket by the caller.
import { analyzeImages, DEFAULT_MODEL } from '../_shared/claude.ts';
import { enforceDailyLimit, getServiceClient, getUserClient, handle, HttpError, json, logAiRequest } from '../_shared/http.ts';
import { isOwnPhotoPath, MEAL_SCHEMA, MEAL_SYSTEM_PROMPT, mediaTypeFor, normalizeMealEstimate } from '../_shared/meal.ts';

const MODEL = Deno.env.get('MEAL_MODEL') || DEFAULT_MODEL;
const DAILY_LIMIT = Number(Deno.env.get('MEAL_DAILY_LIMIT') || 40);
const MAX_BYTES = 5 * 1024 * 1024;

Deno.serve(
  handle(async (req) => {
    const { supabase, user } = await getUserClient(req);
    const body = await req.json().catch(() => ({}));
    if (!isOwnPhotoPath(body.photo_path, user.id)) throw new HttpError(400, 'bad_path', 'Foto inválida');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';

    const service = getServiceClient();
    await enforceDailyLimit(service, user.id, 'meal', DAILY_LIMIT);

    // Downloaded with the caller's token: storage RLS proves ownership again.
    const { data: blob, error } = await supabase.storage.from('meal-photos').download(body.photo_path);
    if (error || !blob) throw new HttpError(404, 'photo_not_found', 'No encontramos la foto');
    if (blob.size > MAX_BYTES) throw new HttpError(413, 'photo_too_large', 'La foto es demasiado grande');
    const bytes = new Uint8Array(await blob.arrayBuffer());

    try {
      const result = await analyzeImages({
        model: MODEL,
        effort: 'low',
        system: MEAL_SYSTEM_PROMPT,
        images: [{ bytes, mediaType: mediaTypeFor(body.photo_path) }],
        text: note ? `Nota del usuario: ${note}` : 'Estimá esta comida.',
        schema: MEAL_SCHEMA,
        maxTokens: 4000,
      });
      const estimate = normalizeMealEstimate(result.data);
      await logAiRequest(service, {
        user_id: user.id, kind: 'meal', model: result.model, ok: true,
        input_tokens: result.inputTokens, output_tokens: result.outputTokens,
      });
      return json({ estimate, model: result.model });
    } catch (e) {
      await logAiRequest(service, { user_id: user.id, kind: 'meal', model: MODEL, ok: false });
      if (e instanceof HttpError) throw e;
      if (e instanceof Error && e.message.startsWith('estimate')) throw new HttpError(502, 'ai_bad_shape', 'La IA devolvió un resultado inválido.');
      throw e;
    }
  }),
);
