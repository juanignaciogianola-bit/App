import { estimateOneRepMax } from './training';
import type { Workout, WorkoutSetRow } from './types';

export interface ExerciseSummary {
  exerciseId: string;
  name: string;
  sets: WorkoutSetRow[];
  bestE1rm: number | null;
}

/** Groups a workout's sets by exercise, in the order they were performed. */
export function summarizeWorkout(w: Workout) {
  const groups = new Map<number, ExerciseSummary>();
  let volume = 0;
  for (const s of [...w.workout_sets].sort((a, b) => a.exercise_position - b.exercise_position || a.set_index - b.set_index)) {
    volume += Number(s.weight_kg) * s.reps;
    const g = groups.get(s.exercise_position) ?? { exerciseId: s.exercise_id, name: s.exercise?.name ?? 'Ejercicio', sets: [], bestE1rm: null };
    g.sets.push(s);
    const e = estimateOneRepMax(Number(s.weight_kg), s.reps);
    if (e !== null && (g.bestE1rm === null || e > g.bestE1rm)) g.bestE1rm = e;
    groups.set(s.exercise_position, g);
  }
  return {
    exercises: [...groups.values()],
    volume: Math.round(volume),
    sets: w.workout_sets.length,
    durationMs: new Date(w.ended_at).getTime() - new Date(w.started_at).getTime(),
  };
}
