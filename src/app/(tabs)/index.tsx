import { ScrollView, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useCurrentTargets } from '@/lib/useTargets';
import { Button, Card, ProgressBar, Screen, Text } from '@/components/ui';
import { colors, space } from '@/theme';

const GOAL_LABEL = { bulk: 'Volumen', cut: 'Definición', maintain: 'Mantener' } as const;

export default function Dashboard() {
  const { profile, signOut } = useAuth();
  const { targets } = useCurrentTargets();
  // Consumed calories arrive in stage 3 (meal log); zero until then.
  const consumed = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

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
              {targets ? targets.kcal - consumed.kcal : '—'}
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

        <Card style={{ gap: space.sm }}>
          <Text variant="caption" muted>Entrenamiento de la semana</Text>
          <Text muted>Disponible en la etapa 2.</Text>
        </Card>

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
      <Text variant="small">{value}/{target ?? '—'} g</Text>
    </View>
  );
}
