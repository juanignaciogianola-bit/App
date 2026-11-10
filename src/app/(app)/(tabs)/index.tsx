import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useWeekWorkoutCount, useWeeklyVolume } from '@/lib/api';
import { volumeStatus } from '@/lib/training';
import { BodyMap } from '@/components/BodyMap';
import { useCurrentTargets } from '@/lib/useTargets';
import { useDayTotals } from '@/lib/meals';
import { Button, Card, ProgressBar, Screen, Text } from '@/components/ui';
import { colors, space } from '@/theme';

const GOAL_LABEL = { bulk: 'Volumen', cut: 'Definición', maintain: 'Mantener' } as const;

export default function Dashboard() {
  const { profile, signOut } = useAuth();
  const { targets } = useCurrentTargets();
  const experience = profile?.experience ?? 'beginner';
  const volume = useWeeklyVolume();
  const weekCount = useWeekWorkoutCount();
  const weekSets = Object.values(volume.data ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const optimal = Object.values(volume.data ?? {}).filter((v) => volumeStatus(v ?? 0, experience) === 'optimal').length;
  const today = useDayTotals(new Date());
  const consumed = today.data ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text variant="caption" muted>
            {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text variant="h1">Hoy</Text>
        </View>

        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="caption" muted>Calorías</Text>
            {profile?.goal ? <Text variant="small" style={{ color: colors.accent }}>{GOAL_LABEL[profile.goal]}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
            <Text testID="kcal-left" style={{ fontSize: 44, fontWeight: '800', letterSpacing: -1, color: colors.text }}>
              {targets ? Math.round(targets.kcal - consumed.kcal) : '—'}
            </Text>
            <Text muted>kcal restantes</Text>
          </View>
          <ProgressBar value={targets ? consumed.kcal / targets.kcal : 0} />
          <View style={{ flexDirection: 'row', gap: space.lg }}>
            <MacroRow label="Proteína" value={consumed.protein_g} target={targets?.protein_g} color={colors.protein} />
            <MacroRow label="Carbos" value={consumed.carbs_g} target={targets?.carbs_g} color={colors.carbs} />
            <MacroRow label="Grasas" value={consumed.fat_g} target={targets?.fat_g} color={colors.fat} />
          </View>
        </Card>

        <Pressable testID="week-card" onPress={() => router.push('/train')}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <View style={{ flex: 1, gap: space.sm }}>
              <Text variant="caption" muted>Esta semana</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs }}>
                <Text testID="week-count" style={{ fontSize: 36, fontWeight: '800', color: colors.text }}>{weekCount.data ?? 0}</Text>
                <Text muted>{weekCount.data === 1 ? 'sesión' : 'sesiones'}</Text>
              </View>
              <Text variant="small" muted>
                {Math.round(weekSets)} series ponderadas · {optimal} músculo{optimal === 1 ? '' : 's'} en rango óptimo
              </Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <BodyMap side="front" volume={volume.data ?? {}} experience={experience} height={130} />
              <BodyMap side="back" volume={volume.data ?? {}} experience={experience} height={130} />
            </View>
          </Card>
        </Pressable>

        <Card style={{ gap: space.sm }}>
          <Text variant="caption" muted>Último análisis de físico</Text>
          <Text muted>Disponible en la etapa 4.</Text>
        </Card>

        <Button title="Cerrar sesión" variant="ghost" onPress={signOut} />
      </ScrollView>
    </Screen>
  );
}

function MacroRow({ label, value, target, color }: { label: string; value: number; target?: number; color: string }) {
  return (
    <View style={{ flex: 1, gap: space.xs }}>
      <Text variant="small" muted>{label}</Text>
      <ProgressBar value={target ? value / target : 0} color={color} />
      <Text variant="small">{Math.round(value)}/{target ?? '—'} g</Text>
    </View>
  );
}
