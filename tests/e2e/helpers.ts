import { expect, type Page } from '@playwright/test';

export const SEED_ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL ?? 'admin@giftipay.local',
  password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345',
};

/** Signs in through the real login form and waits for the session to settle. */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
  // Target the named fields directly: React Server Actions render several
  // hidden $ACTION_* inputs before the real ones, so `input` .first() would
  // resolve to a hidden element and fill() would hang on actionability.
  await page.locator('input[name="identifier"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /ورود/ }).first().click();
  // `networkidle` never settles on pages that keep a connection open, so wait
  // for an actual navigation away from the login form instead.
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/login'), { timeout: 20_000 }).catch(() => {});
}

/** Fails the test if the page rendered a Next.js error boundary. */
export async function expectNoAppError(page: Page) {
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('Application error');
  expect(body).not.toContain('Internal Server Error');
  expect(body).not.toMatch(/Unhandled Runtime Error/i);
}

/** The document must be RTL and Persian — checked on every page we visit. */
export async function expectPersianRtl(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
}

/** No horizontal overflow — the layout must fit the viewport at any width. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  expect(overflow, 'page scrolls horizontally').toBeLessThanOrEqual(2);
}
