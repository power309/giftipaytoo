import 'server-only';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { hmacHex, timingSafeEqualStr } from '@/lib/crypto';
import { getSessionUser } from '@/server/auth/session';

/**
 * Anti-IDOR for guest orders.
 *
 * A signed-in customer's ownership is checked by the real
 * `getOrderForUser(orderId)` in `@/server/orders`, whose query itself is
 * scoped to `{ id: orderId, userId: user.id }` — it can't be pointed at
 * someone else's order no matter what id is passed in.
 *
 * A *guest* order has no session, and `getOrderByNumberForGuest(orderNumber,
 * contact)` re-verifies ownership by matching `contact` against the order's
 * stored `guestEmail`/`guestPhone` — so this module's only job is
 * remembering, for the browser that just placed a guest order, which
 * contact to re-present automatically (so landing back on the result page
 * after the payment gateway redirect doesn't ask the guest to type their
 * email again). `checkout/actions.ts` calls `grantGuestOrderAccess` right
 * after a guest order is created; `/track` re-derives the same proof by
 * asking for the contact directly, for a guest opening their link on a
 * different device (no cookie there).
 *
 * The cookie carries the contact value itself plus an HMAC over
 * `orderNumber + contact` keyed by `AUTH_SECRET` — a forged or edited value
 * fails the signature check and is treated as no access at all.
 */

const COOKIE_PREFIX = 'gp_go_';
const MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 days — long enough to check status / reveal codes / track later

function cookieName(orderNumber: string): string {
  const safe = orderNumber.replace(/[^A-Za-z0-9-]/g, '');
  return `${COOKIE_PREFIX}${safe}`;
}

function sign(orderNumber: string, contact: string): string {
  return hmacHex(env.authSecret, `guest-order:${orderNumber}:${contact}`);
}

export type GuestContact = { email?: string; mobile?: string };

function contactValue(contact: GuestContact): string {
  return contact.email || contact.mobile || '';
}

/** Called once, right after a guest's order is created, to grant this browser access. */
export async function grantGuestOrderAccess(orderNumber: string, contact: GuestContact): Promise<void> {
  const value = contactValue(contact);
  if (!value) return;
  const jar = await cookies();
  const payload = `${Buffer.from(value, 'utf8').toString('base64url')}.${sign(orderNumber, value)}`;
  jar.set(cookieName(orderNumber), payload, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
    maxAge: MAX_AGE_SEC,
  });
}

/** Reads back the contact this browser proved for `orderNumber`, or null if there's none/it's invalid. */
async function guestCookieContact(orderNumber: string): Promise<GuestContact | null> {
  const jar = await cookies();
  const raw = jar.get(cookieName(orderNumber))?.value;
  if (!raw) return null;
  const [b64, sig] = raw.split('.');
  if (!b64 || !sig) return null;
  let value: string;
  try {
    value = Buffer.from(b64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!value || !timingSafeEqualStr(sig, sign(orderNumber, value))) return null;
  return value.includes('@') ? { email: value } : { mobile: value };
}

export type OrderAccess =
  | { ok: true; mode: 'user' }
  | { ok: true; mode: 'guest-cookie'; contact: GuestContact }
  | { ok: false };

/** Resolves whether the current request may look at `orderNumber` at all, before we even query it. */
export async function resolveOrderAccess(orderNumber: string): Promise<OrderAccess> {
  const user = await getSessionUser();
  if (user) return { ok: true, mode: 'user' };
  const contact = await guestCookieContact(orderNumber);
  if (contact) return { ok: true, mode: 'guest-cookie', contact };
  return { ok: false };
}
