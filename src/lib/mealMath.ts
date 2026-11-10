export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Desayuno' },
  { value: 'lunch', label: 'Almuerzo' },
  { value: 'snack', label: 'Merienda' },
  { value: 'dinner', label: 'Cena' },
];

export const MEAL_TYPE_LABEL: Record<MealType, string> = Object.fromEntries(
  MEAL_TYPES.map((m) => [m.value, m.label]),
) as Record<MealType, string>;

/** Sensible default for the time of day (Uruguay/Argentina meal times). */
export function mealTypeForHour(hour: number): MealType {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 20) return 'snack';
  return 'dinner';
}

export interface EditableItem {
  key: string;
  name: string;
  grams: string;
  kcal: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  edited: boolean;
}

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
const fmt = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Changing the portion rescales kcal and macros proportionally, which is what
 * people expect when correcting "it was 150 g, not 200 g".
 */
export function rescaleItem(item: EditableItem, newGrams: string): EditableItem {
  const before = num(item.grams);
  const after = num(newGrams);
  if (!(before > 0) || !(after >= 0)) return { ...item, grams: newGrams, edited: true };
  const f = after / before;
  return {
    ...item,
    grams: newGrams,
    kcal: fmt(num(item.kcal) * f || 0),
    protein_g: fmt(num(item.protein_g) * f || 0),
    carbs_g: fmt(num(item.carbs_g) * f || 0),
    fat_g: fmt(num(item.fat_g) * f || 0),
    edited: true,
  };
}

export function itemIsValid(i: EditableItem): boolean {
  return (
    i.name.trim().length > 0 &&
    num(i.kcal) <= 10000 &&
    [i.protein_g, i.carbs_g, i.fat_g].every((v) => v.trim() === '' || num(v) <= 1000) &&
    (i.grams.trim() === '' || num(i.grams) <= 5000)
  );
}

export function sumItems(items: EditableItem[]) {
  const t = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const i of items) {
    t.kcal += num(i.kcal) || 0;
    t.protein_g += num(i.protein_g) || 0;
    t.carbs_g += num(i.carbs_g) || 0;
    t.fat_g += num(i.fat_g) || 0;
  }
  return { kcal: Math.round(t.kcal), protein_g: Math.round(t.protein_g), carbs_g: Math.round(t.carbs_g), fat_g: Math.round(t.fat_g) };
}

export function toSavePayload(items: EditableItem[]) {
  return items.map((i) => ({
    name: i.name.trim(),
    grams: i.grams.trim() === '' ? null : num(i.grams),
    kcal: num(i.kcal) || 0,
    protein_g: num(i.protein_g) || 0,
    carbs_g: num(i.carbs_g) || 0,
    fat_g: num(i.fat_g) || 0,
    edited: i.edited,
  }));
}

/** Local-day window [00:00, next 00:00). */
export function dayBounds(date: Date) {
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
