// Stage 3 E2E against the local stack + Anthropic mock:
//   npx supabase start; node e2e/mocks/anthropic-mock.js; npx expo start --web
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const { launch, signUpAndOnboard, expectEqual, BASE } = require('./helpers');
const OUT = process.argv[2] || 'e2e/screenshots';
const status = JSON.parse(execSync('npx supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } });

async function photosOf(userId) {
  const { data } = await admin.storage.from('meal-photos').list(userId);
  return (data ?? []).map((f) => f.name);
}

(async () => {
  const { browser, page, errors, shot } = await launch(OUT);
  const email = `e2e-meal-${Date.now()}@forma.dev`;
  await signUpAndOnboard(page, { email });
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userId = users.users.find((u) => u.email === email).id;

  await page.getByRole('tab', { name: /Comida/ }).click();
  await page.getByText('Sin comidas').waitFor();
  await shot('s3-01-food-empty');

  // Photo -> AI estimate
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('photo-library').click();
  await (await chooser).setFiles('e2e/fixtures/plate.jpg');
  await page.getByTestId('item-name-0').waitFor({ timeout: 60000 });
  expectEqual(await page.getByTestId('item-name-0').inputValue(), 'Milanesa de carne', 'AI items are prefilled');
  expectEqual(await page.getByTestId('meal-kcal').innerText(), '670', 'meal total from estimate');
  ok((await photosOf(userId)).length === 1, 'photo uploaded to the user folder');
  await shot('s3-02-estimate');

  // Correct the portion: 200 g -> 100 g of puré halves its calories
  await page.getByTestId('item-grams-1').fill('100');
  expectEqual(await page.getByTestId('item-kcal-1').inputValue(), '110', 'changing grams rescales kcal');
  expectEqual(await page.getByTestId('meal-kcal').innerText(), '560', 'total updates');
  await page.getByTestId('save-meal').click();
  await page.getByTestId('meal-Milanesa con puré').waitFor();
  await page.waitForTimeout(500);
  expectEqual(await page.getByTestId('ring-left').innerText(), '2200', 'ring shows remaining kcal (2760 - 560)');

  // Manual entry
  await page.getByTestId('manual-meal').click();
  await page.getByTestId('item-name-0').fill('Banana');
  await page.getByTestId('item-grams-0').fill('120');
  await page.getByTestId('item-kcal-0').fill('105');
  await page.getByTestId('meal-name').fill('Banana');
  await page.getByTestId('type-snack').click();
  await page.getByTestId('save-meal').click();
  await page.getByTestId('meal-Banana').waitFor();
  await page.waitForTimeout(500);
  expectEqual(await page.getByTestId('day-consumed').innerText(), '665 de 2760 kcal consumidas', 'manual meal adds to the day');
  await shot('s3-03-food-day', { fullPage: true });

  // Edit
  await page.getByTestId('meal-Banana').click();
  await page.getByTestId('item-kcal-0').waitFor();
  await page.getByTestId('item-kcal-0').fill('120');
  await page.getByTestId('save-meal').click();
  await page.getByTestId('meal-Banana').waitFor();
  await page.waitForTimeout(500);
  expectEqual(await page.getByTestId('day-consumed').innerText(), '680 de 2760 kcal consumidas', 'editing replaces the totals');

  // Stored AI output for later comparison
  const { data: meal } = await admin.from('meals').select('ai_raw, ai_model, source, photo_path').eq('user_id', userId).eq('source', 'photo').single();
  ok(meal.ai_model === 'claude-opus-5-5' && meal.ai_raw.items.length === 2, 'raw AI estimate and model are stored');

  // Abandoning a photo meal deletes the uploaded photo
  const chooser2 = page.waitForEvent('filechooser');
  await page.getByTestId('photo-library').click();
  await (await chooser2).setFiles('e2e/fixtures/plate.jpg');
  await page.getByTestId('item-name-0').waitFor({ timeout: 60000 });
  ok((await photosOf(userId)).length === 2, 'second photo uploaded');
  await page.goBack();
  await page.getByTestId('meal-Banana').waitFor();
  await page.waitForTimeout(1500);
  ok((await photosOf(userId)).length === 1, 'abandoned photo is removed from storage');

  // Deleting a photo meal deletes its photo
  await page.getByTestId('meal-Milanesa con puré').click();
  await page.getByText('Eliminar comida').click();
  await page.getByTestId('meal-Banana').waitFor();
  await page.waitForTimeout(1500);
  ok((await photosOf(userId)).length === 0, 'deleting the meal deletes its photo');
  expectEqual(await page.getByTestId('day-consumed').innerText(), '120 de 2760 kcal consumidas', 'totals after delete');

  // Dashboard uses the same totals
  await page.getByRole('tab', { name: /Hoy/ }).click();
  await page.waitForTimeout(800);
  expectEqual(await page.getByTestId('kcal-left').innerText(), '2640', 'dashboard remaining kcal');
  await shot('s3-04-dashboard');

  // Yesterday is empty and tomorrow is not reachable
  await page.getByRole('tab', { name: /Comida/ }).click();
  await page.getByTestId('prev-day').click();
  expectEqual(await page.getByTestId('day-label').innerText(), 'Ayer', 'day navigation');
  await page.getByText('No registraste comidas este día.').waitFor();

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('stage 3 E2E passed');
  await browser.close();
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });

function ok(cond, label) { if (!cond) throw new Error(label); console.log('ok - ' + label); }
