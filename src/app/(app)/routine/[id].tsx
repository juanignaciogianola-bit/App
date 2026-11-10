import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRoutine, useRoutineMutations } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { useWorkoutStore } from '@/lib/workoutStore';
import type { RoutineExercise } from '@/lib/types';
import { Button, Card, EmptyState, Stepper, Text } from '@/components/ui';
import { colors, radius, space } from '@/theme';

export default function RoutineEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: routine, isLoading } = useRoutine(id);
  const m = useRoutineMutations();
  const [name, setName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const active = useWorkoutStore((s) => s.active);
  const start = useWorkoutStore((s) => s.start);

  useEffect(() => {
    if (routine) setName(routine.name);
  }, [routine?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !routine) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const items = routine.routine_exercises;

  function saveName() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== routine!.name) m.rename.mutate({ id: routine!.id, name: trimmed });
    else setName(routine!.name);
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const ids = items.map((x) => x.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    m.reorder.mutate(ids);
  }

  async function remove() {
    if (await confirm('Eliminar rutina', `¿Eliminar "${routine!.name}"? Tu historial de entrenamientos se conserva.`, 'Eliminar')) {
      await m.remove.mutateAsync(routine!.id);
      router.back();
    }
  }

  function startWorkout() {
    if (!active)
      start({
        name: routine!.name,
        routineId: routine!.id,
        exercises: items.map((re) => ({ exerciseId: re.exercise_id, name: re.exercise.name, sets: re.target_sets })),
      });
    router.push('/workout/active');
  }

  return (
    <>
      <Stack.Screen options={{ title: routine.name }} />
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.md }} keyboardShouldPersistTaps="handled">
        <TextInput
          testID="routine-name"
          value={name}
          onChangeText={setName}
          onBlur={saveName}
          onSubmitEditing={saveName}
          maxLength={60}
          selectionColor={colors.accent}
          style={{ color: colors.text, fontSize: 28, fontWeight: '700', paddingVertical: space.sm }}
        />

        {items.length === 0 ? (
          <EmptyState title="Rutina vacía" body="Agregá ejercicios para armarla." />
        ) : (
          items.map((re, i) => (
            <ExerciseRow
              key={re.id}
              item={re}
              index={i}
              count={items.length}
              expanded={expanded === re.id}
              onToggle={() => setExpanded(expanded === re.id ? null : re.id)}
              onMove={(dir) => move(i, dir)}
              onRemove={() => m.removeExercise.mutate(re.id)}
              onChange={(patch) => m.updateExercise.mutate({ id: re.id, ...patch })}
            />
          ))
        )}

        <Button
          testID="add-exercises"
          title="Agregar ejercicios"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/exercise-picker', params: { mode: 'routine', routineId: routine.id, startPosition: String(items.length) } })
          }
        />
        <Button testID="start-routine" title="Empezar esta rutina" onPress={startWorkout} disabled={items.length === 0} />
        <Button title="Eliminar rutina" variant="danger" onPress={remove} />
      </ScrollView>
    </>
  );
}

function ExerciseRow({
  item,
  index,
  count,
  expanded,
  onToggle,
  onMove,
  onRemove,
  onChange,
}: {
  item: RoutineExercise;
  index: number;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onChange: (patch: { target_sets?: number; rep_min?: number; rep_max?: number }) => void;
}) {
  return (
    <Card style={{ gap: space.md }}>
      <Pressable testID={`re-${item.exercise.name}`} onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text variant="h3" style={{ flexShrink: 1 }}>{item.exercise.name}</Text>
            {item.source === 'ai_suggestion' ? (
              <View style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text variant="caption" style={{ color: colors.accent }}>IA</Text>
              </View>
            ) : null}
          </View>
          <Text variant="small" muted>
            {item.target_sets} series × {item.rep_min}–{item.rep_max} reps
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>

      {expanded ? (
        <View style={{ gap: space.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            <Stepper testID="sets" label="Series" value={item.target_sets} min={1} max={10} onChange={(v) => onChange({ target_sets: v })} />
            <Stepper label="Reps mín" value={item.rep_min} min={1} max={item.rep_max} onChange={(v) => onChange({ rep_min: v })} />
            <Stepper label="Reps máx" value={item.rep_max} min={item.rep_min} max={50} onChange={(v) => onChange({ rep_max: v })} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', gap: space.lg }}>
              <IconBtn name="arrow-up" disabled={index === 0} onPress={() => onMove(-1)} />
              <IconBtn name="arrow-down" disabled={index === count - 1} onPress={() => onMove(1)} />
              <IconBtn testID={`progress-${item.exercise.name}`} name="stats-chart" onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.exercise_id } })} />
            </View>
            <IconBtn name="trash-outline" color={colors.danger} onPress={onRemove} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function IconBtn({
  name,
  onPress,
  disabled,
  color = colors.text,
  testID,
}: {
  testID?: string;
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled} hitSlop={8} style={{ opacity: disabled ? 0.3 : 1 }}>
      <Ionicons name={name} size={20} color={color} />
    </Pressable>
  );
}
