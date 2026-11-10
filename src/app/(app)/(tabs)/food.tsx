import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCurrentTargets } from '@/lib/useTargets';
import { useDayMeals, useDayTotals, usePhotoUrl, type Meal } from '@/lib/meals';
import { MEAL_TYPES, isSameDay } from '@/lib/mealMath';
import { useMealDraft } from '@/lib/mealDraft';
import { notify } from '@/lib/confirm';
import { Ring } from '@/components/Ring';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { isoDay, useNutritionDaily } from '@/lib/api';
import { weekdayInitial } from '@/lib/chartScale';
import { Button, Card, EmptyState, ProgressBar, Screen, Text } from '@/components/ui';
import { colors, radius, space } from '@/theme';

function dayLabel(d: Date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, today)) return 'Hoy';
  if (isSameDay(d, yesterday)) return 'Ayer';
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' });
}

export default function Food() {
  const [day, setDay] = useState(() => new Date());
  const { targets } = useCurrentTargets();
  const totals = useDayTotals(day);
  const meals = useDayMeals(day);
  const setPicked = useMealDraft((s) => s.setPicked);
  const week = useNutritionDaily(new Date());
  const isToday = isSameDay(day, new Date());

  const shift = (n: number) => setDay((d) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  });

  async function pick(source: 'camera' | 'library') {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return notify('Sin acceso a la cámara', 'Habilitá el permiso de cámara en Ajustes para sacar fotos de tus comidas.');
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setPicked({ uri: a.uri, width: a.width, height: a.height }, day);
    router.push({ pathname: '/meal/edit', params: { mode: 'photo' } });
  }

  const t = totals.data ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, meals: 0 };

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable testID="prev-day" onPress={() => shift(-1)} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text testID="day-label" variant="h2" style={{ textTransform: 'capitalize' }}>{dayLabel(day)}</Text>
          <Pressable testID="next-day" onPress={() => shift(1)} disabled={isToday} hitSlop={10} style={{ opacity: isToday ? 0.25 : 1 }}>
            <Ionicons name="chevron-forward" size={24} color={colors.text} />
          </Pressable>
        </View>

        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <Ring value={t.kcal} target={targets?.kcal ?? 0} size={136} />
          <View style={{ flex: 1, gap: space.md }}>
            <Macro label="Proteína" value={t.protein_g} target={targets?.protein_g} color={colors.protein} />
            <Macro label="Carbos" value={t.carbs_g} target={targets?.carbs_g} color={colors.carbs} />
            <Macro label="Grasas" value={t.fat_g} target={targets?.fat_g} color={colors.fat} />
          </View>
        </Card>
        <Text testID="day-consumed" variant="small" muted style={{ textAlign: 'center', marginTop: -space.sm }}>
          {Math.round(t.kcal)} de {targets?.kcal ?? '—'} kcal consumidas
        </Text>

        {week.data ? (
          <Card style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text variant="caption" muted>Últimos 7 días</Text>
              <Text variant="small" muted>
                Promedio {Math.round(week.data.filter((d) => d.kcal > 0).reduce((a, d) => a + d.kcal, 0) / Math.max(1, week.data.filter((d) => d.kcal > 0).length))} kcal
              </Text>
            </View>
            <ColumnChart
              testID="week-kcal-chart"
              data={week.data.map((d) => ({ key: d.day, label: weekdayInitial(d.day), value: d.kcal }))}
              target={targets?.kcal}
              targetLabel={targets ? `Objetivo ${targets.kcal}` : undefined}
              selectedKey={isoDay(day)}
              onSelect={(k) => setDay(new Date(`${k}T12:00:00`))}
            />
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Button testID="photo-camera" title="Sacar foto" onPress={() => pick('camera')} style={{ flex: 1 }} />
          <Button testID="photo-library" title="Galería" variant="secondary" onPress={() => pick('library')} style={{ flex: 1 }} />
        </View>
        <Pressable testID="manual-meal" onPress={() => { setPicked(null, day); router.push({ pathname: '/meal/edit', params: { mode: 'manual' } }); }}>
          <Text style={{ color: colors.accent, textAlign: 'center' }}>+ Cargar a mano</Text>
        </Pressable>

        {meals.data?.length ? (
          MEAL_TYPES.map(({ value, label }) => {
            const list = meals.data!.filter((m) => m.meal_type === value);
            if (!list.length) return null;
            const kcal = Math.round(list.reduce((s, m) => s + m.meal_items.reduce((a, i) => a + i.kcal, 0), 0));
            return (
              <View key={value} style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="caption" muted>{label}</Text>
                  <Text variant="caption" muted>{kcal} kcal</Text>
                </View>
                {list.map((m) => <MealRow key={m.id} meal={m} />)}
              </View>
            );
          })
        ) : meals.isLoading ? null : (
          <EmptyState title="Sin comidas" body={isToday ? 'Sacale una foto a tu próxima comida.' : 'No registraste comidas este día.'} />
        )}
      </ScrollView>
    </Screen>
  );
}

function MealRow({ meal }: { meal: Meal }) {
  const url = usePhotoUrl('meal-photos', meal.photo_path);
  const kcal = Math.round(meal.meal_items.reduce((a, i) => a + i.kcal, 0));
  const p = Math.round(meal.meal_items.reduce((a, i) => a + i.protein_g, 0));
  return (
    <Pressable testID={`meal-${meal.name}`} onPress={() => router.push({ pathname: '/meal/edit', params: { id: meal.id } })}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md }}>
        {url.data ? (
          <Image source={{ uri: url.data }} style={{ width: 52, height: 52, borderRadius: radius.sm }} />
        ) : (
          <View style={{ width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="restaurant-outline" size={20} color={colors.textMuted} />
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3" numberOfLines={1}>{meal.name}</Text>
          <Text variant="small" muted numberOfLines={1}>{meal.meal_items.map((i) => i.name).join(', ')}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="h3">{kcal}</Text>
          <Text variant="small" muted>{p} g prot</Text>
        </View>
      </Card>
    </Pressable>
  );
}

function Macro({ label, value, target, color }: { label: string; value: number; target?: number; color: string }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="small" muted>{label}</Text>
        <Text variant="small">{Math.round(value)}/{target ?? '—'} g</Text>
      </View>
      <ProgressBar value={target ? value / target : 0} color={color} />
    </View>
  );
}
