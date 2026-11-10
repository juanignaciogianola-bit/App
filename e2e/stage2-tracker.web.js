// Stage 2 E2E against a real local Supabase:
//   npx supabase start && npx expo start --web   (with .env.local pointing to 127.0.0.1:54321)
//   node e2e/stage2-tracker.web.js
const { launch, signUpAndOnboard, expectEqual } = require('./helpers');
const OUT = process.argv[2] || 'e2e/screenshots';

(async () => {
  const { browser, page, errors, shot } = await launch(OUT);
  await signUpAndOnboard(page, { email: `e2e-${Date.now()}@forma.dev` });

  await page.getByRole('tab', { name: /Entrenar/ }).click();
  await page.getByText('Sin rutinas').waitFor();
  await shot('s2-01-train-empty');

  // Build a routine
  await page.getByTestId('new-routine').click();
  await page.getByTestId('routine-name').waitFor();
  await page.getByTestId('routine-name').fill('Push');
  await page.getByTestId('routine-name').press('Enter');
  await page.getByTestId('add-exercises').click();
  await page.getByTestId('exercise-search').fill('press banca');
  await page.getByTestId('pick-Press banca').click();
  await page.getByTestId('exercise-search').fill('laterales');
  await page.getByTestId('pick-Elevaciones laterales').click();
  await shot('s2-02-picker');
  await page.getByTestId('confirm-picker').click();
  await page.getByTestId('re-Press banca').click();
  await page.getByTestId('sets-inc').click();
  await page.getByText('4 series × 8–12 reps').waitFor();
  await shot('s2-03-routine');

  // Log a workout from it
  await page.getByTestId('start-routine').click();
  await page.getByTestId('finish-workout').waitFor();
  for (let i = 0; i < 4; i++) {
    await page.getByTestId(`kg-Press banca-${i}`).fill('80');
    await page.getByTestId(`reps-Press banca-${i}`).fill('8');
    await page.getByTestId(`done-Press banca-${i}`).click();
  }
  await page.getByTestId('kg-Elevaciones laterales-0').fill('10');
  await page.getByTestId('reps-Elevaciones laterales-0').fill('12');
  await page.getByTestId('done-Elevaciones laterales-0').click();
  await page.getByTestId('kg-Elevaciones laterales-1').fill('10');
  await page.getByTestId('reps-Elevaciones laterales-1').fill('12');
  await page.getByTestId('done-Elevaciones laterales-1').click();
  // Set 3 stays unchecked: finishing warns (dialog auto-accepted) and it is not saved.
  // "+ Agregar serie" copies the previous set's values:
  await page.getByTestId('add-set-Press banca').click();
  expectEqual(await page.getByTestId('kg-Press banca-4').inputValue(), '80', 'new set copies previous weight');
  await page.getByText('6 series · 2800 kg').waitFor();
  await shot('s2-04-active-workout');
  await page.getByTestId('finish-workout').click();

  await page.getByTestId('summary-sets').waitFor();
  expectEqual(await page.getByTestId('summary-sets').innerText(), '6', 'summary set count');
  expectEqual(await page.getByTestId('summary-volume').innerText(), '2800 kg', 'summary volume');
  await shot('s2-05-summary');

  // Body map reflects the week: chest 4 (bench primary), side delts 2 (laterals), front delts 2 (bench secondary)
  await page.goBack(); // summary replaced the active workout -> back to the routine editor
  await page.getByTestId('add-exercises').waitFor();
  await page.goBack();
  await page.getByText('Volumen esta semana').waitFor();
  await page.waitForTimeout(800);
  await page.getByTestId('muscle-chest').click();
  expectEqual(await page.getByTestId('muscle-info').innerText(), 'Pecho: 4 series · por debajo del objetivo', 'chest weekly volume');
  await page.getByTestId('muscle-front_delts').click();
  expectEqual(await page.getByTestId('muscle-info').innerText(), 'Deltoide anterior: 2 series · por debajo del objetivo', 'secondary muscle counts half');
  await shot('s2-06-train-map', { fullPage: true });

  // Next session shows last time's numbers
  await page.getByTestId('start-Push').click();
  await page.getByText('80 × 8').first().waitFor();
  await shot('s2-07-previous-hints');
  await page.getByText('Descartar entrenamiento').click();

  // Progression screen, from the routine editor
  await page.getByTestId('routine-Push').click();
  await page.getByTestId('re-Press banca').click();
  await page.getByTestId('progress-Press banca').click();
  await page.getByText('1RM estimado por sesión').waitFor();
  await shot('s2-08-progress');
  await page.getByText('101.3 kg').first().waitFor(); // Epley for 80 kg × 8
  console.log('ok - progression shows Epley e1RM');
  await shot('s2-08-progress');
  await page.goto(require('./helpers').BASE);
  await page.getByTestId('week-count').waitFor();
  await page.waitForTimeout(800);
  expectEqual(await page.getByTestId('week-count').innerText(), '1', 'dashboard weekly session count');
  await shot('s2-09-dashboard');

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('stage 2 E2E passed');
  await browser.close();
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
