import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFinishWorkout, useLastSets } from '@/lib/api';
import { confirm, notify } from '@/lib/confirm';
import { formatClock } from '@/lib/training';
import { buildFinishPayload, isSetValid, useWorkoutStore, workoutTotals, type DraftExercise } from '@/lib/workoutStore';
import type { WorkoutSetRow } from '@/lib/types';
import { Button, Card, Screen, Text } from '@/components/ui';
import { colors, radius, space } from '@/theme';

function useClock(since: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now - since;
}

export default function ActiveWorkout() {
  const active = useWorkoutStore((s) => s.active);
  const rename = useWorkoutStore((s) => s.rename);
  const discard = useWorkoutStore((s) => s.discard);
  const finish = useFinishWorkout();
  const last = useLastSets(active?.exercises.map((e) => e.exerciseId) ?? []);
  const elapsed = useClock(active?.startedAt ?? Date.now());
  const [saved, setSaved] = useState(false);

  // After saving, the store is cleared while we navigate to the summary.
  if (!active) return saved ? null : <Redirect href="/train" />;

  const totals = workoutTotals(active);

  async function onFinish() {
    const payload = buildFinishPayload(active!);
    if (payload.p_sets.length === 0) {
      notify('Nada para guardar', 'Marcá al menos una serie como hecha (✓) antes de terminar.');
      return;
    }
    const pending = active!.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.done).length, 0);
    if (pending > 0 && !(await confirm('Terminar entrenamiento', `Hay ${pending} serie(s) sin marcar; no se van a guardar.`, 'Terminar', false))) return;
    try {
      const id = await finish.mutateAsync(payload);
      setSaved(true);
      router.replace({ pathname: '/workout/[id]', params: { id } });
      discard();
    } catch (e) {
      notify('No se pudo guardar', e instanceof Error ? e.message : 'Intentá de nuevo.');
    }
  }

  async function onDiscard() {
    if (await confirm('Descartar entrenamiento', 'Se pierden todas las series de esta sesión.', 'Descartar')) {
      discard();
      router.back();
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.md }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-down" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text testID="clock" variant="h3" style={{ fontVariant: ['tabular-nums'] }}>{formatClock(elapsed)}</Text>
          <Text variant="small" muted>{totals.sets} series · {totals.volume} kg</Text>
        </View>
        <Button testID="finish-workout" title="Terminar" onPress={onFinish} loading={finish.isPending} style={{ height: 40, paddingHorizontal: space.lg }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          <TextInput
            testID="workout-name"
            value={active.name}
            onChangeText={rename}
            maxLength={60}
            selectionColor={colors.accent}
            style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}
          />

          {active.exercises.map((ex, i) => (
            <ExerciseCard key={ex.key} ex={ex} index={i} count={active.exercises.length} previous={last.data?.[ex.exerciseId]} />
          ))}

          <Button
            testID="workout-add-exercise"
            title="Agregar ejercicio"
            variant="secondary"
            onPress={() => router.push({ pathname: '/exercise-picker', params: { mode: 'workout' } })}
          />
          <Button title="Descartar entrenamiento" variant="danger" onPress={onDiscard} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ExerciseCard({ ex, index, count, previous }: { ex: DraftExercise; index: number; count: number; previous?: WorkoutSetRow[] }) {
  const { addSet, removeSet, updateSet, toggleSet, removeExercise, moveExercise } = useWorkoutStore.getState();
  return (
    <Card style={{ gap: space.sm, paddingHorizontal: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Text variant="h3" style={{ flex: 1, color: colors.accent }}>{ex.name}</Text>
        <Pressable disabled={index === 0} onPress={() => moveExercise(ex.key, -1)} hitSlop={6} style={{ opacity: index === 0 ? 0.3 : 1 }}>
          <Ionicons name="arrow-up" size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable disabled={index === count - 1} onPress={() => moveExercise(ex.key, 1)} hitSlop={6} style={{ opacity: index === count - 1 ? 0.3 : 1 }}>
          <Ionicons name="arrow-down" size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable onPress={() => removeExercise(ex.key)} hitSlop={6}>
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text variant="caption" muted style={{ width: 28, textAlign: 'center' }}>#</Text>
        <Text variant="caption" muted style={{ flex: 1 }}>Anterior</Text>
        <Text variant="caption" muted style={{ width: 64, textAlign: 'center' }}>Kg</Text>
        <Text variant="caption" muted style={{ width: 52, textAlign: 'center' }}>Reps</Text>
        <View style={{ width: 36 }} />
      </View>

      {ex.sets.map((s, i) => {
        const prev = previous?.[i];
        const valid = isSetValid(s);
        return (
          <View
            key={s.key}
            testID={`set-${ex.name}-${i}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              paddingVertical: 4,
              borderRadius: radius.sm,
              backgroundColor: s.done ? 'rgba(198,244,50,0.08)' : 'transparent',
            }}
          >
            <Pressable onLongPress={() => removeSet(ex.key, s.key)} style={{ width: 28 }}>
              <Text variant="h3" muted style={{ textAlign: 'center' }}>{i + 1}</Text>
            </Pressable>
            <Pressable
              style={{ flex: 1 }}
              disabled={!prev}
              onPress={() => prev && updateSet(ex.key, s.key, { weight: String(Number(prev.weight_kg)), reps: String(prev.reps) })}
            >
              <Text variant="small" muted>{prev ? `${Number(prev.weight_kg)} × ${prev.reps}` : '—'}</Text>
            </Pressable>
            <SetInput testID={`kg-${ex.name}-${i}`} width={64} value={s.weight} placeholder={prev ? String(Number(prev.weight_kg)) : '0'} onChange={(t) => updateSet(ex.key, s.key, { weight: t })} decimal />
            <SetInput testID={`reps-${ex.name}-${i}`} width={52} value={s.reps} placeholder={prev ? String(prev.reps) : '0'} onChange={(t) => updateSet(ex.key, s.key, { reps: t })} />
            <Pressable
              testID={`done-${ex.name}-${i}`}
              onPress={() => toggleSet(ex.key, s.key)}
              hitSlop={6}
              style={{
                width: 36,
                height: 32,
                borderRadius: radius.sm,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: s.done ? colors.accent : colors.surfaceHigh,
                opacity: valid || s.done ? 1 : 0.5,
              }}
            >
              <Ionicons name="checkmark" size={20} color={s.done ? colors.accentText : colors.textMuted} />
            </Pressable>
          </View>
        );
      })}

      <Pressable testID={`add-set-${ex.name}`} onPress={() => addSet(ex.key)} style={{ paddingVertical: space.sm }}>
        <Text style={{ color: colors.accent, textAlign: 'center' }}>+ Agregar serie</Text>
      </Pressable>
      {ex.sets.length > 1 ? (
        <Text variant="small" style={{ color: colors.textFaint, textAlign: 'center' }}>Mantené apretado el número para borrar una serie</Text>
      ) : null}
    </Card>
  );
}

function SetInput({
  value,
  onChange,
  placeholder,
  width,
  decimal,
  testID,
}: {
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  width: number;
  decimal?: boolean;
  testID?: string;
}) {
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={(t) => onChange(decimal ? t.replace(/[^0-9.,]/g, '') : t.replace(/\D/g, ''))}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      selectTextOnFocus
      maxLength={decimal ? 6 : 3}
      style={{
        width,
        height: 34,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceHigh,
        color: colors.text,
        textAlign: 'center',
        fontSize: 16,
        fontWeight: '600',
      }}
    />
  );
}
