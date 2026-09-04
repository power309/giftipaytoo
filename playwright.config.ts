import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

/**
 * This environment ships a pre-installed Chromium whose build may not match the
 * one `playwright install` would fetch, so point at it explicitly when present.
 */
const PREINSTALLED_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = fs.existsSync(PREINSTALLED_CHROME)
  ? { executablePath: PREINSTALLED_CHROME }
  : {};

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    baseURL,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions,
  },
  projects: [
    // Signs in once; the admin project reuses the saved session so the suite
    // does not trip the login rate limiter.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'admin-chromium',
      testMatch: /admin\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        storageState: 'tests/e2e/.auth/admin.json',
      },
    },
    {
      name: 'desktop-chromium',
      testIgnore: /admin\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    { name: 'mobile-chromium', testIgnore: /admin\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'tablet-chromium', testIgnore: /admin\.spec\.ts/, use: { ...devices['Galaxy Tab S4'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
