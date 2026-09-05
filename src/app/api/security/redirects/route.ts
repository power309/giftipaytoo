import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { clientIp } from '@/server/auth/session';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Internal redirect-map feed. Middleware runs on the Edge and cannot query
 * Prisma directly, so it fetches this route (with an in-memory TTL cache —
 * see src/middleware.ts) instead. The payload is not sensitive — it is the
 * same 301/302 mapping a crawler already observes — so this stays a plain
 * public GET rather than requiring a shared secret; it is still rate-limited
 * and fails open (an empty list) rather than 500ing, so a DB hiccup here
 * degrades to "no redirects applied this minute", never a broken page.
 */
export async function GET() {
  const ip = await clientIp();
  try {
    await enforceRateLimit('api.generic', ip);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 429 });
    }
    throw err;
  }

  try {
    const rows = await db.redirect.findMany({
      where: { isActive: true },
      select: { fromPath: true, toPath: true, statusCode: true },
      orderBy: { fromPath: 'asc' },
    });
    return NextResponse.json(
      { redirects: rows, generatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' } },
    );
  } catch (err) {
    logger.error('security/redirects: read failed', { err });
    return NextResponse.json({ redirects: [], generatedAt: new Date().toISOString() });
  }
}
