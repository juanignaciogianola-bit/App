import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useExerciseProgress, useExercises, useMuscles } from '@/lib/api';
import { LineChart } from '@/components/LineChart';
import { Card, EmptyState, Text } from '@/components/ui';
import { colors, space } from '@/theme';

export default function ExerciseProgress() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exercises = useExercises();
  const muscles = useMuscles();
  const progress = useExerciseProgress(id);
  const ex = exercises.data?.find((e) => e.id === id);
  const name = (mid: string) => muscles.data?.find((m) => m.id === mid)?.name ?? mid;
  const points = progress.data ?? [];
  const e1rms = points.map((p) => p.best_e1rm_kg).filter((v): v is number => v !== null);
  const best = e1rms.length ? Math.max(...e1rms) : null;
  const top = points.length ? Math.max(...points.map((p) => p.top_weight_kg)) : null;
  const delta = e1rms.length > 1 ? Math.round((e1rms[e1rms.length - 1] - e1rms[0]) * 10) / 10 : null;

  return (
    <>
      <Stack.Screen options={{ title: ex?.name ?? 'Progreso' }} />
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text variant="h1">{ex?.name}</Text>
          <Text muted>
            {ex?.exercise_muscles
              .map((m) => (m.role === 'primary' ? name(m.muscle_id) : `${name(m.muscle_id)} (sec.)`))
              .join(' · ')}
          </Text>
        </View>

        {points.length === 0 ? (
          progress.isLoading ? null : <EmptyState title="Sin registros" body="Registrá este ejercicio en un entrenamiento para ver tu progreso." />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Stat label="1RM estimado" value={best ? `${best} kg` : '—'} />
              <Stat label="Peso máximo" value={top !== null ? `${top} kg` : '—'} />
              <Stat label="Sesiones" value={String(points.length)} />
            </View>
            {e1rms.length > 0 ? (
              <Card style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="caption" muted>1RM estimado por sesión</Text>
                  {delta !== null ? (
                    <Text variant="small" style={{ color: delta >= 0 ? colors.accent : colors.danger }}>
                      {delta >= 0 ? '+' : ''}{delta} kg
                    </Text>
                  ) : null}
                </View>
                <LineChart values={e1rms} unit=" kg" />
              </Card>
            ) : null}
            {[...points].reverse().map((p) => (
              <Card key={p.workout_id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text>{new Date(p.performed_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</Text>
                <Text muted>{p.sets} series · máx {p.top_weight_kg} kg{p.best_e1rm_kg ? ` · 1RM ${p.best_e1rm_kg}` : ''}</Text>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, gap: 2, padding: space.md }}>
      <Text variant="caption" muted>{label}</Text>
      <Text variant="h3">{value}</Text>
    </Card>
  );
}
