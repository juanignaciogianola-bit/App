import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useExercises, useMuscles, useRoutineMutations } from '@/lib/api';
import { EQUIPMENT_LABEL } from '@/lib/training';
import { useWorkoutStore } from '@/lib/workoutStore';
import type { Exercise, MuscleId } from '@/lib/types';
import { Button, Chip, Input, Text } from '@/components/ui';
import { colors, space } from '@/theme';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function ExercisePicker() {
  const params = useLocalSearchParams<{ mode: 'routine' | 'workout'; routineId?: string; startPosition?: string; muscle?: MuscleId }>();
  const exercises = useExercises();
  const muscles = useMuscles();
  const { addExercises } = useRoutineMutations();
  const addToWorkout = useWorkoutStore((s) => s.addExercises);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleId | null>(params.muscle ?? null);
  const [picked, setPicked] = useState<Exercise[]>([]);

  const muscleName = useMemo(() => Object.fromEntries((muscles.data ?? []).map((m) => [m.id, m.name])), [muscles.data]);

  const list = useMemo(() => {
    const q = normalize(query.trim());
    return (exercises.data ?? []).filter(
      (e) =>
        (!q || normalize(e.name).includes(q)) &&
        (!muscle || e.exercise_muscles.some((m) => m.muscle_id === muscle && m.role === 'primary')),
    );
  }, [exercises.data, query, muscle]);

  const toggle = (e: Exercise) =>
    setPicked((p) => (p.some((x) => x.id === e.id) ? p.filter((x) => x.id !== e.id) : [...p, e]));

  async function confirmSelection() {
    if (params.mode === 'routine' && params.routineId) {
      await addExercises.mutateAsync({
        routineId: params.routineId,
        exerciseIds: picked.map((e) => e.id),
        startPosition: Number(params.startPosition ?? 0),
      });
    } else {
      addToWorkout(picked.map((e) => ({ exerciseId: e.id, name: e.name })));
    }
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.lg, gap: space.md }}>
        <Input testID="exercise-search" value={query} onChangeText={setQuery} placeholder="Buscar ejercicio" autoCorrect={false} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          <Chip label="Todos" selected={!muscle} onPress={() => setMuscle(null)} />
          {muscles.data?.map((m) => (
            <Chip key={m.id} testID={`filter-${m.id}`} label={m.name} selected={muscle === m.id} onPress={() => setMuscle(m.id)} />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 140 }}
        ListEmptyComponent={
          exercises.isLoading ? undefined : <Text muted style={{ textAlign: 'center', marginTop: space.xl }}>No hay ejercicios que coincidan.</Text>
        }
        ListFooterComponent={
          <Pressable onPress={() => router.push('/exercise/new')} style={{ paddingVertical: space.lg }}>
            <Text style={{ color: colors.accent, textAlign: 'center' }}>+ Crear ejercicio propio</Text>
          </Pressable>
        }
        renderItem={({ item }) => {
          const on = picked.some((x) => x.id === item.id);
          const primary = item.exercise_muscles.filter((m) => m.role === 'primary').map((m) => muscleName[m.muscle_id]);
          return (
            <Pressable
              testID={`pick-${item.name}`}
              onPress={() => toggle(item)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: space.md,
                borderBottomWidth: 0.5,
                borderBottomColor: colors.border,
                gap: space.md,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h3">{item.name}</Text>
                <Text variant="small" muted>
                  {primary.join(', ')} · {EQUIPMENT_LABEL[item.equipment] ?? item.equipment}
                  {item.owner_id ? ' · propio' : ''}
                </Text>
              </View>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? colors.accent : colors.textFaint} />
            </Pressable>
          );
        }}
      />

      <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: space.xl }}>
        <Button
          testID="confirm-picker"
          title={picked.length ? `Agregar ${picked.length} ejercicio${picked.length > 1 ? 's' : ''}` : 'Elegí ejercicios'}
          disabled={!picked.length}
          loading={addExercises.isPending}
          onPress={confirmSelection}
        />
      </View>
    </View>
  );
}
