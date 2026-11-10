import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  analyzeMealPhoto,
  preparePhoto,
  uploadPhoto,
  useDeleteMeal,
  useMeal,
  usePhotoUrl,
  useSaveMeal,
  type MealEstimate,
} from '@/lib/meals';
import { MEAL_TYPES, itemIsValid, mealTypeForHour, rescaleItem, sumItems, toSavePayload, type EditableItem, type MealType } from '@/lib/mealMath';
import { useMealDraft } from '@/lib/mealDraft';
import { supabase } from '@/lib/supabase';
import { confirm } from '@/lib/confirm';
import { Button, Card, Chip, Input, Text } from '@/components/ui';
import { colors, radius, space } from '@/theme';

type Phase = 'idle' | 'uploading' | 'analyzing' | 'ready' | 'error';

let keySeq = 0;
const newKey = () => `i${keySeq++}`;
const toEditable = (i: { name: string; grams: number | null; kcal: number; protein_g: number; carbs_g: number; fat_g: number; edited?: boolean }): EditableItem => ({
  key: newKey(),
  name: i.name,
  grams: i.grams === null ? '' : String(Number(i.grams)),
  kcal: String(Number(i.kcal)),
  protein_g: String(Number(i.protein_g)),
  carbs_g: String(Number(i.carbs_g)),
  fat_g: String(Number(i.fat_g)),
  edited: !!i.edited,
});
const blankItem = (): EditableItem => ({ key: newKey(), name: '', grams: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '', edited: true });

const CONFIDENCE = { low: 'Confianza baja', medium: 'Confianza media', high: 'Confianza alta' } as const;

