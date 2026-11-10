// Stage 1 E2E against a real local Supabase: sign-up -> onboarding -> dashboard.
//   npx supabase start && npx expo start --web   (with .env.local pointing to 127.0.0.1:54321)
const { launch, signUpAndOnboard, expectEqual, BASE } = require('./helpers');
const OUT = process.argv[2] || 'e2e/screenshots';

(async () => {
  const { browser, page, errors, shot } = await launch(OUT);
  const email = `e2e-${Date.now()}@forma.dev`;
  const { summaryKcal } = await signUpAndOnboard(page, { email });
  expectEqual(summaryKcal, '2760', 'onboarding summary target (Mifflin-St Jeor)');
  await page.waitForTimeout(500);
  expectEqual(await page.getByTestId('kcal-left').innerText(), '2760', 'dashboard reads the stored target');
  await shot('s1-dashboard');

  // Session persists across reloads and the onboarded user skips onboarding
  await page.goto(BASE);
  await page.getByText('kcal restantes').waitFor();
  console.log('ok - session persists and onboarding is not shown again');

  // Sign out -> sign back in
  await page.getByText('Cerrar sesión').click();
  await page.getByText('Bienvenido de vuelta').waitFor();
  await page.getByTestId('email').fill(email);
  await page.getByTestId('password').fill('wrongpassword');
  await page.getByTestId('submit').click();
  await page.getByText('Email o contraseña incorrectos.').waitFor();
  console.log('ok - wrong password is rejected');
  await page.getByTestId('password').fill('supersecret1');
  await page.getByTestId('submit').click();
  await page.getByText('kcal restantes').waitFor();
  console.log('ok - sign in lands on the dashboard');

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('stage 1 E2E passed');
  await browser.close();
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
