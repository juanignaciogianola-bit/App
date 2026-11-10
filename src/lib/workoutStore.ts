import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { parseDecimal } from './training';

/**
 * The workout in progress. Lives only on the device (persisted, so closing the
 * app mid-session does not lose it) until it is finished and sent to Supabase.
 */

export interface DraftSet {
  key: string;
  weight: string; // raw text input, parsed on finish
  reps: string;
  done: boolean;
}

export interface DraftExercise {
  key: string;
  exerciseId: string;
  name: string;
  sets: DraftSet[];
}

export interface ActiveWorkout {
  name: string;
  routineId: string | null;
  startedAt: number;
  exercises: DraftExercise[];
}

export interface FinishPayload {
  p_name: string;
  p_routine_id: string | null;
  p_started_at: string;
  p_ended_at: string;
  p_sets: { exercise_id: string; exercise_position: number; set_index: number; reps: number; weight_kg: number }[];
}

interface WorkoutState {
  active: ActiveWorkout | null;
  start: (opts?: {
    name?: string;
    routineId?: string | null;
    exercises?: { exerciseId: string; name: string; sets?: number }[];
    now?: number;
  }) => void;
  addExercises: (items: { exerciseId: string; name: string }[]) => void;
  removeExercise: (exKey: string) => void;
  moveExercise: (exKey: string, dir: -1 | 1) => void;
  addSet: (exKey: string) => void;
  removeSet: (exKey: string, setKey: string) => void;
  updateSet: (exKey: string, setKey: string, patch: Partial<Pick<DraftSet, 'weight' | 'reps'>>) => void;
  toggleSet: (exKey: string, setKey: string) => void;
  rename: (name: string) => void;
  discard: () => void;
}

let counter = 0;
const uid = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;
const emptySet = (prev?: DraftSet): DraftSet => ({ key: uid(), weight: prev?.weight ?? '', reps: prev?.reps ?? '', done: false });

// localStorage exists on web and on native (expo-sqlite polyfill); not in tests.
const storage = createJSONStorage(() =>
  typeof localStorage === 'undefined'
    ? { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    : localStorage,
);

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set) => {
      const mapEx = (exKey: string, fn: (e: DraftExercise) => DraftExercise) =>
        set((s) =>
          s.active ? { active: { ...s.active, exercises: s.active.exercises.map((e) => (e.key === exKey ? fn(e) : e)) } } : s,
        );
      return {
        active: null,
        start: ({ name = 'Entrenamiento', routineId = null, exercises = [], now = Date.now() } = {}) =>
          set({
            active: {
              name,
              routineId,
              startedAt: now,
              exercises: exercises.map((e) => ({
                key: uid(),
                exerciseId: e.exerciseId,
                name: e.name,
                sets: Array.from({ length: Math.max(1, e.sets ?? 1) }, () => emptySet()),
              })),
            },
          }),
        addExercises: (items) =>
          set((s) =>
            s.active
              ? {
                  active: {
                    ...s.active,
                    exercises: [
                      ...s.active.exercises,
                      ...items.map((i) => ({ key: uid(), exerciseId: i.exerciseId, name: i.name, sets: [emptySet()] })),
                    ],
                  },
                }
              : s,
          ),
        removeExercise: (exKey) =>
          set((s) => (s.active ? { active: { ...s.active, exercises: s.active.exercises.filter((e) => e.key !== exKey) } } : s)),
        moveExercise: (exKey, dir) =>
          set((s) => {
            if (!s.active) return s;
            const list = [...s.active.exercises];
            const i = list.findIndex((e) => e.key === exKey);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= list.length) return s;
            [list[i], list[j]] = [list[j], list[i]];
            return { active: { ...s.active, exercises: list } };
          }),
        // A new set starts with the previous set's values: the common case is repeating them.
        addSet: (exKey) => mapEx(exKey, (e) => ({ ...e, sets: [...e.sets, emptySet(e.sets[e.sets.length - 1])] })),
        removeSet: (exKey, setKey) => mapEx(exKey, (e) => ({ ...e, sets: e.sets.filter((x) => x.key !== setKey) })),
        updateSet: (exKey, setKey, patch) =>
          mapEx(exKey, (e) => ({ ...e, sets: e.sets.map((x) => (x.key === setKey ? { ...x, ...patch } : x)) })),
        toggleSet: (exKey, setKey) =>
          mapEx(exKey, (e) => ({
            ...e,
            sets: e.sets.map((x) => (x.key === setKey ? { ...x, done: !x.done && isSetValid(x) } : x)),
          })),
        rename: (name) => set((s) => (s.active ? { active: { ...s.active, name } } : s)),
        discard: () => set({ active: null }),
      };
    },
    { name: 'forma.active-workout', storage, version: 1 },
  ),
);

/** A set can be checked off only with whole reps ≥ 1 and a weight ≥ 0 (blank = bodyweight). */
export function isSetValid(s: Pick<DraftSet, 'weight' | 'reps'>): boolean {
  const reps = Number(s.reps);
  const weight = s.weight.trim() === '' ? 0 : parseDecimal(s.weight);
  return Number.isInteger(reps) && reps >= 1 && reps <= 200 && Number.isFinite(weight) && weight >= 0 && weight <= 1000;
}

/** Only completed sets are saved; exercises with none are dropped and positions compacted. */
export function buildFinishPayload(w: ActiveWorkout, now: number = Date.now()): FinishPayload {
  const sets: FinishPayload['p_sets'] = [];
  let position = 0;
  for (const ex of w.exercises) {
    const done = ex.sets.filter((s) => s.done && isSetValid(s));
    if (!done.length) continue;
    done.forEach((s, i) =>
      sets.push({
        exercise_id: ex.exerciseId,
        exercise_position: position,
        set_index: i,
        reps: Number(s.reps),
        weight_kg: s.weight.trim() === '' ? 0 : parseDecimal(s.weight),
      }),
    );
    position++;
  }
  return {
    p_name: w.name,
    p_routine_id: w.routineId,
    p_started_at: new Date(w.startedAt).toISOString(),
    p_ended_at: new Date(Math.max(now, w.startedAt)).toISOString(),
    p_sets: sets,
  };
}

export function workoutTotals(w: ActiveWorkout) {
  let sets = 0;
  let volume = 0;
  for (const ex of w.exercises)
    for (const s of ex.sets)
      if (s.done) {
        sets++;
        volume += (parseDecimal(s.weight) || 0) * Number(s.reps);
      }
  return { sets, volume: Math.round(volume) };
}
