import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { dayBounds, type MealType } from './mealMath';
import type { MealEstimate } from '../../supabase/functions/_shared/meal';

export type { MealEstimate };

export interface MealItemRow {
  id: string;
  position: number;
  name: string;
  grams: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  edited: boolean;
}

export interface Meal {
  id: string;
  eaten_at: string;
  meal_type: MealType;
  name: string;
  photo_path: string | null;
  source: 'photo' | 'manual';
  meal_items: MealItemRow[];
}

export interface Totals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meals: number;
}

const toNum = <T extends object>(row: T, keys: (keyof T)[]) => {
  const out = { ...row };
  for (const k of keys) (out as Record<string, unknown>)[k as string] = Number(row[k] ?? 0);
  return out;
};

export const mealKeys = {
  day: (from: string) => ['meals', 'day', from] as const,
  totals: (from: string) => ['meals', 'totals', from] as const,
  one: (id: string) => ['meals', 'one', id] as const,
};

export function useDayMeals(date: Date) {
  const { from, to } = dayBounds(date);
  return useQuery({
    queryKey: mealKeys.day(from.toISOString()),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meals')
        .select('id, eaten_at, meal_type, name, photo_path, source, meal_items(id, position, name, grams, kcal, protein_g, carbs_g, fat_g, edited)')
        .gte('eaten_at', from.toISOString())
        .lt('eaten_at', to.toISOString())
        .order('eaten_at');
      if (error) throw new Error(error.message);
      return (data as unknown as Meal[]).map((m) => ({
        ...m,
        meal_items: m.meal_items
          .map((i) => toNum(i, ['kcal', 'protein_g', 'carbs_g', 'fat_g']))
          .sort((a, b) => a.position - b.position),
      }));
    },
  });
}

export function useDayTotals(date: Date) {
  const { from, to } = dayBounds(date);
  return useQuery({
    queryKey: mealKeys.totals(from.toISOString()),
    queryFn: async (): Promise<Totals> => {
      const { data, error } = await supabase.rpc('nutrition_totals', { p_from: from.toISOString(), p_to: to.toISOString() });
      if (error) throw new Error(error.message);
      const r = (data as Totals[])[0];
      return toNum(r, ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'meals']);
    },
  });
}

export function useMeal(id: string | undefined) {
  return useQuery({
    queryKey: mealKeys.one(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meals')
        .select('id, eaten_at, meal_type, name, photo_path, source, meal_items(id, position, name, grams, kcal, protein_g, carbs_g, fat_g, edited)')
        .eq('id', id!)
        .single();
      if (error) throw new Error(error.message);
      const m = data as unknown as Meal;
      return { ...m, meal_items: [...m.meal_items].sort((a, b) => a.position - b.position) };
    },
  });
}

export interface SaveMealInput {
  id?: string | null;
  eatenAt: Date;
  mealType: MealType;
  name: string;
  items: { name: string; grams: number | null; kcal: number; protein_g: number; carbs_g: number; fat_g: number; edited: boolean }[];
  photoPath?: string | null;
  source?: 'photo' | 'manual';
  aiRaw?: MealEstimate | null;
  aiModel?: string | null;
}

export function useSaveMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: SaveMealInput) => {
      const { data, error } = await supabase.rpc('save_meal', {
        p_id: m.id ?? null,
        p_eaten_at: m.eatenAt.toISOString(),
        p_meal_type: m.mealType,
        p_name: m.name.trim() || m.items[0]?.name || 'Comida',
        p_items: m.items,
        p_photo_path: m.photoPath ?? null,
        p_source: m.source ?? 'manual',
        p_ai_raw: m.aiRaw ?? null,
        p_ai_model: m.aiModel ?? null,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meals'] }),
  });
}

export function useDeleteMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (meal: Pick<Meal, 'id' | 'photo_path'>) => {
      const { error } = await supabase.from('meals').delete().eq('id', meal.id);
      if (error) throw new Error(error.message);
      if (meal.photo_path) await supabase.storage.from('meal-photos').remove([meal.photo_path]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meals'] }),
  });
}

/** Short-lived URL to show a private photo. */
export function usePhotoUrl(bucket: 'meal-photos' | 'physique-photos', path: string | null | undefined) {
  return useQuery({
    queryKey: ['photo-url', bucket, path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path!, 3600);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
  });
}

// Photo pipeline ---------------------------------------------------------------------

/** Downscale to ≤1280 px on the long side and re-encode as JPEG (fewer tokens, faster upload). */
export async function preparePhoto(uri: string, width: number, height: number, maxSide = 1280): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > maxSide) {
    ctx.resize(width >= height ? { width: maxSide } : { height: maxSide });
  }
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

export async function uploadPhoto(bucket: 'meal-photos' | 'physique-photos', uri: string, folder?: string): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sin sesión');
  const path = `${auth.user.id}/${folder ? `${folder}/` : ''}${Crypto.randomUUID()}.jpg`;
  const body = await (await fetch(uri)).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** Turns an edge-function failure into the user-facing message it carries. */
export async function functionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.message) return body.message;
    } catch {
      /* fall through */
    }
  }
  return 'No se pudo analizar la foto. Revisá tu conexión e intentá de nuevo.';
}

export async function analyzeMealPhoto(photoPath: string, note?: string): Promise<{ estimate: MealEstimate; model: string }> {
  const { data, error } = await supabase.functions.invoke('analyze-meal', { body: { photo_path: photoPath, note } });
  if (error) throw new Error(await functionErrorMessage(error));
  return data;
}
