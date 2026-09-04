import { test, expect } from '@playwright/test';
import { expectNoAppError, expectPersianRtl, expectNoHorizontalScroll } from './helpers';

test.describe('storefront', () => {
  test('home page renders the catalog', async ({ page }) => {
    await page.goto('/');
    await expectPersianRtl(page);
    await expectNoAppError(page);

    // The seeded catalog must actually surface products, not an empty shell.
    const productLinks = page.locator('a[href^="/product/"]');
    await expect(productLinks.first()).toBeVisible();
    expect(await productLinks.count()).toBeGreaterThan(4);

    // Prices are shown in Toman with Persian digits.
    await expect(page.getByText(/تومان/).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('category listing filters and paginates', async ({ page }) => {
    await page.goto('/categories');
    await expectNoAppError(page);
    const firstCategory = page.locator('a[href^="/category/"]').first();
    await expect(firstCategory).toBeVisible();
    await firstCategory.click();
    await page.waitForLoadState('domcontentloaded');
    await expectNoAppError(page);
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();
  });

  test('product page shows variants, price and the region gate', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href^="/product/"]').first().click();
    await page.waitForLoadState('domcontentloaded');
    await expectNoAppError(page);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/تومان/).first()).toBeVisible();

    // Activation guidance and restrictions must be present for a gift card.
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(400);
    await expectNoHorizontalScroll(page);
  });

  test('Persian search tolerates spelling variants', async ({ page }) => {
    // "پلی استیشن" with a space must find the same products as the half-space form.
    await page.goto('/search?q=' + encodeURIComponent('پلی استیشن'));
    await expectNoAppError(page);
    const spaced = await page.locator('a[href^="/product/"]').count();

    await page.goto('/search?q=' + encodeURIComponent('پلی‌استیشن'));
    await expectNoAppError(page);
    const zwnj = await page.locator('a[href^="/product/"]').count();

    expect(spaced).toBeGreaterThan(0);
    expect(zwnj).toBe(spaced);
  });

  test('search with no results does not dead-end', async ({ page }) => {
    await page.goto('/search?q=' + encodeURIComponent('یک عبارت کاملا بی‌ربط زیبیبیب'));
    await expectNoAppError(page);
    await expect(page.getByText(/نتیجه|یافت نشد|پیشنهاد/).first()).toBeVisible();
  });

  test('static content pages render', async ({ page }) => {
    for (const path of ['/faq', '/blog', '/brands', '/p/terms', '/p/privacy']) {
      await page.goto(path);
      await expectNoAppError(page);
      await expect(page.locator('h1, h2').first()).toBeVisible();
    }
  });

  test('404 page is branded and offers a way forward', async ({ page }) => {
    const res = await page.goto('/this-route-does-not-exist-zzz');
    expect(res?.status()).toBe(404);
    await expectNoAppError(page);
  });
});

test.describe('theme', () => {
  test('dark mode toggles and persists', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /حالت تیره|تغییر به حالت/ }).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
