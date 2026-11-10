import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { weekBounds } from './training';
import type { FinishPayload } from './workoutStore';
import type { Exercise, MuscleGroup, MuscleId, ProgressPoint, Routine, Workout, WorkoutSetRow } from './types';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

// Untyped client (no generated DB types): results are cast to our hand-written types.
function unwrap<T = unknown>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const keys = {
  muscles: ['muscles'] as const,
  exercises: ['exercises'] as const,
  routines: ['routines'] as const,
  routine: (id: string) => ['routines', id] as const,
  workouts: ['workouts'] as const,
  workout: (id: string) => ['workouts', id] as const,
  volume: (from: string) => ['volume', from] as const,
  progress: (exerciseId: string) => ['progress', exerciseId] as const,
  lastSets: (ids: string[]) => ['lastSets', ...ids] as const,
};

// Catalog -------------------------------------------------------------------------
export function useMuscles() {
  return useQuery({
    queryKey: keys.muscles,
    staleTime: Infinity,
    queryFn: async () =>
      unwrap<MuscleGroup[]>(await supabase.from('muscle_groups').select('*').order('position')),
  });
}

export function useExercises() {
  return useQuery({
    queryKey: keys.exercises,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      unwrap<Exercise[]>(
        await supabase
          .from('exercises')
          .select('id, name, equipment, owner_id, exercise_muscles(muscle_id, role)')
          .order('name'),
      ),
  });
}

export function useCreateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; equipment: string; primary: MuscleId[]; secondary: MuscleId[] }) => {
      const { data: auth } = await supabase.auth.getUser();
      const ex = unwrap<{ id: string }>(
        await supabase
          .from('exercises')
          .insert({ name: input.name.trim(), equipment: input.equipment, owner_id: auth.user?.id })
          .select('id')
          .single(),
      );
      const muscles = [
        ...input.primary.map((m) => ({ exercise_id: ex.id, muscle_id: m, role: 'primary' })),
        ...input.secondary.filter((m) => !input.primary.includes(m)).map((m) => ({ exercise_id: ex.id, muscle_id: m, role: 'secondary' })),
      ];
      if (muscles.length) unwrap(await supabase.from('exercise_muscles').insert(muscles));
      return ex.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.exercises }),
  });
}

// Routines ------------------------------------------------------------------------
const ROUTINE_SELECT =
  'id, name, notes, position, routine_exercises(id, routine_id, exercise_id, position, target_sets, rep_min, rep_max, source, exercise:exercises(id, name, equipment))';

const sortRoutine = (r: Routine): Routine => ({
  ...r,
  routine_exercises: [...r.routine_exercises].sort((a, b) => a.position - b.position),
});

export function useRoutines() {
  return useQuery({
    queryKey: keys.routines,
    queryFn: async () =>
      unwrap<Routine[]>(
        await supabase.from('routines').select(ROUTINE_SELECT).order('position').order('created_at'),
      ).map(sortRoutine),
  });
}

export function useRoutine(id: string | undefined) {
  return useQuery({
    queryKey: keys.routine(id ?? ''),
    enabled: !!id,
    queryFn: async () =>
      sortRoutine(unwrap<Routine>(await supabase.from('routines').select(ROUTINE_SELECT).eq('id', id!).single())),
  });
}

export function useRoutineMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: keys.routines });
  return {
    create: useMutation({
      mutationFn: async (name: string) =>
        unwrap<{ id: string }>(await supabase.from('routines').insert({ name: name.trim() }).select('id').single()).id,
      onSuccess: invalidate,
    }),
    rename: useMutation({
      mutationFn: async ({ id, name }: { id: string; name: string }) =>
        unwrap(await supabase.from('routines').update({ name: name.trim() }).eq('id', id)),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await supabase.from('routines').delete().eq('id', id)),
      onSuccess: invalidate,
    }),
    addExercises: useMutation({
      mutationFn: async ({ routineId, exerciseIds, startPosition }: { routineId: string; exerciseIds: string[]; startPosition: number }) =>
        unwrap(
          await supabase.from('routine_exercises').insert(
            exerciseIds.map((exercise_id, i) => ({ routine_id: routineId, exercise_id, position: startPosition + i })),
          ),
        ),
      onSuccess: invalidate,
    }),
    updateExercise: useMutation({
      mutationFn: async ({ id, ...patch }: { id: string; target_sets?: number; rep_min?: number; rep_max?: number }) =>
        unwrap(await supabase.from('routine_exercises').update(patch).eq('id', id)),
      onSuccess: invalidate,
    }),
    removeExercise: useMutation({
      mutationFn: async (id: string) => unwrap(await supabase.from('routine_exercises').delete().eq('id', id)),
      onSuccess: invalidate,
    }),
    reorder: useMutation({
      mutationFn: async (orderedIds: string[]) => {
        await Promise.all(
          orderedIds.map(async (id, position) =>
            unwrap(await supabase.from('routine_exercises').update({ position }).eq('id', id)),
          ),
        );
      },
      onSuccess: invalidate,
    }),
  };
}

