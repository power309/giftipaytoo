import 'server-only';
import { cookies, headers } from 'next/headers';
import { timingSafeEqualStr } from '@/lib/crypto';
import { CSRF_COOKIE } from './auth/session';

export class CsrfError extends Error {
  constructor() {
    super('توکن امنیتی نامعتبر است. صفحه را تازه کنید و دوباره تلاش کنید.');
    this.name = 'CsrfError';
  }
}

/**
 * Double-submit CSRF check for state-changing API routes.
 * Server Actions are already protected by Next.js's own origin check, so this
 * guards the REST endpoints that browsers can reach cross-origin.
 */
export async function assertCsrf(): Promise<void> {
  const jar = await cookies();
  const h = await headers();
  const cookieToken = jar.get(CSRF_COOKIE)?.value;
  const headerToken = h.get('x-csrf-token');
  if (!cookieToken || !headerToken || !timingSafeEqualStr(cookieToken, headerToken)) {
    throw new CsrfError();
  }
}

/** Verifies the request came from our own origin. */
export async function assertSameOrigin(appUrl: string): Promise<void> {
  const h = await headers();
  const origin = h.get('origin');
  if (!origin) return; // same-origin form posts may omit Origin
  const allowed = new URL(appUrl).origin;
  if (new URL(origin).origin !== allowed) throw new CsrfError();
}
