import { test, expect } from '@playwright/test';

test.describe('security headers and behaviour', () => {
  test('security headers are present on a page response', async ({ page }) => {
    const res = await page.goto('/');
    const h = res!.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBeTruthy();
    expect(h['content-security-policy']).toBeTruthy();
    // Scripts must be nonce-gated, never blanket unsafe-inline.
    expect(h['content-security-policy']).toContain("script-src");
    expect(h['content-security-policy']).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  test('the site renders correctly under its own CSP', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (msg) => {
      const t = msg.text();
      if (/Content Security Policy/i.test(t)) violations.push(t);
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(violations, `CSP blocked resources:\n${violations.join('\n')}`).toEqual([]);
  });

  test('robots.txt and sitemap are served', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.ok()).toBeTruthy();
    const body = await robots.text();
    expect(body).toContain('Disallow: /admin');
    expect(body.toLowerCase()).toContain('sitemap');
  });

  test('health endpoint responds without leaking secrets', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).not.toMatch(/DATABASE_URL|postgres:\/\/|AUTH_SECRET|ENCRYPTION_KEY/);
  });

  test('an open redirect is refused', async ({ page }) => {
    await page.goto('/auth/login?next=' + encodeURIComponent('https://evil.example.com'));
    // Whatever happens, we must not end up on the external host.
    expect(page.url()).not.toContain('evil.example.com');
  });

  test('a protected API route rejects an unauthenticated caller', async ({ request }) => {
    const res = await request.post('/api/cart/items', {
      data: { variantId: 'nonexistent', qty: 1 },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    // Must be rejected (CSRF / validation / auth) — never a 2xx success.
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
