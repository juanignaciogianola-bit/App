import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useCreateExercise, useMuscles } from '@/lib/api';
import { EQUIPMENT_LABEL } from '@/lib/training';
import type { MuscleId } from '@/lib/types';
import { Button, Chip, Input, Text } from '@/components/ui';
import { colors, space } from '@/theme';

export default function NewExercise() {
  const muscles = useMuscles();
  const create = useCreateExercise();
  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState('machine');
  const [primary, setPrimary] = useState<MuscleId[]>([]);
  const [secondary, setSecondary] = useState<MuscleId[]>([]);

  const toggle = (list: MuscleId[], set: (l: MuscleId[]) => void, m: MuscleId) =>
    set(list.includes(m) ? list.filter((x) => x !== m) : [...list, m]);

  const valid = name.trim().length >= 2 && primary.length > 0;

  async function save() {
    await create.mutateAsync({ name, equipment, primary, secondary });
    router.back();
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
      <Input testID="new-exercise-name" label="Nombre" value={name} onChangeText={setName} maxLength={80} placeholder="Ej. Press en máquina convergente" />

      <View style={{ gap: space.sm }}>
        <Text variant="caption" muted>Equipamiento</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {Object.entries(EQUIPMENT_LABEL).map(([k, label]) => (
            <Chip key={k} label={label} selected={equipment === k} onPress={() => setEquipment(k)} />
          ))}
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="caption" muted>Músculos principales (cuentan 1 serie)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {muscles.data?.map((m) => (
            <Chip key={m.id} testID={`primary-${m.id}`} label={m.name} selected={primary.includes(m.id)} onPress={() => toggle(primary, setPrimary, m.id)} />
          ))}
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="caption" muted>Músculos secundarios (cuentan media serie)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {muscles.data
            ?.filter((m) => !primary.includes(m.id))
            .map((m) => (
              <Chip key={m.id} label={m.name} selected={secondary.includes(m.id)} onPress={() => toggle(secondary, setSecondary, m.id)} />
            ))}
        </View>
      </View>

      {create.error ? <Text style={{ color: colors.danger }}>{create.error.message}</Text> : null}
      <Button testID="save-exercise" title="Guardar ejercicio" onPress={save} disabled={!valid} loading={create.isPending} />
    </ScrollView>
  );
}
