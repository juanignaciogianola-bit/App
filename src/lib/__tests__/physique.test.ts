import {
  buildPhysiqueBriefing,
  buildPhysiqueSchema,
  isAdult,
  normalizePhysiqueAnalysis,
  type CatalogExercise,
} from '../../../supabase/functions/_shared/physique';

const catalog: CatalogExercise[] = [
  { id: 'id-lat', slug: 'lateral_raise', name: 'Elevaciones laterales', primary: ['side_delts'] },
  { id: 'id-calf', slug: 'standing_calf_raise', name: 'Elevación de talones de pie', primary: ['calves'] },
];

const base = {
  can_analyze: true,
  reason_if_not: '',
  summary: 'Buen tren superior; piernas por detrás.',
  strengths: [{ muscle_id: 'chest', note: 'Pecho lleno' }],
  lagging: [{ muscle_id: 'calves', severity: 'marked', note: 'Gemelos poco desarrollados' }],
  imbalances: [{ note: 'Hombro derecho más alto', muscles: ['traps', 'nope'] }],
  routine_suggestions: [{ muscle_id: 'calves', exercise_slug: 'standing_calf_raise', sets: 4, rep_min: 10, rep_max: 15, reason: 'Volumen bajo' }],
  diet_suggestions: [{ title: 'Proteína', detail: '160 g por día' }],
};

describe('normalizePhysiqueAnalysis', () => {
  it('maps exercise slugs to catalog ids and names', () => {
    const a = normalizePhysiqueAnalysis(base, catalog);
    expect(a.routine_suggestions[0]).toMatchObject({ exercise_id: 'id-calf', exercise_name: 'Elevación de talones de pie', sets: 4 });
    expect(a.imbalances[0].muscles).toEqual(['traps']);
  });

  it('drops unknown muscles/exercises, duplicates, and clamps numbers', () => {
    const a = normalizePhysiqueAnalysis(
      {
        ...base,
        lagging: [
          { muscle_id: 'calves', severity: 'huge', note: '' },
          { muscle_id: 'calves', severity: 'mild', note: 'dup' },
          { muscle_id: 'neck', severity: 'mild', note: '' },
        ],
        routine_suggestions: [
          { muscle_id: 'calves', exercise_slug: 'standing_calf_raise', sets: 40, rep_min: 20, rep_max: 5, reason: '' },
          { muscle_id: 'calves', exercise_slug: 'standing_calf_raise', sets: 3, rep_min: 8, rep_max: 12, reason: 'dup' },
          { muscle_id: 'side_delts', exercise_slug: 'made_up', sets: 3, rep_min: 8, rep_max: 12, reason: '' },
        ],
      },
      catalog,
    );
    expect(a.lagging).toEqual([{ muscle_id: 'calves', severity: 'mild', note: '' }]);
    expect(a.routine_suggestions).toHaveLength(1);
    expect(a.routine_suggestions[0]).toMatchObject({ sets: 10, rep_min: 20, rep_max: 20 });
  });

  it('returns an empty analysis with a reason when it cannot analyse', () => {
    const a = normalizePhysiqueAnalysis({ ...base, can_analyze: false, reason_if_not: 'Ropa holgada' }, catalog);
    expect(a).toMatchObject({ can_analyze: false, reason_if_not: 'Ropa holgada', lagging: [], routine_suggestions: [] });
  });

  it('rejects malformed output', () => {
    expect(() => normalizePhysiqueAnalysis({ summary: 'x' }, catalog)).toThrow();
  });
});

describe('physique prompt inputs', () => {
  it('builds a strict schema with catalog slugs as an enum', () => {
    const s = buildPhysiqueSchema(['lateral_raise']) as any;
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.routine_suggestions.items.properties.exercise_slug.enum).toEqual(['lateral_raise']);
    expect(s.properties.lagging.items.required).toEqual(['muscle_id', 'severity', 'note']);
  });

  it('includes profile, volume, routines and catalog in the briefing', () => {
    const b = buildPhysiqueBriefing({
      profile: { sex: 'male', age: 30, height_cm: 180, weight_kg: 80, goal: 'bulk', experience: 'intermediate' },
      targets: { kcal: 3030, protein_g: 160, carbs_g: 450, fat_g: 64 },
      weeklyVolume: { chest: 12, calves: 0 },
      routines: [{ name: 'Push', exercises: ['Press banca'] }],
      catalog,
      previous: null,
    });
    expect(b).toContain('180 cm, 80 kg, objetivo bulk');
    expect(b).toContain('- chest: 12');
    expect(b).toContain('- calves: 0');
    expect(b).toContain('Push: Press banca');
    expect(b).toContain('standing_calf_raise — Elevación de talones de pie — calves');
  });

  it('restricts analysis to adults', () => {
    const today = new Date(2026, 10, 10);
    expect(isAdult('2008-11-10', today)).toBe(true);
    expect(isAdult('2008-11-11', today)).toBe(false);
    expect(isAdult(null, today)).toBe(false);
  });
});
