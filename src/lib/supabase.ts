import './storage';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

// A relative URL ("/sb") means "same origin as the web app" (used behind a dev proxy).
const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const url =
  rawUrl?.startsWith('/') && Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}${rawUrl}`
    : rawUrl;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

// The publishable key is safe to ship; it only grants what RLS allows.
export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  auth: {
    storage: typeof localStorage === 'undefined' ? undefined : localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Only refresh tokens while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