export default function MealEditor() {
  const params = useLocalSearchParams<{ id?: string; mode?: 'photo' | 'manual' }>();
  const existing = useMeal(params.id);
  const draft = useMealDraft();
  const save = useSaveMeal();
  const del = useDeleteMeal();

  const [phase, setPhase] = useState<Phase>(params.mode === 'photo' ? 'uploading' : params.id ? 'idle' : 'ready');
  const [error, setError] = useState<string | null>(null);
  const [localUri, setLocalUri] = useState<string | null>(draft.picked?.uri ?? null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<MealEstimate | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<MealType>(mealTypeForHour(new Date().getHours()));
  const [items, setItems] = useState<EditableItem[]>(params.mode === 'manual' ? [blankItem()] : []);
  const [eatenAt, setEatenAt] = useState<Date>(() => {
    const d = new Date(draft.day);
    const now = new Date();
    d.setHours(now.getHours(), now.getMinutes(), 0, 0);
    return d;
  });
  const saved = useRef(false);
  const remoteUrl = usePhotoUrl('meal-photos', existing.data?.photo_path);

  // Editing an existing meal
  useEffect(() => {
    const m = existing.data;
    if (!m) return;
    setName(m.name);
    setMealType(m.meal_type);
    setEatenAt(new Date(m.eaten_at));
    setItems(m.meal_items.map(toEditable));
    setPhotoPath(m.photo_path);
    setPhase('ready');
  }, [existing.data]);

  // New meal from a photo: resize -> upload -> analyse
  useEffect(() => {
    if (params.mode !== 'photo' || !draft.picked) return;
    const { uri, width, height } = draft.picked;
    let cancelled = false;
    (async () => {
      try {
        const prepared = await preparePhoto(uri, width, height);
        if (cancelled) return;
        setLocalUri(prepared);
        const path = await uploadPhoto('meal-photos', prepared);
        if (cancelled) return;
        setPhotoPath(path);
        await runAnalysis(path, '');
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'No se pudo subir la foto.');
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving a new photo meal without saving removes the uploaded photo.
  useEffect(() => {
    return () => {
      if (!saved.current && !params.id && photoPathRef.current) {
        supabase.storage.from('meal-photos').remove([photoPathRef.current]);
      }
      draft.clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const photoPathRef = useRef<string | null>(null);
  photoPathRef.current = photoPath;

  async function runAnalysis(path: string, userNote: string) {
    setPhase('analyzing');
    setError(null);
    try {
      const res = await analyzeMealPhoto(path, userNote || undefined);
      setEstimate(res.estimate);
      setModel(res.model);
      if (!res.estimate.is_food) {
        setError(res.estimate.notes || 'No reconocimos comida en la foto.');
        setItems([blankItem()]);
      } else {
        setName(res.estimate.meal_name);
        setItems(res.estimate.items.map(toEditable));
      }
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo analizar la foto.');
      setPhase('error');
    }
  }

  const totals = sumItems(items);
  const valid = items.length > 0 && items.every(itemIsValid);

  async function onSave() {
    await save.mutateAsync({
      id: params.id ?? null,
      eatenAt,
      mealType,
      name: name || items[0]?.name,
      items: toSavePayload(items),
      photoPath: params.id ? undefined : photoPath,
      source: photoPath ? 'photo' : 'manual',
      aiRaw: estimate,
      aiModel: model,
    });
    saved.current = true;
    router.back();
  }

  async function onDelete() {
    if (!existing.data) return;
    if (await confirm('Eliminar comida', `¿Eliminar "${existing.data.name}"? También se borra su foto.`, 'Eliminar')) {
      saved.current = true;
      await del.mutateAsync(existing.data);
      router.back();
    }
  }

  const update = (key: string, patch: Partial<EditableItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch, edited: true } : i)));

  const photo = localUri ?? remoteUrl.data ?? null;
  const busy = phase === 'uploading' || phase === 'analyzing';

  if (params.id && existing.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: params.id ? 'Editar comida' : 'Nueva comida' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          {photo ? (
            <View style={{ borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface }}>
              <Image source={{ uri: photo }} style={{ width: '100%', aspectRatio: 4 / 3 }} resizeMode="cover" />
              {busy ? (
                <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(11,11,15,0.6)', alignItems: 'center', justifyContent: 'center', gap: space.sm }}>
                  <ActivityIndicator color={colors.accent} size="large" />
                  <Text testID="analyzing" variant="h3">{phase === 'uploading' ? 'Subiendo foto…' : 'Analizando comida…'}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {estimate?.is_food ? (
            <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
              <Ionicons name="sparkles" size={18} color={colors.accent} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="small" style={{ color: colors.accent }}>Estimado por IA · {CONFIDENCE[estimate.confidence]}</Text>
                <Text variant="small" muted>{estimate.notes || 'Revisá las porciones y corregí lo que haga falta.'}</Text>
              </View>
            </Card>
          ) : null}

          {error ? (
            <Card style={{ gap: space.md, borderColor: colors.danger }}>
              <Text testID="meal-error" style={{ color: colors.danger }}>{error}</Text>
              {phase === 'error' ? (
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  {photoPath ? <Button title="Reintentar" variant="secondary" style={{ flex: 1 }} onPress={() => runAnalysis(photoPath, note)} /> : null}
                  <Button title="Cargar a mano" variant="ghost" style={{ flex: 1 }} onPress={() => { setItems([blankItem()]); setPhase('ready'); setError(null); }} />
                </View>
              ) : null}
            </Card>
          ) : null}

          {photoPath && !params.id && phase === 'ready' ? (
            <View style={{ gap: space.sm }}>
              <Input
                testID="meal-note"
                label="¿Algo que la foto no muestra?"
                value={note}
                onChangeText={setNote}
                placeholder="Ej. frito en manteca, 2 cucharadas de azúcar"
                maxLength={300}
              />
              {note.trim() ? (
                <Button testID="reanalyze" title="Reanalizar con esta nota" variant="secondary" onPress={() => runAnalysis(photoPath, note)} />
              ) : null}
            </View>
          ) : null}

          {phase === 'ready' ? (
            <>
              <Input testID="meal-name" label="Nombre" value={name} onChangeText={setName} placeholder="Ej. Almuerzo" maxLength={80} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {MEAL_TYPES.map((t) => (
                  <Chip key={t.value} testID={`type-${t.value}`} label={t.label} selected={mealType === t.value} onPress={() => setMealType(t.value)} />
                ))}
              </View>

              <Card style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <Total label="kcal" value={totals.kcal} color={colors.accent} testID="meal-kcal" />
                <Total label="Prot" value={totals.protein_g} color={colors.protein} />
                <Total label="Carbs" value={totals.carbs_g} color={colors.carbs} />
                <Total label="Grasas" value={totals.fat_g} color={colors.fat} />
              </Card>

              {items.map((i, idx) => (
                <Card key={i.key} style={{ gap: space.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <TextInput
                      testID={`item-name-${idx}`}
                      value={i.name}
                      onChangeText={(t) => update(i.key, { name: t })}
                      placeholder="Alimento"
                      placeholderTextColor={colors.textFaint}
                      maxLength={80}
                      style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: '600' }}
                    />
                    <Pressable testID={`item-remove-${idx}`} onPress={() => setItems((l) => l.filter((x) => x.key !== i.key))} hitSlop={8}>
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <Field testID={`item-grams-${idx}`} label="g" value={i.grams} onChange={(t) => setItems((l) => l.map((x) => (x.key === i.key ? rescaleItem(x, t) : x)))} />
                    <Field testID={`item-kcal-${idx}`} label="kcal" value={i.kcal} onChange={(t) => update(i.key, { kcal: t })} />
                    <Field label="P" value={i.protein_g} onChange={(t) => update(i.key, { protein_g: t })} />
                    <Field label="C" value={i.carbs_g} onChange={(t) => update(i.key, { carbs_g: t })} />
                    <Field label="G" value={i.fat_g} onChange={(t) => update(i.key, { fat_g: t })} />
                  </View>
                </Card>
              ))}
              <Pressable testID="add-item" onPress={() => setItems((l) => [...l, blankItem()])} style={{ paddingVertical: space.sm }}>
                <Text style={{ color: colors.accent, textAlign: 'center' }}>+ Agregar alimento</Text>
              </Pressable>
            </>
          ) : null}

          {params.id ? <Button title="Eliminar comida" variant="danger" onPress={onDelete} /> : null}
        </ScrollView>

        {phase === 'ready' ? (
          <View style={{ position: 'absolute', left: space.xl, right: space.xl, bottom: space.xl }}>
            <Button testID="save-meal" title="Guardar" onPress={onSave} disabled={!valid} loading={save.isPending} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </>
  );
}

function Field({ label, value, onChange, testID }: { label: string; value: string; onChange: (t: string) => void; testID?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="caption" muted style={{ textAlign: 'center' }}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9.,]/g, ''))}
        keyboardType="decimal-pad"
        selectTextOnFocus
        maxLength={6}
        style={{ height: 36, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh, color: colors.text, textAlign: 'center', fontSize: 15, fontWeight: '600' }}
      />
    </View>
  );
}

function Total({ label, value, color, testID }: { label: string; value: number; color: string; testID?: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text testID={testID} variant="h3" style={{ color }}>{value}</Text>
      <Text variant="caption" muted>{label}</Text>
    </View>
  );
}
