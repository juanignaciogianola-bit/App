/**
 * Calorie and macro targets from onboarding data. Pure functions, no I/O, so
 * they are unit-tested and could be ported to SQL or an edge function as-is.
 *
 * BMR: Mifflin-St Jeor. TDEE: BMR × activity factor.
 * Goal: bulk +10 %, cut −20 %, maintain ±0.
 * Macros: protein 2 g/kg, fat 0.8 g/kg, carbs take the remaining calories.
 */

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'bulk' | 'cut' | 'maintain';
export type Experience = 'beginner' | 'intermediate' | 'advanced';

export interface BodyProfile {
  sex: Sex;
  birthDate: string; // ISO yyyy-mm-dd
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
}

export interface NutritionTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  bmr: number;
  tdee: number;
}

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const GOAL_MULTIPLIERS: Record<Goal, number> = {
  bulk: 1.1,
  cut: 0.8,
  maintain: 1,
};

/** Safety floors so an aggressive cut never prescribes a crash diet. */
export const MIN_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };

export const LIMITS = {
  age: { min: 14, max: 90 },
  heightCm: { min: 120, max: 230 },
  weightKg: { min: 35, max: 250 },
} as const;

const PROTEIN_G_PER_KG = 2;
const FAT_G_PER_KG = 0.8;
const MIN_FAT_G_PER_KG = 0.6;

export function ageFromBirthDate(birthDate: string, today: Date = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid birth date: ${birthDate}`);
  let age = today.getFullYear() - y;
  const beforeBirthday =
    today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export function mifflinStJeor(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

const round10 = (n: number) => Math.round(n / 10) * 10;

export function validateProfile(p: BodyProfile, today: Date = new Date()): string[] {
  const errors: string[] = [];
  const inRange = (v: number, r: { min: number; max: number }) =>
    Number.isFinite(v) && v >= r.min && v <= r.max;
  let age = NaN;
  try {
    age = ageFromBirthDate(p.birthDate, today);
  } catch {
    errors.push('Fecha de nacimiento inválida');
  }
  if (!Number.isNaN(age) && !inRange(age, LIMITS.age))
    errors.push(`La edad debe estar entre ${LIMITS.age.min} y ${LIMITS.age.max} años`);
  if (!inRange(p.heightCm, LIMITS.heightCm))
    errors.push(`La altura debe estar entre ${LIMITS.heightCm.min} y ${LIMITS.heightCm.max} cm`);
  if (!inRange(p.weightKg, LIMITS.weightKg))
    errors.push(`El peso debe estar entre ${LIMITS.weightKg.min} y ${LIMITS.weightKg.max} kg`);
  return errors;
}

export function computeTargets(p: BodyProfile, today: Date = new Date()): NutritionTargets {
  const errors = validateProfile(p, today);
  if (errors.length) throw new Error(errors.join('; '));

  const age = ageFromBirthDate(p.birthDate, today);
  const bmr = mifflinStJeor(p.sex, p.weightKg, p.heightCm, age);
  const tdee = bmr * ACTIVITY_FACTORS[p.activityLevel];
  const kcal = Math.max(round10(tdee * GOAL_MULTIPLIERS[p.goal]), MIN_KCAL[p.sex]);

  const proteinG = Math.round(p.weightKg * PROTEIN_G_PER_KG);
  let fatG = Math.round(p.weightKg * FAT_G_PER_KG);
  let carbKcal = kcal - proteinG * 4 - fatG * 9;

  // Very heavy users on a cut can run out of room for carbs: trim fat first.
  if (carbKcal < 0) {
    fatG = Math.round(p.weightKg * MIN_FAT_G_PER_KG);
    carbKcal = kcal - proteinG * 4 - fatG * 9;
  }
  const carbsG = Math.max(0, Math.round(carbKcal / 4));

  return { kcal, proteinG, carbsG, fatG, bmr: Math.round(bmr), tdee: Math.round(tdee) };
}
