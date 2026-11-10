import { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { analyzeSession, createSession, physiqueKeys, POSE_LABEL, POSES, type PickedPhoto, type Pose } from '@/lib/physique';
import { notify } from '@/lib/confirm';
import { parseDecimal } from '@/lib/training';
import { Button, Card, Input, Text } from '@/components/ui';
import { colors, radius, space } from '@/theme';

const TIPS = [
  'Misma luz, lugar y distancia cada vez',
  'Short o ropa ajustada, sin bombeo previo',
  'Postura relajada, brazos levemente separados',
  'Cámara a la altura del pecho, cuerpo entero en cuadro',
];

export default function NewPhysique() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [photos, setPhotos] = useState<Partial<Record<Pose, PickedPhoto>>>({});
  const [weight, setWeight] = useState(profile?.weight_kg ? String(profile.weight_kg) : '');
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'analyzing'>('idle');

  async function pick(pose: Pose, source: 'camera' | 'library') {
    if (source === 'camera' && Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return notify('Sin acceso a la cámara', 'Habilitá el permiso de cámara en Ajustes.');
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, cameraType: ImagePicker.CameraType.back };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setPhotos((p) => ({ ...p, [pose]: { uri: a.uri, width: a.width, height: a.height } }));
  }

  const ready = POSES.every((p) => photos[p]);
  const w = parseDecimal(weight);

  async function submit() {
    setPhase('uploading');
    let sessionId: string;
    try {
      sessionId = await createSession(photos as Record<Pose, PickedPhoto>, Number.isFinite(w) && w >= 35 && w <= 250 ? w : null);
    } catch (e) {
      setPhase('idle');
      return notify('No se pudieron subir las fotos', e instanceof Error ? e.message : 'Intentá de nuevo.');
    }
    setPhase('analyzing');
    try {
      await analyzeSession(sessionId);
    } catch (e) {
      // The photos are saved; the detail screen offers a retry.
      notify('Fotos guardadas', `${e instanceof Error ? e.message : 'El análisis falló.'} Podés reintentar desde el detalle.`);
    }
    await qc.invalidateQueries({ queryKey: physiqueKeys.all });
    router.replace({ pathname: '/physique/[id]', params: { id: sessionId } });
  }

  if (phase !== 'idle') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl }}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text testID="physique-progress" variant="h2" style={{ textAlign: 'center' }}>
          {phase === 'uploading' ? 'Subiendo fotos…' : 'Analizando tu físico…'}
        </Text>
        {phase === 'analyzing' ? <Text muted style={{ textAlign: 'center' }}>Puede tardar hasta un minuto.</Text> : null}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
      <Card style={{ gap: space.sm }}>
        <Text variant="caption" muted>Para comparar bien en el tiempo</Text>
        {TIPS.map((t) => (
          <View key={t} style={{ flexDirection: 'row', gap: space.sm }}>
            <Ionicons name="checkmark" size={16} color={colors.accent} />
            <Text variant="small" style={{ flex: 1 }}>{t}</Text>
          </View>
        ))}
      </Card>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {POSES.map((pose) => {
          const p = photos[pose];
          return (
            <View key={pose} style={{ flex: 1, gap: space.xs }}>
              <Pressable
                testID={`pose-${pose}`}
                onPress={() => pick(pose, Platform.OS === 'web' ? 'library' : 'camera')}
                style={{
                  aspectRatio: 3 / 4,
                  borderRadius: radius.md,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderStyle: p ? 'solid' : 'dashed',
                  borderColor: p ? colors.accent : colors.border,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {p ? (
                  <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <Ionicons name="camera-outline" size={26} color={colors.textMuted} />
                )}
              </Pressable>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="small">{POSE_LABEL[pose]}</Text>
                {Platform.OS !== 'web' ? (
                  <Pressable onPress={() => pick(pose, 'library')} hitSlop={8}>
                    <Ionicons name="images-outline" size={16} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <Input testID="physique-weight" label="Peso de hoy" suffix="kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />

      <Button testID="analyze-physique" title={ready ? 'Analizar' : 'Faltan fotos'} onPress={submit} disabled={!ready} />
      <Text variant="small" muted style={{ textAlign: 'center' }}>
        Las fotos se guardan en tu espacio privado y se usan solo para tu análisis. Podés borrarlas cuando quieras.
      </Text>
    </ScrollView>
  );
}
