import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  computeTargets,
  validateProfile,
  type ActivityLevel,
  type BodyProfile,
  type Experience,
  type Goal,
  type Sex,
} from '@/lib/nutrition';
import { Button, Card, Choice, Input, ProgressBar, Screen, Text } from '@/components/ui';
import { colors, space } from '@/theme';

const ACTIVITY: { value: ActivityLevel; label: string; description: string }[] = [
  { value: 'sedentary', label: 'Sedentario', description: 'Trabajo de escritorio, casi sin ejercicio' },
  { value: 'light', label: 'Ligero', description: 'Entreno 1–3 días por semana' },
  { value: 'moderate', label: 'Moderado', description: 'Entreno 3–5 días por semana' },
  { value: 'active', label: 'Activo', description: 'Entreno 6–7 días por semana' },
  { value: 'very_active', label: 'Muy activo', description: 'Trabajo físico + entreno diario' },
];

const GOALS: { value: Goal; label: string; description: string }[] = [
  { value: 'bulk', label: 'Volumen', description: 'Ganar músculo con superávit calórico (+10 %)' },
  { value: 'cut', label: 'Definición', description: 'Perder grasa manteniendo músculo (−20 %)' },
  { value: 'maintain', label: 'Mantener', description: 'Recomposición a calorías de mantenimiento' },
];

const EXPERIENCE: { value: Experience; label: string; description: string }[] = [
  { value: 'beginner', label: 'Principiante', description: 'Menos de 1 año entrenando con constancia' },
  { value: 'intermediate', label: 'Intermedio', description: '1 a 3 años' },
  { value: 'advanced', label: 'Avanzado', description: 'Más de 3 años' },
];

interface Draft {
  sex?: Sex;
  day: string;
  month: string;
  year: string;
  height: string;
  weight: string;
  activityLevel?: ActivityLevel;
  goal?: Goal;
  experience?: Experience;
}

const STEPS = ['sex', 'birth', 'body', 'activity', 'goal', 'experience', 'summary'] as const;
type Step = (typeof STEPS)[number];

const num = (s: string) => Number(s.replace(',', '.'));
const pad = (s: string) => s.padStart(2, '0');

function toBodyProfile(d: Draft): BodyProfile | null {
  if (!d.sex || !d.activityLevel || !d.goal) return null;
  return {
    sex: d.sex,
    birthDate: `${d.year}-${pad(d.month)}-${pad(d.day)}`,
    heightCm: num(d.height),
    weightKg: num(d.weight),
    activityLevel: d.activityLevel,
    goal: d.goal,
  };
}

function isRealDate(y: string, m: string, d: string) {
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return (
    y.length === 4 &&
    date.getFullYear() === Number(y) &&
    date.getMonth() === Number(m) - 1 &&
    date.getDate() === Number(d)
  );
}

