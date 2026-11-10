// Drives sign-up -> onboarding -> dashboard on Expo web with Supabase HTTP mocked.
// Usage: EXPO_PUBLIC_SUPABASE_URL=http://mock-supabase.test npx expo start --web, then node e2e/stage1-onboarding.web.js
const { chromium } = require('playwright');
const OUT = process.argv[2] || "e2e/screenshots";
require("fs").mkdirSync(OUT, { recursive: true });
const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'test@forma.dev', aud: 'authenticated', role: 'authenticated' };
const now = Math.floor(Date.now() / 1000);
const SESSION = { access_token: 'header.' + Buffer.from(JSON.stringify({ sub: USER.id, exp: now + 3600 })).toString('base64url') + '.sig',
  refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user: USER };

(async () => {
  const state = { profile: { id: USER.id, onboarded_at: null, goal: null }, rpcBody: null, targets: null };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://mock-supabase.test/**', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' , 'access-control-allow-headers': '*'}, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    if (url.pathname === '/auth/v1/signup') return json(SESSION);
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (url.pathname === '/rest/v1/profiles') return json(single ? state.profile : [state.profile]);
    if (url.pathname === '/rest/v1/rpc/complete_onboarding') {
      state.rpcBody = req.postDataJSON();
      const b = state.rpcBody;
      state.profile = { ...state.profile, sex: b.p_sex, goal: b.p_goal, onboarded_at: new Date().toISOString() };
      state.targets = { kcal: b.p_kcal, protein_g: b.p_protein_g, carbs_g: b.p_carbs_g, fat_g: b.p_fat_g };
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
    if (url.pathname === '/rest/v1/current_nutrition_targets') return json(single ? state.targets : (state.targets ? [state.targets] : []));
    console.log('UNMOCKED', req.method(), url.pathname); return json({}, 404);
  });

  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
  await page.goto('http://localhost:8081');
  await page.getByText('Bienvenido de vuelta').waitFor({ timeout: 60000 });
  await shot('01-sign-in');
  await page.getByText('Registrate').click();
  await page.getByTestId('email').fill('test@forma.dev');
  await page.getByTestId('password').fill('supersecret1');
  await page.getByTestId('submit').click();

  await page.getByText('¿Cuál es tu sexo biológico?').waitFor();
  await page.getByTestId('sex-male').click();
  await shot('02-onboarding-sex');
  await page.getByTestId('next').click();
  await page.getByTestId('day').fill('15'); await page.getByTestId('month').fill('1'); await page.getByTestId('year').fill('2020');
  await page.getByText(/La edad debe estar/).waitFor();      // too young -> blocked
  await page.getByTestId('year').fill('1996');
  await page.getByTestId('next').click();
  await page.getByTestId('height').fill('180'); await page.getByTestId('weight').fill('80');
  await page.getByTestId('next').click();
  await page.getByTestId('activity-moderate').click(); await shot('03-onboarding-activity'); await page.getByTestId('next').click();
  await page.getByTestId('goal-maintain').click(); await page.getByTestId('next').click();
  await page.getByTestId('exp-beginner').click(); await page.getByTestId('next').click();
  await page.getByText('Tu plan').waitFor();
  const kcal = await page.getByTestId('kcal').innerText();
  await shot('04-onboarding-summary');
  await page.getByTestId('finish').click();
  await page.getByText('kcal restantes').waitFor();
  await page.waitForTimeout(500);
  const left = await page.getByTestId('kcal-left').innerText();
  await shot('05-dashboard');
  console.log(JSON.stringify({ summaryKcal: kcal, dashboardKcal: left, rpcBody: state.rpcBody, pageErrors: errors }, null, 1));
  await browser.close();
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
