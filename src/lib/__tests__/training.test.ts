import { estimateOneRepMax, formatClock, parseDecimal, volumeStatus, weekBounds } from '../training';
import { buildFinishPayload, isSetValid, useWorkoutStore, workoutTotals } from '../workoutStore';

describe('training helpers', () => {
  it('classifies weekly volume by experience', () => {
    expect(volumeStatus(0, 'beginner')).toBe('none');
    expect(volumeStatus(4, 'beginner')).toBe('low');
    expect(volumeStatus(8, 'beginner')).toBe('optimal');
    expect(volumeStatus(8, 'advanced')).toBe('low');
    expect(volumeStatus(21, 'advanced')).toBe('high');
  });

  it('estimates 1RM with Epley and ignores unreliable rep ranges', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 8)).toBe(126.7);
    expect(estimateOneRepMax(100, 20)).toBeNull();
    expect(estimateOneRepMax(0, 10)).toBeNull();
  });

  it('computes Monday-based local weeks', () => {
    const { from, to } = weekBounds(new Date(2026, 10, 12, 15)); // Thursday 12 Nov
    expect([from.getFullYear(), from.getMonth(), from.getDate(), from.getHours()]).toEqual([2026, 10, 9, 0]);
    expect(to.getDate()).toBe(16);
    expect(weekBounds(new Date(2026, 10, 15, 23)).from.getDate()).toBe(9); // Sunday stays in the same week
    expect(weekBounds(new Date(2026, 10, 9, 0)).from.getDate()).toBe(9); // Monday 00:00
  });

  it('parses decimal input with comma or dot', () => {
    expect(parseDecimal('82,5')).toBe(82.5);
    expect(parseDecimal(' 100 ')).toBe(100);
    expect(parseDecimal('1e3')).toBeNaN();
    expect(parseDecimal('-5')).toBeNaN();
  });

  it('formats the workout clock', () => {
    expect(formatClock(65_000)).toBe('01:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });
});

describe('workout store', () => {
  const s = () => useWorkoutStore.getState();
  beforeEach(() => s().discard());

  it('starts from a routine with the target number of empty sets', () => {
    s().start({ name: 'Push', routineId: 'r1', exercises: [{ exerciseId: 'bench', name: 'Press banca', sets: 3 }], now: 0 });
    expect(s().active?.exercises[0].sets).toHaveLength(3);
    expect(s().active?.routineId).toBe('r1');
  });

  it('copies the previous set values when adding a set', () => {
    s().start({ exercises: [{ exerciseId: 'bench', name: 'Press banca' }] });
    const ex = s().active!.exercises[0];
    s().updateSet(ex.key, ex.sets[0].key, { weight: '80', reps: '8' });
    s().addSet(ex.key);
    const sets = s().active!.exercises[0].sets;
    expect(sets[1]).toMatchObject({ weight: '80', reps: '8', done: false });
  });

  it('only checks off valid sets', () => {
    s().start({ exercises: [{ exerciseId: 'bench', name: 'Press banca' }] });
    const ex = s().active!.exercises[0];
    s().toggleSet(ex.key, ex.sets[0].key);
    expect(s().active!.exercises[0].sets[0].done).toBe(false); // empty reps
    s().updateSet(ex.key, ex.sets[0].key, { reps: '10' });
    s().toggleSet(ex.key, ex.sets[0].key);
    expect(s().active!.exercises[0].sets[0].done).toBe(true); // blank weight = bodyweight
    expect(isSetValid({ weight: 'abc', reps: '5' })).toBe(false);
    expect(isSetValid({ weight: '20', reps: '2.5' })).toBe(false);
  });

  it('reorders exercises within bounds', () => {
    s().start({ exercises: [{ exerciseId: 'a', name: 'A' }, { exerciseId: 'b', name: 'B' }] });
    const [a] = s().active!.exercises;
    s().moveExercise(a.key, -1); // no-op at the top
    expect(s().active!.exercises.map((e) => e.exerciseId)).toEqual(['a', 'b']);
    s().moveExercise(a.key, 1);
    expect(s().active!.exercises.map((e) => e.exerciseId)).toEqual(['b', 'a']);
  });

  it('builds a payload with only completed sets and compacted positions', () => {
    s().start({
      name: 'Pull',
      now: Date.UTC(2026, 10, 10, 18),
      exercises: [
        { exerciseId: 'skipped', name: 'Nada', sets: 2 },
        { exerciseId: 'row', name: 'Remo', sets: 2 },
      ],
    });
    const row = s().active!.exercises[1];
    s().updateSet(row.key, row.sets[0].key, { weight: '60,5', reps: '10' });
    s().toggleSet(row.key, row.sets[0].key);
    s().updateSet(row.key, row.sets[1].key, { weight: '60', reps: '9' }); // not checked
    const payload = buildFinishPayload(s().active!, Date.UTC(2026, 10, 10, 19));
    expect(payload.p_sets).toEqual([
      { exercise_id: 'row', exercise_position: 0, set_index: 0, reps: 10, weight_kg: 60.5 },
    ]);
    expect(payload.p_started_at).toBe('2026-11-10T18:00:00.000Z');
    expect(payload.p_ended_at).toBe('2026-11-10T19:00:00.000Z');
    expect(workoutTotals(s().active!)).toEqual({ sets: 1, volume: 605 });
  });
});
