import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/lib/auth';
import { useMuscles, useRoutineMutations, useRoutines, useWeeklyVolume, useWorkouts } from '@/lib/api';
import { VOLUME_TARGETS, formatDuration, volumeStatus } from '@/lib/training';
import { useWorkoutStore } from '@/lib/workoutStore';
import type { MuscleId, Routine } from '@/lib/types';
import { BodyMap, BodyMapLegend } from '@/components/BodyMap';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { MuscleBars } from '@/components/charts/MuscleBars';
import { useTrainingWeekly } from '@/lib/api';
import { shortDate } from '@/lib/chartScale';
import { Button, Card, Chip, EmptyState, Screen, SectionHeader, Text } from '@/components/ui';
import { colors, space } from '@/theme';

const STATUS_TEXT = { none: 'sin entrenar', low: 'por debajo del objetivo', optimal: 'en rango óptimo', high: 'por encima del objetivo' };

export default function Train() {
  const { profile } = useAuth();
  const experience = profile?.experience ?? 'beginner';
  const [selected, setSelected] = useState<MuscleId | null>(null);
  const volume = useWeeklyVolume();
  const muscles = useMuscles();
  const weekly = useTrainingWeekly(8);
  const routines = useRoutines();
  const workouts = useWorkouts();
  const { create } = useRoutineMutations();
  const active = useWorkoutStore((s) => s.active);
  const start = useWorkoutStore((s) => s.start);

  const target = VOLUME_TARGETS[experience];
  const selectedSets = selected ? volume.data?.[selected] ?? 0 : 0;
  const selectedName = muscles.data?.find((m) => m.id === selected)?.name;
  const last = workouts.data?.[0];

  function startWorkout(routine?: Routine) {
    if (active) return router.push('/workout/active');
    start(
      routine
        ? {
            name: routine.name,
            routineId: routine.id,
            exercises: routine.routine_exercises.map((re) => ({
              exerciseId: re.exercise_id,
              name: re.exercise.name,
              sets: re.target_sets,
            })),
          }
        : undefined,
    );
    router.push('/workout/active');
  }

  async function newRoutine() {
    const id = await create.mutateAsync(`Rutina ${(routines.data?.length ?? 0) + 1}`);
    router.push({ pathname: '/routine/[id]', params: { id } });
  }

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
        <Text variant="h1">Entrenar</Text>

        {active ? (
          <Pressable testID="resume-workout" onPress={() => router.push('/workout/active')}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, borderColor: colors.accent }}>
              <Ionicons name="pulse" size={22} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text variant="h3">Entrenamiento en curso</Text>
                <Text variant="small" muted>{active.name} · tocá para continuar</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Card>
          </Pressable>
        ) : null}

        <Card style={{ gap: space.md }}>
          <View>
            <Text variant="caption" muted>Volumen esta semana</Text>
            <Text variant="small" muted>Objetivo: {target.min}–{target.max} series por músculo</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.lg }}>
            {(['front', 'back'] as const).map((side) => (
              <View key={side} style={{ alignItems: 'center', gap: space.xs }}>
                <BodyMap side={side} volume={volume.data ?? {}} experience={experience} selected={selected} onPressMuscle={setSelected} height={290} />
                <Text variant="caption" muted>{side === 'front' ? 'Frente' : 'Espalda'}</Text>
              </View>
            ))}
          </View>
          <BodyMapLegend />
          <Text testID="muscle-info" variant="small" muted style={{ textAlign: 'center', minHeight: 18 }}>
            {selected && selectedName
              ? `${selectedName}: ${selectedSets} series · ${STATUS_TEXT[volumeStatus(selectedSets, experience)]}`
              : 'Tocá un músculo para ver sus series'}
          </Text>
        </Card>

        {muscles.data ? (
          <Card style={{ gap: space.md }}>
            <Text variant="caption" muted>Series por músculo esta semana</Text>
            <MuscleBars
              rows={muscles.data
                .filter((m) => (volume.data?.[m.id] ?? 0) > 0)
                .map((m) => ({ id: m.id, label: m.name, value: volume.data?.[m.id] ?? 0 }))
                .sort((a, b) => b.value - a.value)}
              targetMin={target.min}
              targetMax={target.max}
              untrained={muscles.data.filter((m) => !(volume.data?.[m.id] ?? 0)).map((m) => m.name)}
            />
          </Card>
        ) : null}

        {weekly.data ? (
          <Card style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text variant="caption" muted>Series por semana</Text>
              <Text variant="small" muted>
                {weekly.data[weekly.data.length - 1].sessions} {weekly.data[weekly.data.length - 1].sessions === 1 ? 'sesión' : 'sesiones'} esta semana
              </Text>
            </View>
            <ColumnChart
              testID="weekly-sets-chart"
              data={weekly.data.map((w) => ({ key: w.week_start, label: shortDate(w.week_start), value: w.sets }))}
              selectedKey={weekly.data[weekly.data.length - 1].week_start}
              labelEvery={2}
            />
          </Card>
        ) : null}

        <Button testID="start-empty" title={active ? 'Continuar entrenamiento' : 'Empezar entrenamiento libre'} onPress={() => startWorkout()} />

        <SectionHeader
          title="Rutinas"
          action={<Chip testID="new-routine" label="+ Nueva" onPress={newRoutine} />}
        />
        {routines.data?.length ? (
          routines.data.map((r) => (
            <Pressable key={r.id} testID={`routine-${r.name}`} onPress={() => router.push({ pathname: '/routine/[id]', params: { id: r.id } })}>
              <Card style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="h3">{r.name}</Text>
                  <Chip
                    testID={`start-${r.name}`}
                    label="Empezar"
                    selected
                    onPress={() => startWorkout(r)}
                  />
                </View>
                <Text variant="small" muted numberOfLines={2}>
                  {r.routine_exercises.length
                    ? r.routine_exercises.map((re) => re.exercise.name).join(' · ')
                    : 'Sin ejercicios todavía'}
                </Text>
              </Card>
            </Pressable>
          ))
        ) : routines.isLoading ? null : (
          <EmptyState title="Sin rutinas" body="Creá tu primera rutina, por ejemplo Push, Pull o Piernas." />
        )}

        <SectionHeader
          title="Historial"
          action={workouts.data?.length ? <Chip label="Ver todo" onPress={() => router.push('/history')} /> : undefined}
        />
        {last ? (
          <Pressable onPress={() => router.push({ pathname: '/workout/[id]', params: { id: last.id } })}>
            <Card style={{ gap: space.xs }}>
              <Text variant="h3">{last.name}</Text>
              <Text variant="small" muted>
                {new Date(last.started_at).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })} ·{' '}
                {formatDuration(new Date(last.ended_at).getTime() - new Date(last.started_at).getTime())} ·{' '}
                {last.workout_sets.length} series
              </Text>
            </Card>
          </Pressable>
        ) : (
          <EmptyState title="Todavía no entrenaste" body="Tus entrenamientos terminados aparecen acá." />
        )}
      </ScrollView>
    </Screen>
  );
}
