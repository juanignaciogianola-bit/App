// Pure module (no imports): shared by the analyze-physique edge function (Deno) and Jest.

export const MUSCLE_IDS = [
  'chest', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps', 'forearms', 'abs', 'obliques',
  'traps', 'lats', 'upper_back', 'lower_back', 'glutes', 'quads', 'hamstrings', 'adductors', 'calves',
] as const;
export type MuscleId = (typeof MUSCLE_IDS)[number];

export const PHYSIQUE_SYSTEM_PROMPT = `You are an experienced strength & physique coach inside a training app.
You receive three photos of the user (front, back, side), their profile, their recent training volume per
muscle, their current routines and the exercise catalog of the app.

Assess muscular development and proportions as a coach would for programming purposes:
- strengths: up to 4 muscle groups that are clearly well developed relative to the rest.
- lagging: up to 4 muscle groups that are visibly underdeveloped relative to the rest of the physique.
  severity: "mild", "moderate" or "marked". Cross-check with the training volume: a lagging muscle with low
  weekly sets is the most actionable finding; say so in the note.
- imbalances: notable left/right asymmetries or front/back and upper/lower disproportions, with the muscles involved.
- routine_suggestions: 2 to 6 exercises from the catalog (use the exact slug) that target the lagging muscles,
  preferring ones the user does not already do. Give sets and a rep range suited to their experience; one short reason each.
- diet_suggestions: 2 to 4 concrete adjustments consistent with their goal and current targets
  (e.g. protein grams per day, calorie adjustment, meal timing around training).
- summary: 2–3 sentences with the overall picture and the single most important next step.

Rules:
- Write every text field in Rioplatense Spanish, concise and specific, in a respectful and encouraging tone.
- Judge only what is visible. Lighting, pump and posture distort photos: say so if it limits the assessment.
- Talk about muscles and training only: no comments on attractiveness, skin, face or intimate areas,
  no medical diagnoses and no body-fat percentages.
- Set can_analyze to false (and explain in reason_if_not, in Spanish) when the photos do not clearly show one
  adult person's physique (e.g. baggy clothes, wrong subject, several people, a minor). Then leave the lists empty.`;

export function buildPhysiqueSchema(exerciseSlugs: string[]) {
  const muscle = { type: 'string', enum: [...MUSCLE_IDS] };
  const note = { type: 'string' };
  const obj = (properties: Record<string, unknown>) => ({
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  });
  return obj({
    can_analyze: { type: 'boolean' },
    reason_if_not: { type: 'string' },
    summary: { type: 'string' },
    strengths: { type: 'array', items: obj({ muscle_id: muscle, note }) },
    lagging: {
      type: 'array',
      items: obj({ muscle_id: muscle, severity: { type: 'string', enum: ['mild', 'moderate', 'marked'] }, note }),
    },
    imbalances: { type: 'array', items: obj({ note, muscles: { type: 'array', items: muscle } }) },
    routine_suggestions: {
      type: 'array',
      items: obj({
        muscle_id: muscle,
        exercise_slug: { type: 'string', enum: exerciseSlugs },
        sets: { type: 'integer' },
        rep_min: { type: 'integer' },
        rep_max: { type: 'integer' },
        reason: { type: 'string' },
      }),
    },
    diet_suggestions: { type: 'array', items: obj({ title: { type: 'string' }, detail: { type: 'string' } }) },
  });
}

export interface CatalogExercise {
  id: string;
  slug: string;
  name: string;
  primary: string[];
}

export interface PhysiqueContext {
  profile: {
    sex: string | null;
    age: number | null;
    height_cm: number | null;
    weight_kg: number | null;
    goal: string | null;
    experience: string | null;
  };
  targets: { kcal: number; protein_g: number; carbs_g: number; fat_g: number } | null;
  weeklyVolume: Partial<Record<MuscleId, number>>; // average weighted sets/week, last 4 weeks
  routines: { name: string; exercises: string[] }[];
  catalog: CatalogExercise[];
  previous: { date: string; summary: string; lagging: string[] } | null;
}

/** Plain-text briefing sent next to the photos. */
export function buildPhysiqueBriefing(c: PhysiqueContext): string {
  const p = c.profile;
  const lines = [
    `Perfil: ${p.sex ?? '?'}, ${p.age ?? '?'} años, ${p.height_cm ?? '?'} cm, ${p.weight_kg ?? '?'} kg, objetivo ${p.goal ?? '?'}, experiencia ${p.experience ?? '?'}.`,
    c.targets
      ? `Objetivos diarios actuales: ${c.targets.kcal} kcal, ${c.targets.protein_g} g proteína, ${c.targets.carbs_g} g carbos, ${c.targets.fat_g} g grasas.`
      : 'Sin objetivos nutricionales cargados.',
    '',
    'Series ponderadas por semana (promedio de las últimas 4 semanas):',
    ...MUSCLE_IDS.map((m) => `- ${m}: ${Math.round((c.weeklyVolume[m] ?? 0) * 10) / 10}`),
    '',
    'Rutinas actuales:',
    ...(c.routines.length ? c.routines.map((r) => `- ${r.name}: ${r.exercises.join(', ') || '(vacía)'}`) : ['- (ninguna)']),
    '',
    'Catálogo de ejercicios (slug — nombre — músculos principales):',
    ...c.catalog.map((e) => `- ${e.slug} — ${e.name} — ${e.primary.join(', ')}`),
  ];
  if (c.previous) {
    lines.push('', `Análisis anterior (${c.previous.date}): ${c.previous.summary} Rezagados entonces: ${c.previous.lagging.join(', ') || 'ninguno'}.`,
      'Si se nota un cambio respecto de ese análisis, mencionalo en el resumen.');
  }
  lines.push('', 'Las fotos están en orden: frente, espalda, perfil.');
  return lines.join('\n');
}

