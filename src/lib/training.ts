import type { Experience } from './nutrition';

/** Weekly weighted sets per muscle considered productive, by experience. */
export const VOLUME_TARGETS: Record<Experience, { min: number; max: number }> = {
  beginner: { min: 6, max: 10 },
  intermediate: { min: 10, max: 16 },
  advanced: { min: 12, max: 20 },
};

export type VolumeStatus = 'none' | 'low' | 'optimal' | 'high';

export function volumeStatus(sets: number, experience: Experience): VolumeStatus {
  const { min, max } = VOLUME_TARGETS[experience];
  if (sets <= 0) return 'none';
  if (sets < min) return 'low';
  if (sets <= max) return 'optimal';
  return 'high';
}

/** Epley estimated one-rep max; null outside the 1–12 rep range where it is reliable. */
export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (reps < 1 || reps > 12 || weightKg <= 0) return null;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

/** Monday 00:00 local time of the week containing `date`, and the next Monday. */
export function weekBounds(date: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (from.getDay() + 6) % 7; // Monday = 0
  from.setDate(from.getDate() - offset);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from, to };
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Parses user input like "82,5" or "82.5"; returns NaN for anything else. */
export function parseDecimal(input: string): number {
  const t = input.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export const EQUIPMENT_LABEL: Record<string, string> = {
  barbell: 'Barra',
  dumbbell: 'Mancuernas',
  machine: 'Máquina',
  cable: 'Polea',
  bodyweight: 'Peso corporal',
  kettlebell: 'Kettlebell',
  band: 'Banda',
  other: 'Otro',
};
