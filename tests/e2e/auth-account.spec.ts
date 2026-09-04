import { test, expect } from '@playwright/test';
import { expectNoAppError, expectPersianRtl } from './helpers';

test.describe('authentication', () => {
  test('login page renders and rejects bad credentials honestly', async ({ page }) => {
    await page.goto('/auth/login');
    await expectPersianRtl(page);
    await expectNoAppError(page);

    await page.locator('input[name="identifier"]').fill('nobody@example.invalid');
    await page.locator('input[name="password"]').fill('WrongPassword!123');
    await page.getByRole('button', { name: /ورود/ }).first().click();

    // A failed login must say so — never silently succeed.
    await expect(page).toHaveURL(/\/auth\/login/);
    await expectNoAppError(page);
  });

  test('register page renders its rules up front', async ({ page }) => {
    await page.goto('/auth/register');
    await expectNoAppError(page);
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test('account area is gated for anonymous visitors', async ({ page }) => {
    await page.goto('/account');
    // Must redirect to login, never render account content unauthenticated.
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('admin area is gated for anonymous visitors', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('private areas are noindex', async ({ request }) => {
    // maxRedirects: 0 — /admin answers 307 to unauthenticated callers, and
    // following it would read the login page's headers instead of /admin's.
    for (const path of ['/admin', '/account', '/checkout']) {
      const res = await request.get(path, { maxRedirects: 0, failOnStatusCode: false });
      expect(res.headers()['x-robots-tag'] ?? '', `no noindex on ${path}`).toContain('noindex');
    }
  });
});
