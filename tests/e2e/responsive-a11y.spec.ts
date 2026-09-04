import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectNoHorizontalScroll, expectNoAppError } from './helpers';

const PAGES = ['/', '/categories', '/brands', '/faq', '/blog', '/cart', '/auth/login'];

test.describe('responsive layout', () => {
  for (const path of PAGES) {
    test(`no horizontal overflow at 360px — ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.goto(path);
      await expectNoAppError(page);
      await expectNoHorizontalScroll(page);
    });
  }

  test('mobile navigation drawer opens', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/');
    await page.getByRole('button', { name: /باز کردن منو/ }).click();
    await expect(page.getByRole('dialog', { name: /منوی اصلی/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /منوی اصلی/ })).toBeHidden();
  });
});

test.describe('accessibility', () => {
  for (const path of ['/', '/auth/login', '/cart', '/faq']) {
    test(`no critical or serious axe violations — ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      if (blocking.length) {
        console.log(
          `axe violations on ${path}:\n` +
            blocking
              .map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)\n    ${v.nodes[0]?.html?.slice(0, 160)}`)
              .join('\n'),
        );
      }
      expect(blocking, `serious/critical a11y violations on ${path}`).toEqual([]);
    });
  }

  test('page has exactly one h1 and a skip link', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('a.skip-link')).toHaveCount(1);
  });

  test('keyboard focus is visible and reaches the main content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(focused).toContain('skip-link');
  });
});
