import { useEffect, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { usePhotoUrl } from '@/lib/meals';
import { POSE_LABEL, POSES, useSessions, type PhysiqueSession, type Pose } from '@/lib/physique';
import { Chip, Text } from '@/components/ui';
import { colors, radius, space } from '@/theme';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: '2-digit' });

export default function Compare() {
  const { data: sessions = [] } = useSessions();
  const [pose, setPose] = useState<Pose>('front');
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);

  // Default: oldest vs newest
  useEffect(() => {
    if (sessions.length >= 2 && !beforeId) {
      setBeforeId(sessions[sessions.length - 1].id);
      setAfterId(sessions[0].id);
    }
  }, [sessions, beforeId]);

  const before = sessions.find((s) => s.id === beforeId);
  const after = sessions.find((s) => s.id === afterId);
  const delta = before?.weight_kg && after?.weight_kg ? Math.round((Number(after.weight_kg) - Number(before.weight_kg)) * 10) / 10 : null;

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.sm }}>
        {POSES.map((p) => (
          <Chip key={p} label={POSE_LABEL[p]} selected={pose === p} onPress={() => setPose(p)} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Side label="Antes" session={before} pose={pose} />
        <Side label="Después" session={after} pose={pose} />
      </View>

      {delta !== null ? (
        <Text testID="weight-delta" style={{ textAlign: 'center', color: colors.textMuted }}>
          Peso: {Number(before!.weight_kg)} → {Number(after!.weight_kg)} kg ({delta > 0 ? '+' : ''}{delta} kg)
        </Text>
      ) : null}

      <Picker title="Antes" sessions={sessions} value={beforeId} onChange={setBeforeId} />
      <Picker title="Después" sessions={sessions} value={afterId} onChange={setAfterId} />
    </ScrollView>
  );
}

function Side({ label, session, pose }: { label: string; session?: PhysiqueSession; pose: Pose }) {
  const url = usePhotoUrl('physique-photos', session?.[`${pose}_path` as const] ?? null);
  return (
    <View style={{ flex: 1, gap: space.xs }}>
      <View style={{ aspectRatio: 3 / 4, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface }}>
        {url.data ? <Image source={{ uri: url.data }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
      </View>
      <Text variant="caption" muted style={{ textAlign: 'center' }}>{label}{session ? ` · ${fmt(session.taken_at)}` : ''}</Text>
    </View>
  );
}

function Picker({ title, sessions, value, onChange }: { title: string; sessions: PhysiqueSession[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="caption" muted>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {sessions.map((s) => (
          <Chip key={s.id} label={fmt(s.taken_at)} selected={value === s.id} onPress={() => onChange(s.id)} />
        ))}
      </ScrollView>
    </View>
  );
}
