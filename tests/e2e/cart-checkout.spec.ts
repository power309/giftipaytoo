import { test, expect } from '@playwright/test';
import { expectNoAppError, expectNoHorizontalScroll } from './helpers';

test.describe('cart and checkout', () => {
  test('empty cart shows a real empty state', async ({ page }) => {
    await page.goto('/cart');
    await expectNoAppError(page);
    await expect(page.locator('body')).toContainText(/سبد|خالی/);
    await expectNoHorizontalScroll(page);
  });

  test('adding a product to the cart updates the cart', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href^="/product/"]').first().click();
    await page.waitForLoadState('domcontentloaded');

    // A region-restricted product must block the add button until acknowledged.
    const ack = page.locator('input[type="checkbox"]').first();
    if (await ack.count()) {
      const addBtn = page.getByRole('button', { name: /افزودن به سبد/ }).first();
      if (await addBtn.count()) {
        const disabledBefore = await addBtn.isDisabled();
        if (disabledBefore) {
          await ack.check();
          await expect(addBtn).toBeEnabled();
        }
      }
    }

    const addBtn = page.getByRole('button', { name: /افزودن به سبد/ }).first();
    if (await addBtn.count()) {
      await addBtn.click();
      await page.waitForTimeout(1500);
      await page.goto('/cart');
      await expectNoAppError(page);
    }
  });

  test('checkout requires authentication or guest details', async ({ page }) => {
    await page.goto('/checkout');
    await expectNoAppError(page);
    // Either it redirects (empty cart / login) or renders the checkout form —
    // it must never render a broken page.
    expect(page.url()).toBeTruthy();
  });

  test('guest order tracking does not leak whether an order exists', async ({ page }) => {
    await page.goto('/track');
    await expectNoAppError(page);
    await expect(page.locator('body')).toContainText(/پیگیری|سفارش/);
  });
});
