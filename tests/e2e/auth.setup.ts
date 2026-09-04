import { test as setup, expect } from '@playwright/test';
import { SEED_ADMIN } from './helpers';

export const ADMIN_STATE = 'tests/e2e/.auth/admin.json';

/**
 * Signs in as the seeded super-admin ONCE and saves the session cookie.
 *
 * Logging in per-test would hammer the real rate limiter — `auth.login` allows
 * 8 attempts per identifier per 5 minutes — and the suite would start failing
 * on its own security controls rather than on product defects.
 */
setup('authenticate as admin', async ({ page }) => {
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="identifier"]').fill(SEED_ADMIN.email);
  await page.locator('input[name="password"]').fill(SEED_ADMIN.password);
  await page.getByRole('button', { name: /ورود/ }).first().click();

  await page.waitForURL((u) => !u.pathname.startsWith('/auth/login'), { timeout: 30_000 });

  // Prove the session actually reaches the admin panel before saving it.
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });

  await page.context().storageState({ path: ADMIN_STATE });
});