// Workouts ------------------------------------------------------------------------
const WORKOUT_SELECT =
  'id, name, routine_id, started_at, ended_at, workout_sets(id, workout_id, exercise_id, exercise_position, set_index, reps, weight_kg, rpe, exercise:exercises(name))';

export function useWorkouts(limit = 50) {
  return useQuery({
    queryKey: keys.workouts,
    queryFn: async () =>
      unwrap<Workout[]>(
        await supabase.from('workouts').select(WORKOUT_SELECT).order('started_at', { ascending: false }).limit(limit),
      ),
  });
}

export function useWorkout(id: string | undefined) {
  return useQuery({
    queryKey: keys.workout(id ?? ''),
    enabled: !!id,
    queryFn: async () => unwrap<Workout>(await supabase.from('workouts').select(WORKOUT_SELECT).eq('id', id!).single()),
  });
}

export function useFinishWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: FinishPayload) =>
      unwrap<string>(await supabase.rpc('finish_workout', payload)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.workouts });
      qc.invalidateQueries({ queryKey: ['volume'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['lastSets'] });
    },
  });
}

export function useDeleteWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('workouts').delete().eq('id', id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.workouts });
      qc.invalidateQueries({ queryKey: ['volume'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

/** Sets from the most recent session of each exercise, to show "last time" hints. */
export function useLastSets(exerciseIds: string[]) {
  const ids = [...new Set(exerciseIds)].sort();
  return useQuery({
    queryKey: keys.lastSets(ids),
    enabled: ids.length > 0,
    queryFn: async () => {
      const rows = unwrap<(WorkoutSetRow & { workout: { started_at: string } })[]>(
        await supabase
          .from('workout_sets')
          .select('exercise_id, workout_id, set_index, reps, weight_kg, workout:workouts(started_at)')
          .in('exercise_id', ids)
          .order('created_at', { ascending: false })
          .limit(500),
      );
      const byExercise: Record<string, WorkoutSetRow[]> = {};
      const latestWorkout: Record<string, string> = {};
      for (const r of rows) {
        latestWorkout[r.exercise_id] ??= r.workout_id;
        if (latestWorkout[r.exercise_id] === r.workout_id) (byExercise[r.exercise_id] ??= []).push(r);
      }
      for (const k of Object.keys(byExercise)) byExercise[k].sort((a, b) => a.set_index - b.set_index);
      return byExercise;
    },
  });
}

// Analytics -----------------------------------------------------------------------
export function useWeeklyVolume(date: Date = new Date()) {
  const { from, to } = weekBounds(date);
  return useQuery({
    queryKey: keys.volume(from.toISOString()),
    queryFn: async () => {
      const rows = unwrap<{ muscle_id: MuscleId; sets: number }[]>(
        await supabase.rpc('muscle_volume', { p_from: from.toISOString(), p_to: to.toISOString() }),
      );
      return Object.fromEntries(rows.map((r) => [r.muscle_id, Number(r.sets)])) as Partial<Record<MuscleId, number>>;
    },
  });
}

export function useExerciseProgress(exerciseId: string | undefined) {
  return useQuery({
    queryKey: keys.progress(exerciseId ?? ''),
    enabled: !!exerciseId,
    queryFn: async () =>
      unwrap<ProgressPoint[]>(await supabase.rpc('exercise_progress', { p_exercise_id: exerciseId })).map((p) => ({
        ...p,
        top_weight_kg: Number(p.top_weight_kg),
        best_e1rm_kg: p.best_e1rm_kg === null ? null : Number(p.best_e1rm_kg),
        volume_kg: Number(p.volume_kg),
      })),
  });
}

export function useWeekWorkoutCount(date: Date = new Date()) {
  const { from, to } = weekBounds(date);
  return useQuery({
    queryKey: ['workouts', 'week', from.toISOString()],
    queryFn: async () => {
      const res = await supabase
        .from('workouts')
        .select('id', { count: 'exact', head: true })
        .gte('started_at', from.toISOString())
        .lt('started_at', to.toISOString());
      if (res.error) throw new Error(res.error.message);
      return res.count ?? 0;
    },
  });
}

// Chart aggregates (grouped by the device's local calendar) ----------------------------
export const deviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function useNutritionDaily(end: Date, days = 7) {
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1));
  const from = isoDay(start);
  const to = isoDay(end);
  return useQuery({
    queryKey: ['meals', 'daily', from, to],
    queryFn: async () =>
      unwrap<{ day: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }[]>(
        await supabase.rpc('nutrition_daily', { p_from: from, p_to: to, p_tz: deviceTimeZone() }),
      ).map((r) => ({ ...r, kcal: Number(r.kcal), protein_g: Number(r.protein_g), carbs_g: Number(r.carbs_g), fat_g: Number(r.fat_g) })),
  });
}

export function useTrainingWeekly(weeks = 8) {
  return useQuery({
    queryKey: ['workouts', 'weekly', weeks],
    queryFn: async () =>
      unwrap<{ week_start: string; sessions: number; sets: number; volume_kg: number }[]>(
        await supabase.rpc('training_weekly', { p_weeks: weeks, p_tz: deviceTimeZone() }),
      ).map((r) => ({ ...r, volume_kg: Number(r.volume_kg) })),
  });
}

export { isoDay };
