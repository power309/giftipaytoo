import { expect, type Page } from '@playwright/test';

export const SEED_ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL ?? 'admin@giftipay.local',
  password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345',
};

/** Signs in through the real login form and waits for the session to settle. */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel(/ایمیل یا شماره موبایل|ایمیل|شماره موبایل/).first().fill(email);
  await page.getByLabel(/گذرواژه|رمز عبور/).first().fill(password);
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: /ورود/ }).first().click(),
  ]);
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
