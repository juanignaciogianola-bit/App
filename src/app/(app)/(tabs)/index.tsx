import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useWeekWorkoutCount, useWeeklyVolume } from '@/lib/api';
import { volumeStatus } from '@/lib/training';
import { BodyMap } from '@/components/BodyMap';
import { useCurrentTargets } from '@/lib/useTargets';
import { useDayTotals } from '@/lib/meals';
import { SEVERITY_LABEL, useSessions } from '@/lib/physique';
import { useMuscles } from '@/lib/api';
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
  const sessions = useSessions();
  const muscles = useMuscles();
  const lastSession = sessions.data?.find((s) => s.physique_analyses.length > 0);
  const lastAnalysis = lastSession?.physique_analyses[0];
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

        <Pressable
          testID="dashboard-analysis"
          onPress={() => (lastSession ? router.push({ pathname: '/physique/[id]', params: { id: lastSession.id } }) : router.push('/physique'))}
        >
          <Card style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="caption" muted>Último análisis de físico</Text>
              {lastSession ? (
                <Text variant="caption" muted>{new Date(lastSession.taken_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</Text>
              ) : null}
            </View>
            {lastAnalysis ? (
              <>
                <Text numberOfLines={3}>{lastAnalysis.summary}</Text>
                {lastAnalysis.lagging.length ? (
                  <Text variant="small" style={{ color: colors.carbs }}>
                    A priorizar: {lastAnalysis.lagging
                      .map((l) => `${muscles.data?.find((m) => m.id === l.muscle_id)?.name ?? l.muscle_id} (${SEVERITY_LABEL[l.severity].toLowerCase()})`)
                      .join(', ')}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text muted>Todavía no hiciste un análisis. Sacate fotos de frente, espalda y perfil.</Text>
            )}
          </Card>
        </Pressable>

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
