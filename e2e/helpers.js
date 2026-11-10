// Shared Playwright helpers for the web E2E tests (run against `supabase start` + `expo start --web`).
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.APP_URL || 'http://localhost:8081';

async function launch(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const shot = (name, opts = {}) => page.screenshot({ path: `${outDir}/${name}.png`, ...opts });
  return { browser, page, errors, shot };
}

async function signUpAndOnboard(page, { email, experience = 'intermediate' }) {
  await page.goto(BASE);
  await page.getByText('Bienvenido de vuelta').waitFor({ timeout: 90000 });
  await page.getByText('Registrate').click();
  await page.getByTestId('email').fill(email);
  await page.getByTestId('password').fill('supersecret1');
  await page.getByTestId('submit').click();
  await page.getByText('¿Cuál es tu sexo biológico?').waitFor();
  await page.getByTestId('sex-male').click();
  await page.getByTestId('next').click();
  await page.getByTestId('day').fill('15');
  await page.getByTestId('month').fill('1');
  await page.getByTestId('year').fill('1996');
  await page.getByTestId('next').click();
  await page.getByTestId('height').fill('180');
  await page.getByTestId('weight').fill('80');
  await page.getByTestId('next').click();
  await page.getByTestId('activity-moderate').click();
  await page.getByTestId('next').click();
  await page.getByTestId('goal-maintain').click();
  await page.getByTestId('next').click();
  await page.getByTestId(`exp-${experience}`).click();
  await page.getByTestId('next').click();
  const summaryKcal = await page.getByTestId('kcal').innerText();
  await page.getByTestId('finish').click();
  await page.getByText('kcal restantes').waitFor();
  return { summaryKcal };
}

function expectEqual(actual, expected, label) {
  if (String(actual).trim() !== String(expected)) throw new Error(`${label}: expected "${expected}", got "${actual}"`);
  console.log(`ok - ${label}`);
}

module.exports = { BASE, launch, signUpAndOnboard, expectEqual };
