// Integration test for the analyze-physique edge function on the local stack (+ Anthropic mock).
const fs = require('fs');
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const status = JSON.parse(execSync('npx supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
const URL = status.API_URL;
const MOCK_LOG = process.env.MOCK_LOG || '/tmp/anthropic-mock-last.json';
const ok = (cond, label) => { if (!cond) throw new Error('FAILED: ' + label); console.log('ok - ' + label); };
const img = (n) => fs.readFileSync(`e2e/fixtures/${n}.jpg`);

async function newUser(birth = '1996-01-15') {
  const c = createClient(URL, status.PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signUp({ email: `ph-${Date.now()}-${Math.random().toString(36).slice(2)}@forma.dev`, password: 'supersecret1' });
  if (error) throw error;
  const r = await c.rpc('complete_onboarding', {
    p_sex: 'male', p_birth_date: birth, p_height_cm: 180, p_weight_kg: 80, p_activity_level: 'moderate',
    p_goal: 'bulk', p_experience: 'intermediate', p_kcal: 3030, p_protein_g: 160, p_carbs_g: 456, p_fat_g: 64,
  });
  if (r.error) throw r.error;
  return { c, user: data.user };
}

async function newSession(u, sideFixture = 'physique-side') {
  const { data: s, error } = await u.c.from('physique_sessions').insert({ weight_kg: 80 }).select('id').single();
  if (error) throw error;
  const paths = {};
  for (const [pose, fx] of [['front', 'physique-front'], ['back', 'physique-back'], ['side', sideFixture]]) {
    const p = `${u.user.id}/${s.id}/${pose}.jpg`;
    const up = await u.c.storage.from('physique-photos').upload(p, img(fx), { contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    paths[`${pose}_path`] = p;
  }
  const upd = await u.c.from('physique_sessions').update(paths).eq('id', s.id);
  if (upd.error) throw upd.error;
  return s.id;
}

async function call(c, body) {
  const { data: s } = await c.auth.getSession();
  const res = await fetch(`${URL}/functions/v1/analyze-physique`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: status.PUBLISHABLE_KEY, authorization: `Bearer ${s.session.access_token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

(async () => {
  const a = await newUser();
  // Give A some training history: chest work, no calves
  const { data: bench } = await a.c.from('exercises').select('id').eq('slug', 'bench_press').single();
  await a.c.rpc('finish_workout', {
    p_name: 'Push', p_routine_id: null, p_started_at: new Date(Date.now() - 2 * 864e5).toISOString(),
    p_ended_at: new Date(Date.now() - 2 * 864e5 + 3600e3).toISOString(),
    p_sets: [0, 1, 2, 3].map((i) => ({ exercise_id: bench.id, exercise_position: 0, set_index: i, reps: 8, weight_kg: 80 })),
  });
  await a.c.from('routines').insert({ name: 'Push' });

  const sessionId = await newSession(a);
  const r = await call(a.c, { session_id: sessionId });
  ok(r.status === 200, `analysis returns 200 (got ${r.status} ${JSON.stringify(r.body)?.slice(0, 200)})`);
  const an = r.body.analysis;
  ok(an.lagging.map((l) => l.muscle_id).join() === 'calves,side_delts', 'lagging muscles stored');
  ok(an.routine_suggestions.length === 3 && an.routine_suggestions.every((s) => /^[0-9a-f-]{36}$/.test(s.exercise_id)), 'suggestions mapped to catalog exercise ids');

  const sent = JSON.parse(fs.readFileSync(MOCK_LOG, 'utf8'));
  ok(sent.images.length === 3, 'sends the three photos');
  ok(sent.texts.slice(0, 3).join('|') === 'Foto 1: frente|Foto 2: espalda|Foto 3: perfil', 'photos are labelled by pose');
  ok(sent.output_config.effort === 'high' && sent.output_config.format.type === 'json_schema', 'high effort + structured output');
  const brief = sent.texts[sent.texts.length - 1];
  ok(brief.includes('- chest: 1') && brief.includes('- calves: 0'), 'briefing includes 4-week average volume (4 sets / 4 weeks)');
  ok(brief.includes('objetivo bulk') && brief.includes('3030 kcal'), 'briefing includes goal and targets');
  ok(brief.includes('standing_calf_raise — Elevación de talones de pie — calves'), 'briefing includes the exercise catalog');
  ok(sent.output_config.format.schema.properties.routine_suggestions.items.properties.exercise_slug.enum.includes('lateral_raise'), 'exercise slugs constrained by enum');

  // Apply suggestions to a routine through the RPC the app uses
  const { data: routine } = await a.c.from('routines').select('id').eq('name', 'Push').single();
  const added = await a.c.rpc('add_suggestions_to_routine', { p_analysis_id: an.id, p_routine_id: routine.id, p_indexes: [0, 2] });
  ok(added.data === 2, 'two suggestions added to the routine');

  // Second analysis mentions the first
  const second = await newSession(a);
  await call(a.c, { session_id: second });
  const sent2 = JSON.parse(fs.readFileSync(MOCK_LOG, 'utf8'));
  ok(sent2.texts[sent2.texts.length - 1].includes('Análisis anterior'), 'previous analysis is given for comparison');

  // Unusable photos -> 422 with reason, nothing stored
  const bad = await newSession(a, 'tiny');
  const r3 = await call(a.c, { session_id: bad });
  ok(r3.status === 422 && r3.body.message.includes('perfil'), 'unusable photos -> 422 with the reason');
  const { count } = await a.c.from('physique_analyses').select('id', { count: 'exact', head: true }).eq('session_id', bad);
  ok(count === 0, 'no analysis stored for unusable photos');

  // Access control
  const b = await newUser();
  ok((await call(b.c, { session_id: sessionId })).status === 404, 'another user cannot analyse A\'s session');
  const minor = await newUser('2010-05-05');
  ok((await call(minor.c, { session_id: sessionId })).status === 403, 'under-18 users are refused');
  ok((await call(a.c, { session_id: 'x' })).status === 400, 'bad session id -> 400');
  const { data: empty } = await a.c.from('physique_sessions').insert({}).select('id').single();
  ok((await call(a.c, { session_id: empty.id })).status === 400, 'missing photos -> 400');
  const peek = await b.c.storage.from('physique-photos').download(`${a.user.id}/${sessionId}/front.jpg`);
  ok(!!peek.error, 'another user cannot download A\'s physique photo');

  console.log('analyze-physique integration test passed');
})().catch((e) => { console.error(e.message || e); process.exit(1); });
