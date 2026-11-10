import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Button, Screen, Text } from '@/components/ui';
import { colors, space } from '@/theme';

function Gate() {
  const { loading, session, profile, profileStatus, refreshProfile, signOut } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <Screen style={{ padding: space.xl, justifyContent: 'center', gap: space.md }}>
        <Text variant="h2">Falta configurar Supabase</Text>
        <Text muted>
          Copiá .env.example a .env y completá EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
        </Text>
      </Screen>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (session && profileStatus === 'error') {
    return (
      <Screen style={{ padding: space.xl, justifyContent: 'center', gap: space.lg }}>
        <Text variant="h2">No pudimos cargar tu perfil</Text>
        <Text muted>Revisá tu conexión e intentá de nuevo.</Text>
        <Button title="Reintentar" onPress={refreshProfile} />
        <Button title="Cerrar sesión" variant="ghost" onPress={signOut} />
      </Screen>
    );
  }

  const signedIn = !!session;
  const onboarded = !!profile?.onboarded_at;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && onboarded}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
