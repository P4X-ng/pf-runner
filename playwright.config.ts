import { defineConfig } from '@playwright/test';

// Allow toggling headful/slowmo without changing tests:
//  - HEADED=true (or HEADFUL=true) for headful
//  - SLOWMO=200 to slow down actions
const headedEnv = process.env.HEADED ?? process.env.HEADFUL;
const headed = headedEnv === '1' || headedEnv === 'true';
const slowMo = Number.isFinite(Number(process.env.SLOWMO))
  ? Number(process.env.SLOWMO)
  : 0;

export default defineConfig({
  timeout: 30_000,
  retries: 0,
  use: {
    headless: !headed,
    launchOptions: { slowMo },
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  // Provide basic per-browser projects so users can pick with --project
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
