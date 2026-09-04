import 'server-only';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { hmacHex, timingSafeEqualStr } from '@/lib/crypto';
import { getSessionUser } from '@/server/auth/session';

/**
 * Anti-IDOR for guest orders.
 *
 * A signed-in customer's ownership is checked by `getOrderForUser(userId, …)`
 * in `@/server/orders` (that module's job — it knows the real owner).
 *
 * A *guest* order has no session to check against. Right after
 * `createOrderFromCart` succeeds for a guest checkout, `checkout/actions.ts`
 * calls `grantGuestOrderAccess` here, which drops one small httpOnly cookie
 * per order number: `gp_go_<orderNumber> = HMAC-SHA256(AUTH_SECRET, orderNumber)`.
 * Only the browser that just placed the order can present that cookie, so the
 * result page and the status/reveal API routes can trust it without ever
 * trusting a client-supplied "yes this is mine" flag or an unauthenticated
 * order number in the URL alone.
 *
 * A guest opening their order link on a *different* device has no such
 * cookie — they're sent to `/track`, which re-proves ownership by matching
 * the order number against the email/mobile they provide (verified inside
 * `getOrderByNumberForGuest`), same as everyone else without a session.
 */

const COOKIE_PREFIX = 'gp_go_';
const MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 days — long enough to reveal codes and check status later

function cookieName(orderNumber: string): string {
  // Cookie names must stay in the token charset — order numbers are already
  // `[A-Z0-9-]` (see makeReference in src/lib/utils.ts) but we defend anyway.
  const safe = orderNumber.replace(/[^A-Za-z0-9-]/g, '');
  return `${COOKIE_PREFIX}${safe}`;
}

function sign(orderNumber: string): string {
  return hmacHex(env.authSecret, `guest-order:${orderNumber}`);
}

/** Called once, right after a guest's order is created, to grant this browser access. */
export async function grantGuestOrderAccess(orderNumber: string): Promise<void> {
  const jar = await cookies();
  jar.set(cookieName(orderNumber), sign(orderNumber), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
    maxAge: MAX_AGE_SEC,
  });
}

async function hasGuestCookieAccess(orderNumber: string): Promise<boolean> {
  const jar = await cookies();
  const value = jar.get(cookieName(orderNumber))?.value;
  if (!value) return false;
  return timingSafeEqualStr(value, sign(orderNumber));
}

export type OrderAccess =
  | { ok: true; mode: 'user'; userId: string }
  | { ok: true; mode: 'guest-cookie' }
  | { ok: false };

/** Resolves whether the current request may look at `orderNumber` at all, before we even query it. */
export async function resolveOrderAccess(orderNumber: string): Promise<OrderAccess> {
  const user = await getSessionUser();
  if (user) return { ok: true, mode: 'user', userId: user.id };
  if (await hasGuestCookieAccess(orderNumber)) return { ok: true, mode: 'guest-cookie' };
  return { ok: false };
}
