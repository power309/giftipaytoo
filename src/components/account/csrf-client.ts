'use client';

/**
 * Reads the (non-httpOnly, by design) CSRF cookie so client components can
 * echo it back in the `x-csrf-token` header on API-route mutations, per
 * `assertCsrf()`'s double-submit check. Server Actions don't need this —
 * Next.js already protects those — this is only for the handful of REST
 * API routes the account panel calls (e.g. `/api/wishlist`, `/api/cart/items`).
 */
export function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)gp_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function csrfFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('x-csrf-token', getCsrfToken());
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(input, { ...init, headers, credentials: 'same-origin' });
}
