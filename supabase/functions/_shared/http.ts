import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.118.0';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const env = (...names: string[]) => {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  throw new Error(`missing env: ${names.join(' | ')}`);
};

/** Client acting as the caller (RLS applies) + the authenticated user. */
export async function getUserClient(req: Request): Promise<{ supabase: SupabaseClient; user: User }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized', 'Falta la sesión');
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(authHeader.slice('Bearer '.length));
  if (error || !data.user) throw new HttpError(401, 'unauthorized', 'Sesión inválida');
  return { supabase, user: data.user };
}

/** Service-role client: only for the AI usage log, never for user data. */
export function getServiceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Per-user rolling 24 h limit on AI calls, so a leaked session cannot run up the bill. */
export async function enforceDailyLimit(service: SupabaseClient, userId: string, kind: 'meal' | 'physique', limit: number) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error } = await service
    .from('ai_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', kind)
    .gte('created_at', since);
  if (error) throw new Error(error.message);
  if ((count ?? 0) >= limit) throw new HttpError(429, 'daily_limit', 'Llegaste al límite diario de análisis. Probá mañana.');
}

export async function logAiRequest(
  service: SupabaseClient,
  row: { user_id: string; kind: 'meal' | 'physique'; model?: string; input_tokens?: number; output_tokens?: number; ok: boolean },
) {
  const { error } = await service.from('ai_requests').insert(row);
  if (error) console.error('ai_requests insert failed', error.message);
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      console.error(e);
      return json({ error: 'internal', message: 'Error inesperado. Intentá de nuevo.' }, 500);
    }
  };
}
