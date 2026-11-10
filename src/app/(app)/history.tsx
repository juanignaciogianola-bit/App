import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useWorkouts } from '@/lib/api';
import { formatDuration } from '@/lib/training';
import { summarizeWorkout } from '@/lib/workoutSummary';
import { Card, EmptyState, Text } from '@/components/ui';
import { space } from '@/theme';

export default function History() {
  const { data, isLoading, refetch, isRefetching } = useWorkouts(200);
  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(w) => w.id}
      onRefresh={refetch}
      refreshing={isRefetching}
      contentContainerStyle={{ padding: space.xl, gap: space.md }}
      ListEmptyComponent={isLoading ? undefined : <EmptyState title="Sin entrenamientos" body="Terminá tu primer entrenamiento para verlo acá." />}
      renderItem={({ item }) => {
        const s = summarizeWorkout(item);
        return (
          <Pressable onPress={() => router.push({ pathname: '/workout/[id]', params: { id: item.id } })}>
            <Card style={{ gap: space.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="h3">{item.name}</Text>
                <Text variant="small" muted>
                  {new Date(item.started_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
              <Text variant="small" muted>
                {formatDuration(s.durationMs)} · {s.sets} series · {s.volume} kg
              </Text>
              <Text variant="small" muted numberOfLines={1}>{s.exercises.map((e) => e.name).join(' · ')}</Text>
            </Card>
          </Pressable>
        );
      }}
    />
  );
}
