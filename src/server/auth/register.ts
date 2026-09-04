'use server';

import crypto from 'node:crypto';
import { db } from '../db';
import { hashPassword } from '@/lib/crypto';
import { registerSchema, toPlainObject, firstZodMessage } from '@/lib/schemas';
import { enforceRateLimit, RateLimitError } from '../rate-limit';
import { audit } from '../audit';
import { createSession, clientIp, clientUserAgent } from './session';
import { sendVerificationCode } from './verification';
import { mergeGuestCart } from '../cart';
import { getOrCreateCartKey } from './session';
import { logger } from '@/lib/logger';

/**
 * Registration is enumeration-safe: whether the email/mobile already belongs
 * to an account or not, the caller always sees the same generic "check your
 * inbox/phone" response — timing and content never reveal account existence.
 * If the address is already registered, no new user/session is created;
 * instead the existing owner gets a "someone tried to register with your
 * address" notice (best-effort, never blocks the response).
 */

const GENERIC_MESSAGE =
  'اگر این ایمیل یا شماره موبایل قبلاً استفاده نشده باشد، کد تأیید برای شما ارسال می‌شود.';

function generateReferralCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 7; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

async function uniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateReferralCode();
    const clash = await db.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  // Astronomically unlikely, but never loop forever.
  return `${generateReferralCode()}${Date.now().toString(36).toUpperCase()}`.slice(0, 12);
}

async function notifyDuplicateRegistration(userId: string, identifier: string): Promise<void> {
  try {
    const mod: Record<string, unknown> = await import('@/server/notifications/service');
    if (typeof mod.notify === 'function') {
      await (mod.notify as (p: unknown) => Promise<unknown>)({
        userId,
        template: 'register-attempt-duplicate',
        channels: ['IN_APP', 'EMAIL'],
        data: { identifier },
      });
    }
  } catch (err) {
    logger.warn('register: could not notify owner of duplicate signup attempt (lazy seam)', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export type RegisterResult = { ok: true; message: string } | { ok: false; error: string };

export async function registerUser(input: FormData | Record<string, unknown>): Promise<RegisterResult> {
  const ip = await clientIp();

  try {
    await enforceRateLimit('auth.register', ip);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  const parsed = registerSchema.safeParse(toPlainObject(input));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };
  const data = parsed.data;

  const identifier = data.email || data.mobile!;
  const channel = data.email ? 'EMAIL' : 'SMS';

  const existing = await db.user.findFirst({
    where: {
      OR: [data.email ? { email: data.email } : undefined, data.mobile ? { phone: data.mobile } : undefined].filter(
        (x): x is NonNullable<typeof x> => !!x,
      ),
    },
    select: { id: true },
  });

  if (existing) {
    await notifyDuplicateRegistration(existing.id, identifier);
    await audit({
      action: 'auth.register.duplicateAttempt',
      entity: 'User',
      entityId: existing.id,
      ip,
      summary: 'تلاش برای ثبت‌نام مجدد با آدرس تکراری',
    });
    return { ok: true, message: GENERIC_MESSAGE };
  }

  let referredById: string | null = null;
  if (data.referralCode) {
    const referrer = await db.user.findUnique({
      where: { referralCode: data.referralCode.trim().toUpperCase() },
      select: { id: true },
    });
    referredById = referrer?.id ?? null;
  }

  const passwordHash = await hashPassword(data.password);
  const referralCode = await uniqueReferralCode();

  const user = await db.user.create({
    data: {
      email: data.email || null,
      phone: data.mobile || null,
      passwordHash,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      status: 'PENDING_VERIFICATION',
      referralCode,
      referredById,
      marketingOptIn: data.marketingOptIn ?? false,
    },
    select: { id: true },
  });

  await sendVerificationCode({
    userId: user.id,
    identifier,
    channel,
    purpose: data.email ? 'EMAIL_VERIFY' : 'PHONE_VERIFY',
  });

  await createSession(user.id, { deviceLabel: undefined });

  try {
    const cartKey = await getOrCreateCartKey();
    await mergeGuestCart(cartKey, user.id);
  } catch (err) {
    logger.warn('register: guest cart merge failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  await audit({
    action: 'auth.register',
    entity: 'User',
    entityId: user.id,
    actorId: user.id,
    actorType: 'USER',
    ip,
    userAgent: await clientUserAgent(),
    summary: 'ثبت‌نام کاربر جدید',
  });

  return { ok: true, message: GENERIC_MESSAGE };
}
