import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDeleteWorkout, useWorkout } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { formatDuration } from '@/lib/training';
import { summarizeWorkout } from '@/lib/workoutSummary';
import { Button, Card, Text } from '@/components/ui';
import { colors, space } from '@/theme';

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: w, isLoading } = useWorkout(id);
  const del = useDeleteWorkout();

  if (isLoading || !w) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  const sum = summarizeWorkout(w);

  async function remove() {
    if (await confirm('Eliminar entrenamiento', 'Se borra del historial y del volumen semanal.', 'Eliminar')) {
      await del.mutateAsync(w!.id);
      router.back();
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: w.name }} />
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text variant="h1">{w.name}</Text>
          <Text muted>
            {new Date(w.started_at).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
            {new Date(w.started_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Stat label="Duración" value={formatDuration(sum.durationMs)} />
          <Stat label="Series" value={String(sum.sets)} testID="summary-sets" />
          <Stat label="Volumen" value={`${sum.volume} kg`} testID="summary-volume" />
        </View>

        {sum.exercises.map((ex, i) => (
          <Pressable key={i} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: ex.exerciseId } })}>
            <Card style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="h3" style={{ color: colors.accent, flex: 1 }}>{ex.name}</Text>
                {ex.bestE1rm ? <Text variant="small" muted>1RM est. {ex.bestE1rm} kg</Text> : null}
              </View>
              {ex.sets.map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', gap: space.lg }}>
                  <Text muted style={{ width: 20 }}>{s.set_index + 1}</Text>
                  <Text>{Number(s.weight_kg)} kg × {s.reps}</Text>
                </View>
              ))}
            </Card>
          </Pressable>
        ))}

        <Button title="Eliminar entrenamiento" variant="danger" onPress={remove} />
      </ScrollView>
    </>
  );
}

function Stat({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <Card style={{ flex: 1, gap: 2, padding: space.md }}>
      <Text variant="caption" muted>{label}</Text>
      <Text testID={testID} variant="h3">{value}</Text>
    </Card>
  );
}
