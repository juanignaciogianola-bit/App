import { Image, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/lib/auth';
import { useMuscles } from '@/lib/api';
import { usePhotoUrl } from '@/lib/meals';
import { SEVERITY_LABEL, useDeleteAllPhysique, useSessions, type PhysiqueSession } from '@/lib/physique';
import { confirm, notify } from '@/lib/confirm';
import { isAdult } from '../../../../supabase/functions/_shared/physique';
import { Button, Card, EmptyState, Screen, SectionHeader, Text } from '@/components/ui';
import { colors, radius, space } from '@/theme';

export default function Physique() {
  const { profile } = useAuth();
  const sessions = useSessions();
  const muscles = useMuscles();
  const deleteAll = useDeleteAllPhysique();
  const adult = isAdult(profile?.birth_date ?? null);
  const list = sessions.data ?? [];
  const latest = list.find((s) => s.physique_analyses.length > 0);
  const latestAnalysis = latest?.physique_analyses[0];
  const muscleName = (id: string) => muscles.data?.find((m) => m.id === id)?.name ?? id;

  async function onDeleteAll() {
    if (!(await confirm('Borrar todas las fotos', 'Se eliminan todas tus fotos de físico y sus análisis. No se puede deshacer.', 'Borrar todo'))) return;
    try {
      const n = await deleteAll.mutateAsync();
      notify('Listo', `Se borraron ${n} fotos.`);
    } catch (e) {
      notify('No se pudo borrar', e instanceof Error ? e.message : 'Intentá de nuevo.');
    }
  }

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text variant="h1">Físico</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
            <Text variant="small" muted>Tus fotos son privadas: solo vos podés verlas y borrarlas.</Text>
          </View>
        </View>

        {!adult ? (
          <EmptyState title="Disponible desde los 18 años" body="El análisis de físico con fotos está reservado para mayores de edad." />
        ) : (
          <Button testID="new-physique" title="Nuevo análisis" onPress={() => router.push('/physique/new')} />
        )}

        {latest && latestAnalysis ? (
          <Pressable testID="latest-analysis" onPress={() => router.push({ pathname: '/physique/[id]', params: { id: latest.id } })}>
            <Card style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="caption" muted>Último análisis</Text>
                <Text variant="caption" muted>{new Date(latest.taken_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</Text>
              </View>
              <Text>{latestAnalysis.summary}</Text>
              {latestAnalysis.lagging.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {latestAnalysis.lagging.map((l) => (
                    <View key={l.muscle_id} style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 }}>
                      <Text variant="small">
                        {muscleName(l.muscle_id)} · <Text variant="small" style={{ color: colors.carbs }}>{SEVERITY_LABEL[l.severity]}</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          </Pressable>
        ) : null}

        <SectionHeader
          title="Progreso"
          action={
            list.length >= 2 ? (
              <Pressable testID="compare" onPress={() => router.push('/physique/compare')}>
                <Text style={{ color: colors.accent }}>Comparar</Text>
              </Pressable>
            ) : undefined
          }
        />
        {list.length ? (
          list.map((s) => <SessionRow key={s.id} session={s} />)
        ) : sessions.isLoading ? null : (
          <EmptyState title="Sin fotos todavía" body="Sacate fotos de frente, espalda y perfil para ver tu progreso en el tiempo." />
        )}

        {list.length ? (
          <Button testID="delete-all-physique" title="Borrar todas mis fotos" variant="danger" onPress={onDeleteAll} loading={deleteAll.isPending} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Thumb({ path }: { path: string | null }) {
  const url = usePhotoUrl('physique-photos', path);
  return url.data ? (
    <Image source={{ uri: url.data }} style={{ width: 48, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh }} />
  ) : (
    <View style={{ width: 48, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh }} />
  );
}

function SessionRow({ session }: { session: PhysiqueSession }) {
  const analysed = session.physique_analyses.length > 0;
  return (
    <Pressable testID={`session-${session.id}`} onPress={() => router.push({ pathname: '/physique/[id]', params: { id: session.id } })}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Thumb path={session.front_path} />
          <Thumb path={session.back_path} />
          <Thumb path={session.side_path} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3">{new Date(session.taken_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          <Text variant="small" muted>
            {session.weight_kg ? `${Number(session.weight_kg)} kg · ` : ''}
            {analysed ? 'Analizado' : 'Sin análisis'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Card>
    </Pressable>
  );
}
