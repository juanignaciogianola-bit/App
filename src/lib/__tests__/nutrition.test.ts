import {
  ageFromBirthDate,
  computeTargets,
  mifflinStJeor,
  validateProfile,
  type BodyProfile,
} from '../nutrition';

const TODAY = new Date(2026, 10, 10); // 2026-11-10

const base: BodyProfile = {
  sex: 'male',
  birthDate: '1996-01-15', // 30 years old on TODAY
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'moderate',
  goal: 'maintain',
};

describe('ageFromBirthDate', () => {
  it('counts a birthday that already happened this year', () => {
    expect(ageFromBirthDate('1996-01-15', TODAY)).toBe(30);
  });
  it('does not count a birthday later this year', () => {
    expect(ageFromBirthDate('1996-12-01', TODAY)).toBe(29);
  });
  it('counts the birthday on the day itself', () => {
    expect(ageFromBirthDate('1996-11-10', TODAY)).toBe(30);
  });
  it('rejects malformed dates', () => {
    expect(() => ageFromBirthDate('abc', TODAY)).toThrow();
  });
});

describe('mifflinStJeor', () => {
  it('matches the published formula for men and women', () => {
    expect(mifflinStJeor('male', 80, 180, 30)).toBe(1780);
    expect(mifflinStJeor('female', 60, 165, 25)).toBeCloseTo(1345.25);
  });
});

describe('computeTargets', () => {
  it('maintain: TDEE with 2 g/kg protein, 0.8 g/kg fat, rest carbs', () => {
    const t = computeTargets(base, TODAY);
    expect(t.bmr).toBe(1780);
    expect(t.tdee).toBe(2759);
    expect(t).toMatchObject({ kcal: 2760, proteinG: 160, fatG: 64, carbsG: 386 });
  });

  it('bulk adds 10 %, cut removes 20 %', () => {
    expect(computeTargets({ ...base, goal: 'bulk' }, TODAY).kcal).toBe(3030);
    const cut = computeTargets(
      { ...base, sex: 'female', birthDate: '2001-01-01', heightCm: 165, weightKg: 60, activityLevel: 'light', goal: 'cut' },
      TODAY,
    );
    expect(cut).toMatchObject({ kcal: 1480, proteinG: 120, fatG: 48, carbsG: 142 });
  });

  it('never goes below the safety floor', () => {
    const t = computeTargets(
      { ...base, sex: 'female', birthDate: '1966-01-01', heightCm: 150, weightKg: 45, activityLevel: 'sedentary', goal: 'cut' },
      TODAY,
    );
    expect(t.kcal).toBe(1200);
  });

  it('trims fat when protein + fat exceed the calorie budget', () => {
    const t = computeTargets(
      { ...base, birthDate: '2006-01-01', heightCm: 160, weightKg: 200, activityLevel: 'sedentary', goal: 'cut' },
      TODAY,
    );
    expect(t.fatG).toBe(120);
    expect(t.carbsG).toBeGreaterThanOrEqual(0);
    expect(t.proteinG * 4 + t.fatG * 9 + t.carbsG * 4).toBeLessThanOrEqual(t.kcal + 4);
  });

  it('macros always add up to the calorie target (±rounding)', () => {
    for (const goal of ['bulk', 'cut', 'maintain'] as const) {
      for (const weightKg of [50, 70, 90, 120]) {
        const t = computeTargets({ ...base, goal, weightKg }, TODAY);
        const sum = t.proteinG * 4 + t.fatG * 9 + t.carbsG * 4;
        expect(Math.abs(sum - t.kcal)).toBeLessThanOrEqual(4);
      }
    }
  });

  it('throws on out-of-range input', () => {
    expect(() => computeTargets({ ...base, heightCm: 90 }, TODAY)).toThrow(/altura/);
  });
});

describe('validateProfile', () => {
  it('reports every invalid field', () => {
    const errors = validateProfile({ ...base, birthDate: '2020-01-01', weightKg: 10, heightCm: 300 }, TODAY);
    expect(errors).toHaveLength(3);
  });
  it('accepts a valid profile', () => {
    expect(validateProfile(base, TODAY)).toEqual([]);
  });
});
