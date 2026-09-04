import 'server-only';
import { cookies, headers } from 'next/headers';
import { db } from '../db';
import { env } from '@/lib/env';
import { randomToken, sha256 } from '@/lib/crypto';
import { type PermissionKey } from '@/lib/permissions';
import { logger } from '@/lib/logger';

export const SESSION_COOKIE = 'gp_session';
export const CART_COOKIE = 'gp_cart';
export const CSRF_COOKIE = 'gp_csrf';

export type SessionUser = {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  status: string;
  isStaff: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  walletBalance: number;
  loyaltyPoints: number;
  customerGroupId: string | null;
  customerGroupDiscount: number;
  permissions: PermissionKey[];
  roles: string[];
  sessionId: string;
  twoFactorOk: boolean;
};

function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.isProduction,
    path: '/',
    maxAge: maxAgeSec,
  };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return h.get('x-real-ip') ?? '0.0.0.0';
}

export async function clientUserAgent(): Promise<string> {
  const h = await headers();
  return h.get('user-agent') ?? 'unknown';
}

/** Creates a session row and sets the httpOnly cookie. Returns the raw token. */
export async function createSession(
  userId: string,
  opts: { isStaffScope?: boolean; twoFactorOk?: boolean; deviceLabel?: string } = {},
): Promise<string> {
  const raw = randomToken(32);
  const ttlMs = env.limits.sessionTtlHours * 3600_000;
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(raw),
      ip: await clientIp(),
      userAgent: (await clientUserAgent()).slice(0, 400),
      deviceLabel: opts.deviceLabel ?? describeDevice(await clientUserAgent()),
      isStaffScope: opts.isStaffScope ?? false,
      twoFactorOk: opts.twoFactorOk ?? false,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, raw, cookieOptions(Math.floor(ttlMs / 1000)));
  jar.set(CSRF_COOKIE, randomToken(24), {
    ...cookieOptions(Math.floor(ttlMs / 1000)),
    httpOnly: false, // must be readable by the client to echo back in a header
  });
  return raw;
}

export function describeDevice(ua: string): string {
  const s = ua.toLowerCase();
  const os = s.includes('android')
    ? 'اندروید'
    : s.includes('iphone') || s.includes('ipad')
      ? 'iOS'
      : s.includes('windows')
        ? 'ویندوز'
        : s.includes('mac os')
          ? 'مک'
          : s.includes('linux')
            ? 'لینوکس'
            : 'نامشخص';
  const browser = s.includes('edg/')
    ? 'Edge'
    : s.includes('chrome')
      ? 'Chrome'
      : s.includes('firefox')
        ? 'Firefox'
        : s.includes('safari')
          ? 'Safari'
          : 'مرورگر';
  return `${browser} — ${os}`;
}

let cachedRequest: { token: string; user: SessionUser | null } | null = null;

/** Reads the current session. Returns null for anonymous visitors. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  if (cachedRequest?.token === raw) return cachedRequest.user;

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(raw) },
    include: {
      user: {
        include: {
          customerGroup: true,
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    cachedRequest = { token: raw, user: null };
    return null;
  }
  const u = session.user;
  if (u.status === 'SUSPENDED' || u.status === 'DELETED' || u.deletedAt) {
    cachedRequest = { token: raw, user: null };
    return null;
  }

  // Throttled last-seen update: at most once per 5 minutes per session.
  if (Date.now() - session.lastSeenAt.getTime() > 300_000) {
    db.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch((err) => logger.warn('lastSeen update failed', { err }));
  }

  const permissions = new Set<PermissionKey>();
  for (const ur of u.roles) {
    for (const rp of ur.role.permissions) permissions.add(rp.permission.key as PermissionKey);
  }

  const user: SessionUser = {
    id: u.id,
    email: u.email,
    phone: u.phone,
    firstName: u.firstName,
    lastName: u.lastName,
    displayName:
      [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.phone || 'کاربر',
    status: u.status,
    isStaff: u.isStaff,
    emailVerified: !!u.emailVerifiedAt,
    phoneVerified: !!u.phoneVerifiedAt,
    twoFactorEnabled: u.twoFactorEnabled,
    walletBalance: u.walletBalance,
    loyaltyPoints: u.loyaltyPoints,
    customerGroupId: u.customerGroupId,
    customerGroupDiscount: u.customerGroup?.discountPercent ?? 0,
    permissions: Array.from(permissions),
    roles: u.roles.map((r) => r.role.slug),
    sessionId: session.id,
    twoFactorOk: session.twoFactorOk,
  };
  cachedRequest = { token: raw, user };
  return user;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    await db.session
      .updateMany({ where: { tokenHash: sha256(raw) }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
  cachedRequest = null;
}

export async function revokeSession(sessionId: string, userId: string): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, userId },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const res = await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return res.count;
}

/** Marks the current session as having passed the 2FA challenge. */
export async function markTwoFactorPassed(sessionId: string): Promise<void> {
  await db.session.update({ where: { id: sessionId }, data: { twoFactorOk: true } });
  cachedRequest = null;
}

/** Stable anonymous cart key, persisted in a cookie. */
export async function getOrCreateCartKey(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CART_COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{16,}$/.test(existing)) return existing;
  const key = randomToken(18);
  jar.set(CART_COOKIE, key, cookieOptions(60 * 60 * 24 * 30));
  return key;
}

export async function readCartKey(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(CART_COOKIE)?.value ?? null;
}
