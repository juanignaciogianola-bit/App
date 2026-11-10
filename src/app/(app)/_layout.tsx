import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="routine/[id]" options={{ title: 'Rutina' }} />
      <Stack.Screen name="workout/active" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="workout/[id]" options={{ title: 'Entrenamiento' }} />
      <Stack.Screen name="exercise/[id]" options={{ title: 'Progreso' }} />
      <Stack.Screen name="exercise/new" options={{ title: 'Nuevo ejercicio', presentation: 'modal' }} />
      <Stack.Screen name="exercise-picker" options={{ title: 'Ejercicios', presentation: 'modal' }} />
      <Stack.Screen name="history" options={{ title: 'Historial' }} />
      <Stack.Screen name="meal/edit" options={{ title: 'Comida' }} />
    </Stack>
  );
}
