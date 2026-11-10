// Stage 4 E2E against the local stack + Anthropic mock.
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const { launch, signUpAndOnboard, expectEqual } = require('./helpers');
const OUT = process.argv[2] || 'e2e/screenshots';
const status = JSON.parse(execSync('npx supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } });
const ok = (cond, label) => { if (!cond) throw new Error(label); console.log('ok - ' + label); };

async function storedPhotos(userId) {
  const { data: folders } = await admin.storage.from('physique-photos').list(userId);
  let n = 0;
  for (const f of folders ?? []) n += ((await admin.storage.from('physique-photos').list(`${userId}/${f.name}`)).data ?? []).length;
  return n;
}

async function newAnalysis(page, weight) {
  await page.getByRole('tab', { name: /Físico/ }).click();
  await page.getByTestId('new-physique').click();
  for (const pose of ['front', 'back', 'side']) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId(`pose-${pose}`).click();
    await (await chooser).setFiles(`e2e/fixtures/physique-${pose}.jpg`);
  }
  await page.getByTestId('physique-weight').fill(String(weight));
  await page.getByTestId('analyze-physique').click();
  await page.getByTestId('analysis-summary').waitFor({ timeout: 90000 });
}

(async () => {
  const { browser, page, errors, shot } = await launch(OUT);
  const email = `e2e-ph-${Date.now()}@forma.dev`;
  await signUpAndOnboard(page, { email });
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userId = users.users.find((u) => u.email === email).id;

  // A routine to receive the suggestions
  await page.getByRole('tab', { name: /Entrenar/ }).click();
  await page.getByTestId('new-routine').click();
  await page.getByTestId('routine-name').fill('Piernas');
  await page.getByTestId('routine-name').press('Enter');
  await page.waitForTimeout(500);
  await page.goBack();

  await page.getByRole('tab', { name: /Físico/ }).click();
  await page.getByText('Sin fotos todavía').waitFor();
  await shot('s4-01-physique-empty');

  await newAnalysis(page, 80);
  ok(await page.getByTestId('lagging-calves').isVisible(), 'lagging muscles are shown');
  ok((await storedPhotos(userId)) === 3, 'three photos stored privately under the user folder');
  await shot('s4-02-analysis', { fullPage: true });

  // Connect to the tracker: add 2 of 3 suggestions to "Piernas"
  await page.getByTestId('suggestion-1').click(); // untick the seated calf raise
  await page.getByTestId('target-Piernas').click();
  await page.getByTestId('add-suggestions').click();
  expectEqual(await page.getByTestId('added-message').innerText(), '✓ 2 ejercicios agregados a "Piernas" · Ver rutinas', 'suggestions added to the routine');
  await page.getByTestId('added-message').click();
  await page.locator('[data-testid="routine-Piernas"]:visible').click();
  await page.getByTestId('re-Elevación de talones de pie').waitFor();
  await page.getByTestId('re-Elevaciones laterales en polea').waitFor();
  ok((await page.getByText('IA', { exact: true }).count()) === 2, 'added exercises are tagged as AI suggestions');
  await shot('s4-03-routine-with-ai');
  await page.goBack();

  // Dashboard shows the latest analysis
  await page.getByRole('tab', { name: /Hoy/ }).click();
  await page.getByTestId('dashboard-analysis').getByText('A priorizar: Gemelos (marcado), Deltoide lateral (moderado)').waitFor();
  console.log('ok - dashboard shows the latest analysis');
  await shot('s4-04-dashboard', { fullPage: true });

  // Second session -> compare
  await newAnalysis(page, 82.5);
  await page.goBack();
  await page.getByTestId('compare').click();
  expectEqual(await page.getByTestId('weight-delta').innerText(), 'Peso: 80 → 82.5 kg (+2.5 kg)', 'compare shows the weight change');
  await shot('s4-05-compare');
  await page.goBack();

  // Delete one session -> its photos are gone
  ok((await storedPhotos(userId)) === 6, 'six photos before deleting');
  await page.locator('[data-testid^="session-"]').first().click();
  await page.getByTestId('delete-session').click();
  await page.getByTestId('new-physique').waitFor();
  await page.waitForTimeout(1000);
  ok((await storedPhotos(userId)) === 3, 'deleting a session deletes its three photos');

  // Delete everything
  await page.getByTestId('delete-all-physique').click();
  await page.getByText('Sin fotos todavía').waitFor();
  await page.waitForTimeout(1000);
  ok((await storedPhotos(userId)) === 0, '"Borrar todas mis fotos" leaves no photos in storage');
  const { count } = await admin.from('physique_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  ok(count === 0, 'and no sessions or analyses in the database');
  const { data: kept } = await admin.from('routine_exercises').select('source, analysis_id').eq('user_id', userId);
  ok(kept.length === 2 && kept.every((r) => r.source === 'ai_suggestion' && r.analysis_id === null), 'routine keeps the added exercises');

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('stage 4 E2E passed');
  await browser.close();
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
