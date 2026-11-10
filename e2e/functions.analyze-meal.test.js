// Integration test for the analyze-meal edge function on the local stack.
// Needs: `supabase start` (with supabase/functions/.env pointing to the mock) and
//        `node e2e/mocks/anthropic-mock.js` running.
const fs = require('fs');
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const status = JSON.parse(execSync('npx supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
const URL = status.API_URL;
const MOCK_LOG = process.env.MOCK_LOG || '/tmp/anthropic-mock-last.json';
const ok = (cond, label) => { if (!cond) throw new Error('FAILED: ' + label); console.log('ok - ' + label); };

async function newUser() {
  const c = createClient(URL, status.PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signUp({ email: `fn-${Date.now()}-${Math.random().toString(36).slice(2)}@forma.dev`, password: 'supersecret1' });
  if (error) throw error;
  return { c, user: data.user };
}
async function call(c, body, token) {
  const { data: s } = await c.auth.getSession();
  const res = await fetch(`${URL}/functions/v1/analyze-meal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: status.PUBLISHABLE_KEY, ...(token !== null ? { authorization: `Bearer ${token ?? s.session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

(async () => {
  const a = await newUser();
  const b = await newUser();
  const photo = fs.readFileSync('e2e/fixtures/plate.jpg');
  const path = `${a.user.id}/test-plate.jpg`;
  const up = await a.c.storage.from('meal-photos').upload(path, photo, { contentType: 'image/jpeg' });
  ok(!up.error, 'user uploads to their own folder');
  const bad = await a.c.storage.from('meal-photos').upload(`${b.user.id}/x.jpg`, photo, { contentType: 'image/jpeg' });
  ok(!!bad.error, 'storage RLS blocks uploading into another user\'s folder');

  const r = await call(a.c, { photo_path: path, note: 'milanesa de carne' });
  ok(r.status === 200, `analyze returns 200 (got ${r.status} ${JSON.stringify(r.body)})`);
  ok(r.body.estimate.items.length === 2 && r.body.estimate.items[0].kcal === 450, 'estimate is returned normalised');
  const sent = JSON.parse(fs.readFileSync(MOCK_LOG, 'utf8'));
  ok(sent.model === 'claude-opus-5-5', 'uses claude-opus-5-5');
  ok(sent.fallbacks === 'default' && String(sent.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01'), 'server-side refusal fallback enabled');
  ok(sent.output_config.format.type === 'json_schema' && sent.output_config.effort === 'low', 'structured output with low effort');
  ok(sent.images.length === 1 && sent.images[0].bytes === photo.length && sent.images[0].media_type === 'image/jpeg', 'the exact uploaded photo is sent');
  ok(sent.texts.some((t) => t.includes('milanesa de carne')), 'user note is forwarded');

  const nofood = await call(a.c, { photo_path: path, note: 'NOFOOD' });
  ok(nofood.status === 200 && nofood.body.estimate.is_food === false, 'non-food photos come back as is_food=false');

  ok((await call(b.c, { photo_path: path })).status === 400, 'another user cannot analyse A\'s photo (path check)');
  ok((await call(a.c, { photo_path: `${a.user.id}/missing.jpg` })).status === 404, 'missing photo -> 404');
  ok((await call(a.c, { photo_path: '../etc/passwd' })).status === 400, 'path traversal rejected');
  ok([401, 403].includes((await call(a.c, { photo_path: path }, null)).status), 'no token -> rejected');

  // Daily limit: fill the log with the service role, then expect 429
  const svc = createClient(URL, status.SECRET_KEY, { auth: { persistSession: false } });
  await svc.from('ai_requests').insert(Array.from({ length: 40 }, () => ({ user_id: a.user.id, kind: 'meal', ok: true })));
  const limited = await call(a.c, { photo_path: path });
  ok(limited.status === 429 && limited.body.error === 'daily_limit', 'daily AI limit enforced');
  const own = await a.c.from('ai_requests').select('id');
  ok(own.data.length >= 42, 'user can read their own AI usage');
  ok((await b.c.from('ai_requests').select('id')).data.length === 0, 'and not other users\'');

  console.log('analyze-meal integration test passed');
})().catch((e) => { console.error(e.message || e); process.exit(1); });