export interface PhysiqueAnalysis {
  can_analyze: boolean;
  reason_if_not: string;
  summary: string;
  strengths: { muscle_id: MuscleId; note: string }[];
  lagging: { muscle_id: MuscleId; severity: 'mild' | 'moderate' | 'marked'; note: string }[];
  imbalances: { note: string; muscles: MuscleId[] }[];
  routine_suggestions: {
    muscle_id: MuscleId;
    exercise_id: string;
    exercise_name: string;
    sets: number;
    rep_min: number;
    rep_max: number;
    reason: string;
  }[];
  diet_suggestions: { title: string; detail: string }[];
}

const isMuscle = (m: unknown): m is MuscleId => typeof m === 'string' && (MUSCLE_IDS as readonly string[]).includes(m);
const text = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
const int = (n: unknown, min: number, max: number, dflt: number) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : dflt;
  return Math.min(max, Math.max(min, v));
};
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

/**
 * Validates model output against the app's data: unknown muscles and exercises
 * are dropped, exercise slugs become catalog ids, numbers are clamped, lists capped.
 */
export function normalizePhysiqueAnalysis(raw: unknown, catalog: CatalogExercise[]): PhysiqueAnalysis {
  if (!raw || typeof raw !== 'object') throw new Error('analysis is not an object');
  const r = raw as Record<string, unknown>;
  if (typeof r.can_analyze !== 'boolean') throw new Error('analysis is missing fields');
  if (!r.can_analyze) {
    return {
      can_analyze: false,
      reason_if_not: text(r.reason_if_not, 300) || 'No pudimos analizar estas fotos.',
      summary: '', strengths: [], lagging: [], imbalances: [], routine_suggestions: [], diet_suggestions: [],
    };
  }
  const bySlug = new Map(catalog.map((e) => [e.slug, e]));
  const seenMuscle = new Set<string>();
  const uniqueByMuscle = <T extends { muscle_id: MuscleId }>(list: T[]) =>
    list.filter((x) => (seenMuscle.has(x.muscle_id) ? false : (seenMuscle.add(x.muscle_id), true)));

  const strengths = uniqueByMuscle(
    arr(r.strengths).filter((s) => isMuscle(s.muscle_id)).map((s) => ({ muscle_id: s.muscle_id as MuscleId, note: text(s.note, 200) })),
  ).slice(0, 4);
  seenMuscle.clear();
  const lagging = uniqueByMuscle(
    arr(r.lagging)
      .filter((s) => isMuscle(s.muscle_id))
      .map((s) => ({
        muscle_id: s.muscle_id as MuscleId,
        severity: (['mild', 'moderate', 'marked'].includes(s.severity as string) ? s.severity : 'mild') as 'mild' | 'moderate' | 'marked',
        note: text(s.note, 200),
      })),
  ).slice(0, 4);

  const seenExercise = new Set<string>();
  const routine_suggestions = arr(r.routine_suggestions)
    .map((s) => {
      const ex = bySlug.get(String(s.exercise_slug));
      if (!ex || !isMuscle(s.muscle_id) || seenExercise.has(ex.id)) return null;
      seenExercise.add(ex.id);
      const rep_min = int(s.rep_min, 1, 50, 8);
      return {
        muscle_id: s.muscle_id as MuscleId,
        exercise_id: ex.id,
        exercise_name: ex.name,
        sets: int(s.sets, 1, 10, 3),
        rep_min,
        rep_max: Math.max(rep_min, int(s.rep_max, 1, 50, 12)),
        reason: text(s.reason, 200),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 6);

  return {
    can_analyze: true,
    reason_if_not: '',
    summary: text(r.summary, 600),
    strengths,
    lagging,
    imbalances: arr(r.imbalances)
      .map((i) => ({ note: text(i.note, 200), muscles: (Array.isArray(i.muscles) ? i.muscles : []).filter(isMuscle) }))
      .filter((i) => i.note)
      .slice(0, 4),
    routine_suggestions,
    diet_suggestions: arr(r.diet_suggestions)
      .map((d) => ({ title: text(d.title, 80), detail: text(d.detail, 300) }))
      .filter((d) => d.title)
      .slice(0, 4),
  };
}

export const POSES = ['front', 'back', 'side'] as const;
export type Pose = (typeof POSES)[number];

export function physiquePhotoPath(userId: string, sessionId: string, pose: Pose) {
  return `${userId}/${sessionId}/${pose}.jpg`;
}

/** Physique analysis is restricted to adults. */
export function isAdult(birthDate: string | null, today: Date = new Date()): boolean {
  if (!birthDate) return false;
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age >= 18;
}
