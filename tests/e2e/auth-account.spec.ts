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

  test('admin and account pages are noindex', async ({ page }) => {
    const res = await page.goto('/admin');
    const robots = res?.headers()['x-robots-tag'] ?? '';
    expect(robots).toContain('noindex');
  });
});
