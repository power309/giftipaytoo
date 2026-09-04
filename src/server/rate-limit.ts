import 'server-only';
import { db } from './db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Durable fixed-window rate limiter backed by Postgres, with an in-process
 * fast path so hot buckets do not hit the database on every request.
 */

type Bucket = { limit: number; windowSec: number };

export const RATE_LIMITS = {
  'auth.login': { limit: 8, windowSec: 300 },
  'auth.register': { limit: 5, windowSec: 900 },
  'auth.otp-send': { limit: 4, windowSec: 600 },
  'auth.otp-verify': { limit: 10, windowSec: 600 },
  'auth.password-reset': { limit: 4, windowSec: 900 },
  'checkout.create': { limit: 12, windowSec: 300 },
  'payment.start': { limit: 10, windowSec: 300 },
  'coupon.apply': { limit: 20, windowSec: 300 },
  'search.query': { limit: 90, windowSec: 60 },
  'review.create': { limit: 5, windowSec: 3600 },
  'ticket.create': { limit: 6, windowSec: 3600 },
  'newsletter.subscribe': { limit: 4, windowSec: 3600 },
  'inventory.reveal': { limit: 30, windowSec: 300 },
  'api.generic': { limit: 120, windowSec: 60 },
} as const satisfies Record<string, Bucket>;

export type RateLimitKey = keyof typeof RATE_LIMITS;

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
  limit: number;
};

const memory = new Map<string, { count: number; resetAt: number }>();

function windowStart(windowSec: number): Date {
  const nowSec = Math.floor(Date.now() / 1000);
  return new Date(Math.floor(nowSec / windowSec) * windowSec * 1000);
}

export async function rateLimit(
  key: RateLimitKey,
  identifier: string,
): Promise<RateLimitResult> {
  const bucket = RATE_LIMITS[key];
  if (!env.limits.rateLimitEnabled) {
    return { ok: true, remaining: bucket.limit, retryAfterSec: 0, limit: bucket.limit };
  }

  const start = windowStart(bucket.windowSec);
  const bucketKey = `${key}:${identifier}`;
  const resetAt = start.getTime() + bucket.windowSec * 1000;
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));

  // Fast path: if this process already saw the bucket exceed the limit,
  // reject without a database round-trip.
  const cached = memory.get(bucketKey);
  if (cached && cached.resetAt === resetAt && cached.count >= bucket.limit) {
    return { ok: false, remaining: 0, retryAfterSec, limit: bucket.limit };
  }

  try {
    const row = await db.rateLimitHit.upsert({
      where: { bucketKey_windowStart: { bucketKey, windowStart: start } },
      create: {
        bucketKey,
        windowStart: start,
        count: 1,
        expiresAt: new Date(resetAt + 60_000),
      },
      update: { count: { increment: 1 } },
    });
    memory.set(bucketKey, { count: row.count, resetAt });
    const remaining = Math.max(0, bucket.limit - row.count);
    return {
      ok: row.count <= bucket.limit,
      remaining,
      retryAfterSec,
      limit: bucket.limit,
    };
  } catch (err) {
    // Fail closed on the in-memory counter rather than opening the gate wide.
    logger.error('rate limiter storage failure', { key, err });
    const next = (cached?.resetAt === resetAt ? cached.count : 0) + 1;
    memory.set(bucketKey, { count: next, resetAt });
    return {
      ok: next <= bucket.limit,
      remaining: Math.max(0, bucket.limit - next),
      retryAfterSec,
      limit: bucket.limit,
    };
  }
}

/** Removes expired counters. Called by the background worker. */
export async function pruneRateLimits(): Promise<number> {
  const res = await db.rateLimitHit.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  for (const [k, v] of memory) if (v.resetAt < Date.now()) memory.delete(k);
  return res.count;
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSec: number) {
    super('تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.');
    this.name = 'RateLimitError';
  }
}

export async function enforceRateLimit(key: RateLimitKey, identifier: string) {
  const res = await rateLimit(key, identifier);
  if (!res.ok) throw new RateLimitError(res.retryAfterSec);
  return res;
}
