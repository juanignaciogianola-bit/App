// Pure module (no imports): shared by the analyze-meal edge function (Deno) and Jest.

export const MEAL_SYSTEM_PROMPT = `You are a nutrition estimator inside a calorie-tracking app.
You receive one photo of food and, optionally, a short note from the user.

Identify each distinct food or drink and estimate, per item:
- grams: the edible portion visible in the photo (use plate, cutlery and hands for scale)
- kcal, protein_g, carbs_g, fat_g for that portion

Guidelines:
- Name items in Rioplatense Spanish, short and specific ("Milanesa de carne", "Puré de papa", "Coca-Cola común").
- Include cooking fats and sauces you can see or that the preparation clearly implies (fried, buttered, dressed) as part of the item or as their own item.
- If the user's note gives brand, quantity or preparation, trust it over the photo.
- Keep kcal consistent with macros (about 4 kcal/g protein and carbs, 9 kcal/g fat; alcohol 7 kcal/g).
- When unsure between two portion sizes, choose the more likely one and lower the confidence; never inflate or deflate on purpose.
- confidence: "high" when items and portions are clearly visible, "medium" for typical uncertainty, "low" when the food is hidden, mixed or the photo is poor.
- notes: one short sentence in Spanish about the main assumption (e.g. "Asumí 1 cucharada de aceite en la ensalada"), or "" if none.
- If the photo does not show food or drink, set is_food to false, items to [] and explain briefly in notes.`;

export const MEAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_food', 'meal_name', 'items', 'confidence', 'notes'],
  properties: {
    is_food: { type: 'boolean' },
    meal_name: { type: 'string', description: 'Short name for the whole meal, in Spanish' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
        },
      },
    },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    notes: { type: 'string' },
  },
} as const;

export interface MealItemEstimate {
  name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface MealEstimate {
  is_food: boolean;
  meal_name: string;
  items: MealItemEstimate[];
  confidence: 'low' | 'medium' | 'high';
  notes: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: unknown, max: number) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return round1(Math.min(max, Math.max(0, v)));
};
const text = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

/**
 * Validates and sanitises model output. Throws if the shape is wrong; clamps
 * numbers into the ranges the database accepts so a save can never fail on them.
 */
export function normalizeMealEstimate(raw: unknown): MealEstimate {
  if (!raw || typeof raw !== 'object') throw new Error('estimate is not an object');
  const r = raw as Record<string, unknown>;
  if (typeof r.is_food !== 'boolean' || !Array.isArray(r.items)) throw new Error('estimate is missing fields');
  const items = (r.items as Record<string, unknown>[])
    .map((i) => ({
      name: text(i?.name, 80),
      grams: clamp(i?.grams, 5000),
      kcal: clamp(i?.kcal, 10000),
      protein_g: clamp(i?.protein_g, 1000),
      carbs_g: clamp(i?.carbs_g, 1000),
      fat_g: clamp(i?.fat_g, 1000),
    }))
    .filter((i) => i.name.length > 0)
    .slice(0, 20);
  const confidence = ['low', 'medium', 'high'].includes(r.confidence as string)
    ? (r.confidence as MealEstimate['confidence'])
    : 'low';
  const isFood = r.is_food && items.length > 0;
  return {
    is_food: isFood,
    meal_name: text(r.meal_name, 80) || items[0]?.name || 'Comida',
    items: isFood ? items : [],
    confidence,
    notes: text(r.notes, 300),
  };
}

/** Accepts only "<user id>/<file>.<jpg|jpeg|png|webp>" so users can only analyse their own uploads. */
export function isOwnPhotoPath(path: unknown, userId: string): path is string {
  return (
    typeof path === 'string' &&
    path.length < 200 &&
    path.startsWith(`${userId}/`) &&
    /^[0-9a-f-]{36}\/[A-Za-z0-9_-]+\.(jpe?g|png|webp)$/.test(path)
  );
}

export function mediaTypeFor(path: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
