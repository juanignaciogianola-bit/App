export type MuscleId =
  | 'chest' | 'front_delts' | 'side_delts' | 'rear_delts' | 'biceps' | 'triceps' | 'forearms'
  | 'abs' | 'obliques' | 'traps' | 'lats' | 'upper_back' | 'lower_back' | 'glutes' | 'quads'
  | 'hamstrings' | 'adductors' | 'calves';

export interface MuscleGroup {
  id: MuscleId;
  name: string;
  region: 'front' | 'back';
  position: number;
}

export interface Exercise {
  id: string;
  name: string;
  equipment: string;
  owner_id: string | null;
  exercise_muscles: { muscle_id: MuscleId; role: 'primary' | 'secondary' }[];
}

export interface RoutineExercise {
  id: string;
  routine_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  rep_min: number;
  rep_max: number;
  source: 'manual' | 'ai_suggestion';
  exercise: Pick<Exercise, 'id' | 'name' | 'equipment'>;
}

export interface Routine {
  id: string;
  name: string;
  notes: string | null;
  position: number;
  routine_exercises: RoutineExercise[];
}

export interface WorkoutSetRow {
  id: string;
  workout_id: string;
  exercise_id: string;
  exercise_position: number;
  set_index: number;
  reps: number;
  weight_kg: number;
  rpe: number | null;
  exercise?: { name: string };
}

export interface Workout {
  id: string;
  name: string;
  routine_id: string | null;
  started_at: string;
  ended_at: string;
  workout_sets: WorkoutSetRow[];
}

export interface ProgressPoint {
  workout_id: string;
  performed_at: string;
  top_weight_kg: number;
  best_e1rm_kg: number | null;
  volume_kg: number;
  sets: number;
}
