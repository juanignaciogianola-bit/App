import { Screen, Text } from '@/components/ui';
import { space } from '@/theme';

export default function Placeholder() {
  return (
    <Screen edges={['top']} style={{ padding: space.xl, gap: space.sm }}>
      <Text variant="h1">Físico</Text>
      <Text muted>Llega en la etapa 4.</Text>
    </Screen>
  );
}
