import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useMuscles, useRoutineMutations, useRoutines } from '@/lib/api';
import { usePhotoUrl } from '@/lib/meals';
import {
  analyzeSession,
  physiqueKeys,
  POSE_LABEL,
  POSES,
  SEVERITY_LABEL,
  useAddSuggestions,
  useDeleteSession,
  useSession,
  type Pose,
} from '@/lib/physique';
import { confirm, notify } from '@/lib/confirm';
import type { MuscleId } from '@/lib/types';
import { BodyMap } from '@/components/BodyMap';
import { Button, Card, Chip, Text } from '@/components/ui';
import { colors, radius, space } from '@/theme';

const SEVERITY_COLOR = { mild: '#FFD27A', moderate: '#FFB547', marked: '#FF7A45' } as const;

export default function PhysiqueDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: session, isLoading } = useSession(id);
  const muscles = useMuscles();
  const routines = useRoutines();
  const { create: createRoutine } = useRoutineMutations();
  const addSuggestions = useAddSuggestions();
  const del = useDeleteSession();
  const [pose, setPose] = useState<Pose>('front');
  const [analyzing, setAnalyzing] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [target, setTarget] = useState<string | 'new' | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const analysis = session?.physique_analyses[0];
  const photoPath = session?.[`${pose}_path` as const] ?? null;
  const photo = usePhotoUrl('physique-photos', photoPath);
  const muscleName = (m: string) => muscles.data?.find((x) => x.id === m)?.name ?? m;

  useEffect(() => {
    if (analysis) setSelected(analysis.routine_suggestions.map((_, i) => i));
  }, [analysis?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (target === null && routines.data) setTarget(routines.data[0]?.id ?? 'new');
  }, [routines.data, target]);

  const highlight = useMemo(() => {
    const h: Partial<Record<MuscleId, string>> = {};
    analysis?.strengths.forEach((s) => (h[s.muscle_id] = colors.accent));
    analysis?.lagging.forEach((l) => (h[l.muscle_id] = SEVERITY_COLOR[l.severity]));
    return h;
  }, [analysis]);

  if (isLoading || !session) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  async function retry() {
    setAnalyzing(true);
    try {
      await analyzeSession(session!.id);
      await qc.invalidateQueries({ queryKey: physiqueKeys.all });
    } catch (e) {
      notify('No se pudo analizar', e instanceof Error ? e.message : 'Intentá de nuevo.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function addToRoutine() {
    if (!analysis || !selected.length || !target) return;
    let routineId = target;
    let routineName = routines.data?.find((r) => r.id === target)?.name;
    if (target === 'new') {
      const focus = [...new Set(selected.map((i) => muscleName(analysis.routine_suggestions[i].muscle_id)))].slice(0, 2).join(' y ');
      routineName = `Foco: ${focus}`;
      routineId = await createRoutine.mutateAsync(routineName);
    }
    const n = await addSuggestions.mutateAsync({ analysisId: analysis.id, routineId, indexes: selected });
    setAdded(n > 0 ? `${n} ejercicio${n > 1 ? 's' : ''} agregado${n > 1 ? 's' : ''} a "${routineName}"` : `Ya estaban en "${routineName}"`);
    setTarget(routineId);
  }

  async function remove() {
    if (!(await confirm('Borrar sesión', 'Se borran las 3 fotos y su análisis. No se puede deshacer.', 'Borrar'))) return;
    await del.mutateAsync(session!);
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: new Date(session.taken_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) }} />
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg, paddingBottom: space.xxl * 2 }}>
        <View style={{ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, aspectRatio: 3 / 4 }}>
          {photo.data ? <Image testID="physique-photo" source={{ uri: photo.data }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.sm }}>
          {POSES.map((p) => (
            <Chip key={p} label={POSE_LABEL[p]} selected={pose === p} onPress={() => setPose(p)} />
          ))}
        </View>
        {session.weight_kg ? <Text muted style={{ textAlign: 'center' }}>{Number(session.weight_kg)} kg</Text> : null}

        {!analysis ? (
          <Card style={{ gap: space.md }}>
            <Text variant="h3">Sin análisis</Text>
            <Text muted>Las fotos están guardadas. Podés analizarlas ahora.</Text>
            <Button testID="retry-analysis" title="Analizar" onPress={retry} loading={analyzing} />
          </Card>
        ) : (
          <>
            <Card style={{ gap: space.sm }}>
              <Text variant="caption" muted>Resumen</Text>
              <Text testID="analysis-summary">{analysis.summary}</Text>
            </Card>

            <Card style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.lg }}>
                <BodyMap side="front" volume={{}} experience={profile?.experience ?? 'beginner'} highlight={highlight} height={200} />
                <BodyMap side="back" volume={{}} experience={profile?.experience ?? 'beginner'} highlight={highlight} height={200} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.lg }}>
                <Legend color={colors.accent} label="Punto fuerte" />
                <Legend color={SEVERITY_COLOR.moderate} label="Rezagado" />
              </View>
            </Card>

            {analysis.strengths.length ? (
              <Section title="Puntos fuertes">
                {analysis.strengths.map((s) => (
                  <Row key={s.muscle_id} icon="trending-up" color={colors.accent} title={muscleName(s.muscle_id)} body={s.note} />
                ))}
              </Section>
            ) : null}

            {analysis.lagging.length ? (
              <Section title="Músculos rezagados">
                {analysis.lagging.map((l) => (
                  <Row
                    key={l.muscle_id}
                    testID={`lagging-${l.muscle_id}`}
                    icon="alert-circle"
                    color={SEVERITY_COLOR[l.severity]}
                    title={`${muscleName(l.muscle_id)} · ${SEVERITY_LABEL[l.severity]}`}
                    body={l.note}
                  />
                ))}
              </Section>
            ) : null}

            {analysis.imbalances.length ? (
              <Section title="Desequilibrios">
                {analysis.imbalances.map((im, i) => (
                  <Row key={i} icon="git-compare-outline" color={colors.textMuted} title={im.note} body={im.muscles.map(muscleName).join(', ')} />
                ))}
              </Section>
            ) : null}

            {analysis.routine_suggestions.length ? (
              <Section title="Ajustes a la rutina">
                {analysis.routine_suggestions.map((s, i) => {
                  const on = selected.includes(i);
                  return (
                    <Pressable
                      key={i}
                      testID={`suggestion-${i}`}
                      onPress={() => setSelected((l) => (on ? l.filter((x) => x !== i) : [...l, i]))}
                      style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}
                    >
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.accent : colors.textMuted} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="h3">{s.exercise_name}</Text>
                        <Text variant="small" style={{ color: colors.accent }}>
                          {s.sets} × {s.rep_min}–{s.rep_max} · {muscleName(s.muscle_id)}
                        </Text>
                        {s.reason ? <Text variant="small" muted>{s.reason}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
                <Text variant="caption" muted style={{ marginTop: space.sm }}>Agregar a</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {routines.data?.map((r) => (
                    <Chip key={r.id} testID={`target-${r.name}`} label={r.name} selected={target === r.id} onPress={() => setTarget(r.id)} />
                  ))}
                  <Chip testID="target-new" label="+ Rutina nueva" selected={target === 'new'} onPress={() => setTarget('new')} />
                </View>
                <Button
                  testID="add-suggestions"
                  title={selected.length ? `Agregar ${selected.length} ejercicio${selected.length > 1 ? 's' : ''}` : 'Elegí ejercicios'}
                  onPress={addToRoutine}
                  disabled={!selected.length || !target}
                  loading={addSuggestions.isPending || createRoutine.isPending}
                />
                {added ? (
                  <Pressable onPress={() => router.dismissTo('/train')}>
                    <Text testID="added-message" style={{ color: colors.accent, textAlign: 'center' }}>✓ {added} · Ver rutinas</Text>
                  </Pressable>
                ) : null}
              </Section>
            ) : null}

            {analysis.diet_suggestions.length ? (
              <Section title="Ajustes de dieta">
                {analysis.diet_suggestions.map((d, i) => (
                  <Row key={i} icon="nutrition-outline" color={colors.protein} title={d.title} body={d.detail} />
                ))}
              </Section>
            ) : null}

            <Text variant="small" style={{ color: colors.textFaint, textAlign: 'center' }}>
              Análisis orientativo generado por IA a partir de fotos; no reemplaza la evaluación de un profesional.
            </Text>
          </>
        )}

        <Button testID="delete-session" title="Borrar estas fotos" variant="danger" onPress={remove} loading={del.isPending} />
      </ScrollView>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card style={{ gap: space.md }}>
      <Text variant="caption" muted>{title}</Text>
      {children}
    </Card>
  );
}

function Row({ icon, color, title, body, testID }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; body?: string; testID?: string }) {
  return (
    <View testID={testID} style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={18} color={color} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="h3">{title}</Text>
        {body ? <Text variant="small" muted>{body}</Text> : null}
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text variant="small" muted>{label}</Text>
    </View>
  );
}
