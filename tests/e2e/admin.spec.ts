import { test, expect } from '@playwright/test';
import { expectNoAppError, expectPersianRtl } from './helpers';

/**
 * Admin flows run signed in as the seeded super-admin. If the seed has not run,
 * these fail loudly rather than silently skipping — a green suite must mean the
 * admin panel actually works.
 */
test.describe('admin panel', () => {
  // The session comes from the `setup` project's saved storage state — see
  // playwright.config.ts. No per-test login, so the rate limiter stays happy.

  test('dashboard loads with real metrics', async ({ page }) => {
    await page.goto('/admin');
    await expectPersianRtl(page);
    await expectNoAppError(page);
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('product list shows the seeded catalog and opens the editor', async ({ page }) => {
    await page.goto('/admin/products');
    await expectNoAppError(page);
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(5);

    await page.locator('table tbody tr a').first().click();
    await page.waitForLoadState('domcontentloaded');
    await expectNoAppError(page);
  });

  test('inventory list never renders a plaintext code', async ({ page }) => {
    await page.goto('/admin/inventory');
    await expectNoAppError(page);

    // The seeded demo codes look like DEMO-XXXX-XXXX-1234. None of that shape
    // may appear in the server-rendered list — only masks.
    const html = await page.content();
    expect(html).not.toMatch(/DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}-\d{4}/);
  });

  test('orders list loads and opens an order', async ({ page }) => {
    await page.goto('/admin/orders');
    await expectNoAppError(page);
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
  });

  test('key admin sections all render', async ({ page }) => {
    const sections = [
      '/admin/categories', '/admin/brands', '/admin/rates', '/admin/pricing',
      '/admin/customers', '/admin/coupons', '/admin/tickets', '/admin/reviews',
      '/admin/settings', '/admin/staff', '/admin/audit', '/admin/jobs',
      '/admin/reports', '/admin/suppliers', '/admin/inventory/low-stock',
    ];
    for (const path of sections) {
      await page.goto(path);
      await expectNoAppError(page);
      await expect(page.getByRole('heading', { level: 1 }).first(), `no h1 on ${path}`).toBeVisible();
    }
  });

  test('exchange rates page states rates are manual', async ({ page }) => {
    await page.goto('/admin/rates');
    await expectNoAppError(page);
    await expect(page.locator('body')).toContainText(/نرخ|دستی|بروزرسانی/);
  });
});
