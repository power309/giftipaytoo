'use server';

import type { VerificationChannel, VerificationPurpose } from '@prisma/client';
import { db } from '../db';
import { randomOtp, sha256, timingSafeEqualStr } from '@/lib/crypto';
import { enforceRateLimit, RateLimitError } from '../rate-limit';
import { audit } from '../audit';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Email/SMS one-time-code verification (registration, phone confirmation,
 * password reset, 2FA-by-code, order confirmation).
 *
 * Codes are 6 digits, stored only as a SHA-256 hash (never in plaintext),
 * expire after 10 minutes, allow at most 5 verification attempts, and are
 * rate-limited on both send (resend cooldown) and verify (brute-force
 * guard) — see `RATE_LIMITS['auth.otp-send'|'auth.otp-verify']`.
 */

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function purposeTemplate(purpose: VerificationPurpose): string {
  switch (purpose) {
    case 'EMAIL_VERIFY':
      return 'verify-email';
    case 'PHONE_VERIFY':
      return 'verify-phone';
    case 'PASSWORD_RESET':
      return 'password-reset-otp';
    case 'LOGIN_2FA':
      return 'login-2fa-otp';
    case 'ORDER_CONFIRM':
      return 'order-confirm-otp';
    default:
      return 'generic-otp';
  }
}

/**
 * Best-effort dispatch through the notifications agent's module. That module
 * is being built concurrently, so this is a lazy import wrapped in try/catch
 * with an honest fallback: if it isn't available (or doesn't yet export
 * `notify`), the code is still generated and stored — it just isn't
 * delivered — and a warning is logged so the gap is visible in dev.
 *
 * SEAM: expected contract is `notify({ userId?, template, channels, data })`
 * from `@/server/notifications/service`. Verify the real export matches once
 * that module lands.
 */
async function dispatch(params: {
  userId?: string | null;
  identifier: string;
  channel: VerificationChannel;
  purpose: VerificationPurpose;
  code: string;
}): Promise<boolean> {
  try {
    const mod: Record<string, unknown> = await import('@/server/notifications/service');
    if (typeof mod.notify !== 'function') {
      logger.warn('verification: notifications module has no notify() export yet, code not dispatched', {
        purpose: params.purpose,
      });
      return false;
    }
    await (mod.notify as (p: unknown) => Promise<unknown>)({
      userId: params.userId ?? undefined,
      identifier: params.identifier,
      template: purposeTemplate(params.purpose),
      channels: [params.channel],
      data: { code: params.code, expiresInMinutes: OTP_TTL_MINUTES },
    });
    return true;
  } catch (err) {
    logger.warn('verification: notifications module unavailable, code not dispatched (lazy seam)', {
      purpose: params.purpose,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export type SendVerificationResult =
  | { ok: true; expiresAt: Date; dispatched: boolean; debugCode?: string }
  | { ok: false; error: string; retryAfterSec?: number };

/**
 * Generates and stores a fresh code, invalidating no prior codes (older
 * codes simply expire or run out of attempts on their own — this keeps the
 * function side-effect-free on rows it doesn't own).
 */
export async function sendVerificationCode(input: {
  userId?: string | null;
  identifier: string;
  channel: VerificationChannel;
  purpose: VerificationPurpose;
}): Promise<SendVerificationResult> {
  try {
    await enforceRateLimit('auth.otp-send', `${input.purpose}:${input.identifier}`);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return {
        ok: false,
        error: 'به‌تازگی یک کد برای شما ارسال شده است. کمی صبر کنید و دوباره تلاش کنید.',
        retryAfterSec: err.retryAfterSec,
      };
    }
    throw err;
  }

  const code = randomOtp(6);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  await db.verificationToken.create({
    data: {
      userId: input.userId ?? null,
      identifier: input.identifier,
      channel: input.channel,
      purpose: input.purpose,
      codeHash: sha256(code),
      expiresAt,
    },
  });

  const dispatched = await dispatch({ ...input, code });

  return {
    ok: true,
    expiresAt,
    dispatched,
    // Test-only escape hatch: automated tests have no inbox/SMS to read from,
    // and the code is a one-way hash in the database. Never present outside
    // the test runner.
    ...(env.nodeEnv === 'test' ? { debugCode: code } : {}),
  };
}

export type VerifyCodeResult = { ok: true } | { ok: false; error: string };

export async function verifyCode(input: {
  identifier: string;
  code: string;
  purpose: VerificationPurpose;
}): Promise<VerifyCodeResult> {
  try {
    await enforceRateLimit('auth.otp-verify', `${input.purpose}:${input.identifier}`);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, error: 'تعداد تلاش‌های تأیید بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.' };
    }
    throw err;
  }

  const token = await db.verificationToken.findFirst({
    where: { identifier: input.identifier, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!token || token.expiresAt < new Date()) {
    return { ok: false, error: 'کد تأیید نامعتبر یا منقضی‌شده است.' };
  }
  if (token.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: 'تعداد تلاش‌های مجاز برای این کد به پایان رسیده؛ کد جدیدی درخواست کنید.' };
  }

  const matches = timingSafeEqualStr(sha256(input.code), token.codeHash);
  if (!matches) {
    await db.verificationToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: 'کد تأیید نادرست است.' };
  }

  await db.$transaction(async (tx) => {
    await tx.verificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
    if (token.userId) {
      if (token.purpose === 'EMAIL_VERIFY') {
        await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date() } });
      } else if (token.purpose === 'PHONE_VERIFY') {
        await tx.user.update({ where: { id: token.userId }, data: { phoneVerifiedAt: new Date() } });
      }
    }
  });

  await audit({
    action: 'auth.verificationCode.confirm',
    entity: 'VerificationToken',
    entityId: token.id,
    actorId: token.userId,
    actorType: 'USER',
    summary: `تأیید کد برای ${token.purpose}`,
  });

  return { ok: true };
}
