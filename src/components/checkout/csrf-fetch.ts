'use client';

/**
 * `fetch` wrapper for the state-changing cart/order REST routes we own.
 * Echoes the (non-httpOnly, by design) `gp_csrf` cookie back as the
 * `x-csrf-token` header so `assertCsrf()` on the server accepts the call.
 * GET requests don't need this — only POST/PATCH/DELETE.
 */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function csrfFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = readCookie('gp_csrf');
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('x-csrf-token', token);
  return fetch(input, { ...init, headers, credentials: 'same-origin' });
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/** Parses one of our own `{ ok, error }` JSON envelopes uniformly. */
export async function parseApi<T>(res: Response): Promise<ApiResult<T>> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body (e.g. a network-level failure surfaced as an empty response)
  }
  const obj = (body ?? {}) as Record<string, unknown>;
  if (res.ok && obj.ok !== false) {
    return { ok: true, data: obj as T };
  }
  const error = typeof obj.error === 'string' ? obj.error : 'خطایی غیرمنتظره رخ داد. دوباره تلاش کنید.';
  return { ok: false, error, status: res.status };
}