export default function Onboarding() {
  const { refreshProfile, signOut } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>({ day: '', month: '', year: '', height: '', weight: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step: Step = STEPS[stepIndex];
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // Field-level validation for the current step.
  const stepError = useMemo((): string | null => {
    switch (step) {
      case 'sex':
        return draft.sex ? null : '';
      case 'birth': {
        if (!draft.day || !draft.month || !draft.year) return '';
        if (!isRealDate(draft.year, draft.month, draft.day)) return 'Fecha inválida';
        const errs = validateProfile({
          sex: 'male', birthDate: `${draft.year}-${pad(draft.month)}-${pad(draft.day)}`,
          heightCm: 170, weightKg: 70, activityLevel: 'light', goal: 'maintain',
        });
        return errs[0] ?? null;
      }
      case 'body': {
        if (!draft.height || !draft.weight) return '';
        const errs = validateProfile({
          sex: 'male', birthDate: '1995-01-01', heightCm: num(draft.height), weightKg: num(draft.weight),
          activityLevel: 'light', goal: 'maintain',
        });
        return errs[0] ?? null;
      }
      case 'activity':
        return draft.activityLevel ? null : '';
      case 'goal':
        return draft.goal ? null : '';
      case 'experience':
        return draft.experience ? null : '';
      case 'summary':
        return null;
    }
  }, [step, draft]);

  const body = toBodyProfile(draft);
  const targets = step === 'summary' && body ? computeTargets(body) : null;

  async function finish() {
    if (!body || !targets || !draft.experience) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.rpc('complete_onboarding', {
      p_sex: body.sex,
      p_birth_date: body.birthDate,
      p_height_cm: body.heightCm,
      p_weight_kg: body.weightKg,
      p_activity_level: body.activityLevel,
      p_goal: body.goal,
      p_experience: draft.experience,
      p_kcal: targets.kcal,
      p_protein_g: targets.proteinG,
      p_carbs_g: targets.carbsG,
      p_fat_g: targets.fatG,
    });
    if (error) {
      setSaving(false);
      setError('No se pudo guardar. Intentá de nuevo.');
      return;
    }
    await refreshProfile(); // the root gate switches to the tabs
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.md }}>
          <ProgressBar value={(stepIndex + 1) / STEPS.length} />
          <Text variant="caption" muted>
            Paso {stepIndex + 1} de {STEPS.length}
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.md }} keyboardShouldPersistTaps="handled">
          {step === 'sex' && (
            <>
              <Title title="¿Cuál es tu sexo biológico?" subtitle="Lo usamos para estimar tu metabolismo basal." />
              <Choice testID="sex-male" label="Masculino" selected={draft.sex === 'male'} onPress={() => set({ sex: 'male' })} />
              <Choice testID="sex-female" label="Femenino" selected={draft.sex === 'female'} onPress={() => set({ sex: 'female' })} />
            </>
          )}

          {step === 'birth' && (
            <>
              <Title title="¿Cuándo naciste?" subtitle="Tu edad cambia cuántas calorías quemás en reposo." />
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <Input containerStyle={{ flex: 1 }} testID="day" label="Día" value={draft.day} onChangeText={(t) => set({ day: t.replace(/\D/g, '').slice(0, 2) })} keyboardType="number-pad" placeholder="DD" />
                <Input containerStyle={{ flex: 1 }} testID="month" label="Mes" value={draft.month} onChangeText={(t) => set({ month: t.replace(/\D/g, '').slice(0, 2) })} keyboardType="number-pad" placeholder="MM" />
                <Input containerStyle={{ flex: 1 }} testID="year" label="Año" value={draft.year} onChangeText={(t) => set({ year: t.replace(/\D/g, '').slice(0, 4) })} keyboardType="number-pad" placeholder="AAAA" />
              </View>
            </>
          )}

          {step === 'body' && (
            <>
              <Title title="Altura y peso" subtitle="Podés actualizar tu peso cuando quieras." />
              <Input testID="height" label="Altura" suffix="cm" value={draft.height} onChangeText={(t) => set({ height: t })} keyboardType="decimal-pad" placeholder="175" />
              <Input testID="weight" label="Peso" suffix="kg" value={draft.weight} onChangeText={(t) => set({ weight: t })} keyboardType="decimal-pad" placeholder="75" />
            </>
          )}

          {step === 'activity' && (
            <>
              <Title title="¿Qué tan activo sos?" subtitle="Contando trabajo y entrenamiento." />
              {ACTIVITY.map((o) => (
                <Choice key={o.value} testID={`activity-${o.value}`} label={o.label} description={o.description} selected={draft.activityLevel === o.value} onPress={() => set({ activityLevel: o.value })} />
              ))}
            </>
          )}

          {step === 'goal' && (
            <>
              <Title title="¿Cuál es tu objetivo?" />
              {GOALS.map((o) => (
                <Choice key={o.value} testID={`goal-${o.value}`} label={o.label} description={o.description} selected={draft.goal === o.value} onPress={() => set({ goal: o.value })} />
              ))}
            </>
          )}

          {step === 'experience' && (
            <>
              <Title title="¿Cuánta experiencia tenés?" subtitle="Ajusta el volumen recomendado por músculo." />
              {EXPERIENCE.map((o) => (
                <Choice key={o.value} testID={`exp-${o.value}`} label={o.label} description={o.description} selected={draft.experience === o.value} onPress={() => set({ experience: o.value })} />
              ))}
            </>
          )}

          {step === 'summary' && targets && (
            <>
              <Title title="Tu plan" subtitle="Calculado con Mifflin-St Jeor según tu actividad y objetivo." />
              <Card style={{ alignItems: 'center', paddingVertical: space.xxl, gap: space.xs }}>
                <Text variant="caption" muted>Objetivo diario</Text>
                <Text testID="kcal" style={{ fontSize: 52, fontWeight: '800', color: colors.accent, letterSpacing: -1 }}>
                  {targets.kcal}
                </Text>
                <Text muted>kcal · mantenimiento ≈ {targets.tdee}</Text>
              </Card>
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <Macro label="Proteína" grams={targets.proteinG} color={colors.protein} />
                <Macro label="Carbos" grams={targets.carbsG} color={colors.carbs} />
                <Macro label="Grasas" grams={targets.fatG} color={colors.fat} />
              </View>
              {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
            </>
          )}

          {stepError ? <Text style={{ color: colors.danger }}>{stepError}</Text> : null}
        </ScrollView>

        <View style={{ padding: space.xl, gap: space.sm }}>
          {step === 'summary' ? (
            <Button testID="finish" title="Empezar" onPress={finish} loading={saving} />
          ) : (
            <Button testID="next" title="Continuar" onPress={() => setStepIndex((i) => i + 1)} disabled={stepError !== null} />
          )}
          {stepIndex > 0 ? (
            <Button title="Atrás" variant="ghost" onPress={() => setStepIndex((i) => i - 1)} />
          ) : (
            <Button title="Cerrar sesión" variant="ghost" onPress={signOut} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Title({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: space.xs, marginBottom: space.md }}>
      <Text variant="h1">{title}</Text>
      {subtitle ? <Text muted>{subtitle}</Text> : null}
    </View>
  );
}

function Macro({ label, grams, color }: { label: string; grams: number; color: string }) {
  return (
    <Card style={{ flex: 1, gap: space.xs }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text variant="h2">{grams} g</Text>
      <Text variant="small" muted>{label}</Text>
    </Card>
  );
}
