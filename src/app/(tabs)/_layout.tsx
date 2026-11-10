import type { ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName) => ({ color, size }: { color: unknown; size: number }) => (
  <Ionicons name={name} color={(color ?? undefined) as ComponentProps<typeof Ionicons>['color']} size={size} />
);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoy', tabBarIcon: icon('today-outline') }} />
      <Tabs.Screen name="train" options={{ title: 'Entrenar', tabBarIcon: icon('barbell-outline') }} />
      <Tabs.Screen name="food" options={{ title: 'Comida', tabBarIcon: icon('restaurant-outline') }} />
      <Tabs.Screen name="physique" options={{ title: 'Físico', tabBarIcon: icon('body-outline') }} />
    </Tabs>
  );
}
