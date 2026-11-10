import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { ActivityLevel, Experience, Goal, Sex } from './nutrition';

export interface Profile {
  id: string;
  display_name: string | null;
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
  experience: Experience | null;
  onboarded_at: string | null;
}

type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AuthState {
  /** True until the stored session and, if signed in, its profile are known. */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  profileStatus: ProfileStatus;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle');

  const userId = session?.user.id ?? null;

  const loadProfile = useCallback(async (id: string | null) => {
    if (!id) {
      setProfile(null);
      setProfileStatus('idle');
      return;
    }
    setProfileStatus('loading');
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) {
      console.warn('Could not load profile', error.message);
      setProfileStatus('error');
      return;
    }
    setProfile(data as Profile | null);
    setProfileStatus('ready');
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Reload the profile whenever the signed-in user changes (not on token refresh).
  useEffect(() => {
    loadProfile(userId);
  }, [userId, loadProfile]);

  const loading = !sessionLoaded || (userId !== null && (profileStatus === 'idle' || profileStatus === 'loading') && profile?.id !== userId);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile: profile?.id === userId ? profile : null,
      profileStatus,
      refreshProfile: () => loadProfile(userId),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, session, profile, profileStatus, userId, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
