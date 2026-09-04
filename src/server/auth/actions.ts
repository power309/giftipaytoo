'use server';

import { db } from '../db';
import { hashPassword, randomToken, sha256, verifyPassword } from '@/lib/crypto';
import { formatJalali } from '@/lib/persian';
import {
  toPlainObject,
  firstZodMessage,
  loginSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
} from '@/lib/schemas';
import { enforceRateLimit, RateLimitError } from '../rate-limit';
import { audit } from '../audit';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  clientIp,
  clientUserAgent,
  createSession,
  destroySession,
  getOrCreateCartKey,
  getSessionUser,
  revokeAllSessions,
  revokeSession as revokeSessionRow,
} from './session';
import { assertUser } from './guard';
import { mergeGuestCart } from '../cart';
import { requiresTwoFactorEnrollment } from './twofactor';

// A syntactically well-formed but unusable scrypt hash — compared against
// whenever no real user is found, so `verifyPassword` always does the same
// amount of work and login timing never reveals whether an account exists.
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

const INVALID_CREDENTIALS = 'ایمیل/موبایل یا گذرواژه نادرست است.';
const GENERIC_RESET_MESSAGE =
  'اگر این ایمیل یا شماره موبایل در سامانه ثبت شده باشد، لینک بازیابی گذرواژه برای شما ارسال می‌شود.';

async function notifyBestEffort(payload: Record<string, unknown>): Promise<void> {
  try {
    const mod: Record<string, unknown> = await import('@/server/notifications/service');
    if (typeof mod.notify === 'function') {
      await (mod.notify as (p: unknown) => Promise<unknown>)(payload);
    }
  } catch (err) {
    logger.warn('auth actions: notifications module unavailable (lazy seam)', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Login / logout
// ─────────────────────────────────────────────────────────────

export type LoginResult =
  | { ok: true; requiresTwoFactor: boolean; requiresTwoFactorSetup: boolean }
  | { ok: false; error: string };

export async function login(input: FormData | Record<string, unknown>): Promise<LoginResult> {
  const ip = await clientIp();
  const parsed = loginSchema.safeParse(toPlainObject(input));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };
  const { identifier, password } = parsed.data;
  const normalizedIdentifier = identifier.trim().toLowerCase();

  try {
    await enforceRateLimit('auth.login', ip);
    await enforceRateLimit('auth.login', `id:${normalizedIdentifier}`);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  const user = await db.user.findFirst({
    where: { OR: [{ email: normalizedIdentifier }, { phone: identifier.trim() }] },
  });

  // Always perform a hash comparison — constant-time against enumeration.
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk || !user.passwordHash) {
    if (user) {
      const attempts = user.failedLoginCount + 1;
      const locked = attempts >= env.limits.maxLoginAttempts;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: attempts,
          lockedUntil: locked ? new Date(Date.now() + env.limits.loginLockMinutes * 60_000) : user.lockedUntil,
        },
      });
      await audit({
        action: 'auth.login.failed',
        entity: 'User',
        entityId: user.id,
        ip,
        summary: 'تلاش ناموفق برای ورود',
      });
    }
    return { ok: false, error: INVALID_CREDENTIALS };
  }

  if (user.status === 'DELETED') return { ok: false, error: INVALID_CREDENTIALS };
  if (user.status === 'SUSPENDED') {
    return { ok: false, error: 'حساب کاربری شما مسدود شده است. برای پیگیری با پشتیبانی تماس بگیرید.' };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return {
      ok: false,
      error: `به دلیل تلاش‌های ناموفق مکرر، حساب شما قفل شده است. لطفاً بعد از ${formatJalali(user.lockedUntil, true)} دوباره تلاش کنید.`,
    };
  }

  const now = new Date();
  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, lastLoginIp: ip },
  });

  await createSession(user.id, { isStaffScope: user.isStaff, twoFactorOk: !user.twoFactorEnabled });

  try {
    const cartKey = await getOrCreateCartKey();
    await mergeGuestCart(cartKey, user.id);
  } catch (err) {
    logger.warn('login: guest cart merge failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  await audit({
    action: 'auth.login',
    entity: 'User',
    entityId: user.id,
    actorId: user.id,
    actorType: 'USER',
    ip,
    userAgent: await clientUserAgent(),
    summary: 'ورود موفق',
  });

  const requiresTwoFactorSetup = await requiresTwoFactorEnrollment(user);

  return { ok: true, requiresTwoFactor: user.twoFactorEnabled, requiresTwoFactorSetup };
}

