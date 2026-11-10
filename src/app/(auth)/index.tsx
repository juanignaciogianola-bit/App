import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Button, Input, Screen, Text } from '@/components/ui';
import { colors, space } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const valid = EMAIL_RE.test(email.trim()) && password.length >= 8;

  async function submit() {
    setBusy(true);
    setError(null);
    setInfo(null);
    const creds = { email: email.trim().toLowerCase(), password };
    const { data, error } =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword(creds)
        : await supabase.auth.signUp(creds);
    setBusy(false);
    if (error) {
      setError(
        error.message.includes('Invalid login credentials')
          ? 'Email o contraseña incorrectos.'
          : error.message,
      );
      return;
    }
    // With email confirmation on, sign-up returns a user but no session.
    if (mode === 'signUp' && !data.session) {
      setInfo('Te enviamos un email para confirmar tu cuenta. Después iniciá sesión.');
      setMode('signIn');
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, padding: space.xl, justifyContent: 'center', gap: space.xl }}
      >
        <View style={{ gap: space.sm }}>
          <Text variant="caption" style={{ color: colors.accent }}>
            Forma
          </Text>
          <Text variant="h1">{mode === 'signIn' ? 'Bienvenido de vuelta' : 'Creá tu cuenta'}</Text>
          <Text muted>Entrenamiento, comida y físico en un solo lugar.</Text>
        </View>

        <View style={{ gap: space.md }}>
          <Input
            testID="email"
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="vos@ejemplo.com"
          />
          <Input
            testID="password"
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            placeholder="Mínimo 8 caracteres"
            onSubmitEditing={() => valid && submit()}
          />
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          {info ? <Text style={{ color: colors.accent }}>{info}</Text> : null}
        </View>

        <View style={{ gap: space.md }}>
          <Button
            testID="submit"
            title={mode === 'signIn' ? 'Iniciar sesión' : 'Crear cuenta'}
            onPress={submit}
            disabled={!valid}
            loading={busy}
          />
          <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')} style={{ padding: space.sm }}>
            <Text muted style={{ textAlign: 'center' }}>
              {mode === 'signIn' ? '¿No tenés cuenta? ' : '¿Ya tenés cuenta? '}
              <Text style={{ color: colors.accent }}>{mode === 'signIn' ? 'Registrate' : 'Iniciá sesión'}</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
