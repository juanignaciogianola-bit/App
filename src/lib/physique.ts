import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { functionErrorMessage, preparePhoto } from './meals';
import { keys } from './api';
import { physiquePhotoPath, POSES, type MuscleId, type Pose } from '../../supabase/functions/_shared/physique';

export { POSES, type Pose };

export interface PhysiqueAnalysisRow {
  id: string;
  session_id: string;
  summary: string;
  strengths: { muscle_id: MuscleId; note: string }[];
  lagging: { muscle_id: MuscleId; severity: 'mild' | 'moderate' | 'marked'; note: string }[];
  imbalances: { note: string; muscles: MuscleId[] }[];
  routine_suggestions: {
    muscle_id: MuscleId;
    exercise_id: string;
    exercise_name: string;
    sets: number;
    rep_min: number;
    rep_max: number;
    reason: string;
  }[];
  diet_suggestions: { title: string; detail: string }[];
  model: string | null;
  created_at: string;
}

export interface PhysiqueSession {
  id: string;
  taken_at: string;
  weight_kg: number | null;
  front_path: string | null;
  back_path: string | null;
  side_path: string | null;
  physique_analyses: PhysiqueAnalysisRow[];
}

const SELECT = 'id, taken_at, weight_kg, front_path, back_path, side_path, physique_analyses(*)';

const latestFirst = (s: PhysiqueSession): PhysiqueSession => ({
  ...s,
  physique_analyses: [...s.physique_analyses].sort((a, b) => b.created_at.localeCompare(a.created_at)),
});

export const physiqueKeys = {
  all: ['physique'] as const,
  one: (id: string) => ['physique', id] as const,
};

export function useSessions() {
  return useQuery({
    queryKey: physiqueKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase.from('physique_sessions').select(SELECT).order('taken_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data as unknown as PhysiqueSession[]).map(latestFirst);
    },
  });
}

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: physiqueKeys.one(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('physique_sessions').select(SELECT).eq('id', id!).single();
      if (error) throw new Error(error.message);
      return latestFirst(data as unknown as PhysiqueSession);
    },
  });
}

export type PickedPhoto = { uri: string; width: number; height: number };

/** Creates the session, uploads the three photos into its folder and stores their paths. */
export async function createSession(photos: Record<Pose, PickedPhoto>, weightKg: number | null): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sin sesión');
  const { data: s, error } = await supabase.from('physique_sessions').insert({ weight_kg: weightKg }).select('id').single();
  if (error) throw new Error(error.message);
  const uploaded: string[] = [];
  try {
    const paths: Record<string, string> = {};
    for (const pose of POSES) {
      const p = photos[pose];
      const uri = await preparePhoto(p.uri, p.width, p.height, 1600);
      const path = physiquePhotoPath(auth.user.id, s.id, pose);
      const body = await (await fetch(uri)).arrayBuffer();
      const up = await supabase.storage.from('physique-photos').upload(path, body, { contentType: 'image/jpeg' });
      if (up.error) throw new Error(up.error.message);
      uploaded.push(path);
      paths[`${pose}_path`] = path;
    }
    const upd = await supabase.from('physique_sessions').update(paths).eq('id', s.id);
    if (upd.error) throw new Error(upd.error.message);
    return s.id;
  } catch (e) {
    // Never leave half-uploaded private photos behind.
    if (uploaded.length) await supabase.storage.from('physique-photos').remove(uploaded);
    await supabase.from('physique_sessions').delete().eq('id', s.id);
    throw e;
  }
}

export async function analyzeSession(sessionId: string): Promise<PhysiqueAnalysisRow> {
  const { data, error } = await supabase.functions.invoke('analyze-physique', { body: { session_id: sessionId } });
  if (error) throw new Error(await functionErrorMessage(error));
  return data.analysis;
}

const sessionPaths = (s: Pick<PhysiqueSession, 'front_path' | 'back_path' | 'side_path'>) =>
  [s.front_path, s.back_path, s.side_path].filter((p): p is string => !!p);

/** Photos are removed from storage first so they can never outlive the user's delete. */
export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: PhysiqueSession) => {
      const paths = sessionPaths(s);
      if (paths.length) {
        const { error } = await supabase.storage.from('physique-photos').remove(paths);
        if (error) throw new Error(error.message);
      }
      const { error } = await supabase.from('physique_sessions').delete().eq('id', s.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: physiqueKeys.all }),
  });
}

export function useDeleteAllPhysique() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('physique_sessions').select('id, front_path, back_path, side_path');
      if (error) throw new Error(error.message);
      const paths = (data ?? []).flatMap(sessionPaths);
      for (let i = 0; i < paths.length; i += 100) {
        const r = await supabase.storage.from('physique-photos').remove(paths.slice(i, i + 100));
        if (r.error) throw new Error(r.error.message);
      }
      const { data: auth } = await supabase.auth.getUser();
      const del = await supabase.from('physique_sessions').delete().eq('user_id', auth.user!.id);
      if (del.error) throw new Error(del.error.message);
      return paths.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: physiqueKeys.all }),
  });
}

export function useAddSuggestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { analysisId: string; routineId: string; indexes: number[] }) => {
      const { data, error } = await supabase.rpc('add_suggestions_to_routine', {
        p_analysis_id: v.analysisId,
        p_routine_id: v.routineId,
        p_indexes: v.indexes,
      });
      if (error) throw new Error(error.message);
      return data as number;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.routines }),
  });
}

export const SEVERITY_LABEL = { mild: 'Leve', moderate: 'Moderado', marked: 'Marcado' } as const;
export const POSE_LABEL: Record<Pose, string> = { front: 'Frente', back: 'Espalda', side: 'Perfil' };
