import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { logger } from '@/lib/logger';
import { hmacHex, timingSafeEqualStr } from '@/lib/crypto';
import { isUniqueConstraintError } from './prisma-utils';

/**
 * Generic signed inbound webhook receiver, for gateways/providers that push
 * events instead of (or in addition to) redirecting the browser through a
 * `/callback` route. Not wired to a specific provider — the signing secret
 * is looked up per-provider from `Setting["payment.webhook.<provider>.secret"]`,
 * set by an admin.
 *
 * Signature scheme (documented in docs/PAYMENTS.md):
 *   header  x-webhook-timestamp: unix seconds
 *   header  x-webhook-signature: hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
 * A request outside the 5-minute replay window, or with a signature that
 * does not match, is rejected with 401 — it never reaches JSON parsing or
 * the database.
 */

const REPLAY_WINDOW_SEC = 300; // 5 minutes

export type SignatureCheck = { ok: true } | { ok: false; reason: 'stale' | 'bad_signature' };

/** Pure — unit-testable without a database or Next.js request object. */
export function verifyWebhookSignature(input: {
  secret: string;
  timestampSec: number;
  rawBody: string;
  signature: string;
  now?: Date;
}): SignatureCheck {
  const nowSec = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!Number.isFinite(input.timestampSec) || Math.abs(nowSec - input.timestampSec) > REPLAY_WINDOW_SEC) {
    return { ok: false, reason: 'stale' };
  }
  const expected = hmacHex(input.secret, `${input.timestampSec}.${input.rawBody}`);
  if (!timingSafeEqualStr(expected, input.signature)) {
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: true };
}

async function getWebhookSecret(provider: string): Promise<string | null> {
  try {
    const row = await db.setting.findUnique({ where: { key: `payment.webhook.${provider}.secret` } });
    if (!row || typeof row.value !== 'string' || row.value.length === 0) return null;
    return row.value;
  } catch (err) {
    logger.error('webhook: failed reading provider secret setting', {
      provider,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

const webhookBodySchema = z.object({ eventId: z.string().min(1) }).passthrough();

export type InboundWebhookResult = { status: 200 | 202 | 400 | 401 | 409; body: { ok: boolean; error?: string } };

export async function receiveWebhook(input: {
  provider: string;
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
}): Promise<InboundWebhookResult> {
  const secret = await getWebhookSecret(input.provider);
  if (!secret) {
    logger.warn('webhook: no secret configured for provider', { provider: input.provider });
    return { status: 401, body: { ok: false, error: 'این ارائه‌دهنده وب‌هوک پیکربندی نشده است.' } };
  }
  if (!input.signatureHeader || !input.timestampHeader) {
    return { status: 401, body: { ok: false, error: 'هدرهای امضا/زمان‌مهر وب‌هوک یافت نشد.' } };
  }

  const timestampSec = Number(input.timestampHeader);
  const signatureCheck = verifyWebhookSignature({
    secret,
    timestampSec,
    rawBody: input.rawBody,
    signature: input.signatureHeader,
  });
  if (!signatureCheck.ok) {
    logger.warn('webhook: signature check failed', { provider: input.provider, reason: signatureCheck.reason });
    return {
      status: 401,
      body: {
        ok: false,
        error: signatureCheck.reason === 'stale' ? 'وب‌هوک خارج از بازه زمانی مجاز است.' : 'امضای وب‌هوک نامعتبر است.',
      },
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, body: { ok: false, error: 'بدنه وب‌هوک JSON معتبر نیست.' } };
  }
  const parsed = webhookBodySchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 400, body: { ok: false, error: 'ساختار بدنه وب‌هوک نامعتبر است (فیلد eventId لازم است).' } };
  }
  const eventId = parsed.data.eventId;

  try {
    await db.webhookEvent.create({
      data: {
        provider: input.provider,
        eventId,
        signature: input.signatureHeader,
        payload: payload as Prisma.InputJsonValue,
        verified: true,
        processedAt: new Date(),
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      logger.info('webhook: duplicate event id, already processed', { provider: input.provider, eventId });
      return { status: 409, body: { ok: false, error: 'این رویداد قبلاً پردازش شده است.' } };
    }
    throw err;
  }

  try {
    await db.jobQueue.create({
      data: {
        type: `webhook:${input.provider}`,
        payload: payload as Prisma.InputJsonValue,
        idempotencyKey: `webhook:${input.provider}:${eventId}`,
      },
    });
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;
  }

  return { status: 202, body: { ok: true } };
}