export async function logout(): Promise<{ ok: true }> {
  const user = await getSessionUser();
  await destroySession();
  if (user) {
    await audit({ action: 'auth.logout', entity: 'User', entityId: user.id, actorId: user.id, actorType: 'USER' });
  }
  return { ok: true };
}

export async function logoutAllDevices(): Promise<{ ok: true; revoked: number }> {
  const user = await assertUser();
  const revoked = await revokeAllSessions(user.id);
  await destroySession();
  await audit({
    action: 'auth.logoutAll',
    entity: 'User',
    entityId: user.id,
    actorId: user.id,
    actorType: 'USER',
    summary: `خروج از ${revoked} نشست`,
  });
  return { ok: true, revoked };
}

export type SessionSummary = {
  id: string;
  ip: string | null;
  deviceLabel: string | null;
  lastSeenAt: Date;
  createdAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
};

export async function listSessions(): Promise<{ ok: true; sessions: SessionSummary[] }> {
  const user = await assertUser();
  const rows = await db.session.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, ip: true, deviceLabel: true, lastSeenAt: true, createdAt: true, expiresAt: true },
  });
  return {
    ok: true,
    sessions: rows.map((r) => ({ ...r, isCurrent: r.id === user.sessionId })),
  };
}

export async function revokeSession(input: { sessionId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await assertUser();
  // Ownership-checked: `revokeSessionRow` only updates rows matching this userId.
  const owned = await db.session.findFirst({ where: { id: input.sessionId, userId: user.id }, select: { id: true } });
  if (!owned) return { ok: false, error: 'نشست مورد نظر یافت نشد.' };
  await revokeSessionRow(input.sessionId, user.id);
  await audit({
    action: 'auth.session.revoke',
    entity: 'Session',
    entityId: input.sessionId,
    actorId: user.id,
    actorType: 'USER',
  });
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Password reset
// ─────────────────────────────────────────────────────────────

const RESET_TOKEN_TTL_MINUTES = 30;

export type RequestPasswordResetResult = { ok: true; message: string; debugToken?: string };

export async function requestPasswordReset(
  input: FormData | Record<string, unknown>,
): Promise<RequestPasswordResetResult | { ok: false; error: string }> {
  const ip = await clientIp();
  const parsed = requestPasswordResetSchema.safeParse(toPlainObject(input));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };
  const identifier = parsed.data.identifier.trim();

  try {
    await enforceRateLimit('auth.password-reset', ip);
    await enforceRateLimit('auth.password-reset', identifier.toLowerCase());
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  const user = await db.user.findFirst({
    where: { OR: [{ email: identifier.toLowerCase() }, { phone: identifier }] },
  });

  let debugToken: string | undefined;

  if (user && user.status !== 'DELETED') {
    const rawToken = randomToken(32);
    await db.verificationToken.create({
      data: {
        userId: user.id,
        identifier,
        channel: user.email === identifier.toLowerCase() ? 'EMAIL' : 'SMS',
        purpose: 'PASSWORD_RESET',
        codeHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000),
      },
    });

    await notifyBestEffort({
      userId: user.id,
      template: 'password-reset-link',
      channels: [user.email === identifier.toLowerCase() ? 'EMAIL' : 'SMS'],
      data: { token: rawToken, resetUrl: `${env.appUrl}/auth/reset-password?token=${rawToken}` },
    });

    await audit({
      action: 'auth.passwordReset.requested',
      entity: 'User',
      entityId: user.id,
      ip,
      summary: 'درخواست بازیابی گذرواژه',
    });

    if (env.nodeEnv === 'test') debugToken = rawToken;
  }

  // Enumeration-safe: identical response whether or not the account exists.
  return { ok: true, message: GENERIC_RESET_MESSAGE, ...(debugToken ? { debugToken } : {}) };
}

export async function resetPassword(
  input: FormData | Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = await clientIp();
  const parsed = resetPasswordSchema.safeParse(toPlainObject(input));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };
  const { token, password } = parsed.data;

  try {
    await enforceRateLimit('auth.password-reset', ip);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  const row = await db.verificationToken.findFirst({
    where: { purpose: 'PASSWORD_RESET', consumedAt: null, codeHash: sha256(token) },
  });

  if (!row || row.expiresAt < new Date() || !row.userId) {
    return { ok: false, error: 'لینک بازیابی نامعتبر یا منقضی‌شده است. دوباره درخواست دهید.' };
  }

  const passwordHash = await hashPassword(password);

  await db.$transaction([
    db.user.update({
      where: { id: row.userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    }),
    db.verificationToken.update({ where: { id: row.id }, data: { consumedAt: new Date() } }),
  ]);

  await revokeAllSessions(row.userId);

  await audit({
    action: 'auth.passwordReset.completed',
    entity: 'User',
    entityId: row.userId,
    actorId: row.userId,
    actorType: 'USER',
    ip,
    summary: 'بازنشانی گذرواژه با موفقیت انجام شد',
  });

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────

export async function changePassword(
  input: FormData | Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await assertUser();
  const parsed = changePasswordSchema.safeParse(toPlainObject(input));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row?.passwordHash || !(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
    return { ok: false, error: 'گذرواژه فعلی نادرست است.' };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  await revokeAllSessions(user.id, user.sessionId);

  await audit({
    action: 'auth.password.change',
    entity: 'User',
    entityId: user.id,
    actorId: user.id,
    actorType: 'USER',
    summary: 'تغییر گذرواژه',
  });

  return { ok: true };
}

export async function updateProfile(
  input: FormData | Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await assertUser();
  const parsed = updateProfileSchema.safeParse(toPlainObject(input));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };
  const data = parsed.data;

  // Built field-by-field from parsed input — never a spread of raw input.
  const updateData: Record<string, unknown> = {};
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName !== undefined) updateData.lastName = data.lastName;
  if (data.nationalId !== undefined) updateData.nationalId = data.nationalId;
  if (data.marketingOptIn !== undefined) updateData.marketingOptIn = data.marketingOptIn;

  if (Object.keys(updateData).length === 0) return { ok: true };

  await db.user.update({ where: { id: user.id }, data: updateData });
  await audit({
    action: 'auth.profile.update',
    entity: 'User',
    entityId: user.id,
    actorId: user.id,
    actorType: 'USER',
    after: updateData,
  });

  return { ok: true };
}

export async function requestAccountDeletion(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await assertUser();

  await db.user.update({
    where: { id: user.id },
    data: {
      email: null,
      phone: null,
      firstName: null,
      lastName: null,
      nationalId: null,
      passwordHash: null,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackup: null,
      marketingOptIn: false,
      status: 'DELETED',
      deletedAt: new Date(),
    },
  });

  await revokeAllSessions(user.id);
  await destroySession();

  await audit({
    action: 'auth.account.deletionRequested',
    entity: 'User',
    entityId: user.id,
    actorId: user.id,
    actorType: 'USER',
    summary: 'حذف نرم حساب کاربری؛ اطلاعات هویتی حذف و سوابق مالی برای الزامات قانونی نگهداری شد',
  });

  return { ok: true };
}
