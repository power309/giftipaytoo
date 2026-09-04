import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { clientIp } from '@/server/auth/session';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { logger } from '@/lib/logger';
import { autocomplete, popularSearches } from '@/server/catalog/search';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  limit: z.coerce.number().int().min(1).max(10).optional().default(6),
});

/**
 * GET /api/search/suggest?q=...&limit=...
 * Grouped autocomplete suggestions (products / brands / categories). Public,
 * read-only, tuned to respond fast. Empty/short `q` returns popular searches
 * instead of an empty box so the dropdown is never blank.
 */
export async function GET(req: NextRequest) {
  const ip = await clientIp();
  try {
    await enforceRateLimit('search.query', ip);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 429 });
    }
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get('q') ?? '',
    limit: searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'عبارت جست‌وجو نامعتبر است.' }, { status: 400 });
  }
  const { q, limit } = parsed.data;

  try {
    if (!q || q.trim().length < 2) {
      const popular = await popularSearches(8);
      return NextResponse.json(
        { ok: true, query: q, products: [], brands: [], categories: [], popular },
        { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
      );
    }

    const suggestions = await autocomplete(q, limit);
    return NextResponse.json(
      { ok: true, query: q, ...suggestions, popular: [] },
      { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=60' } },
    );
  } catch (err) {
    logger.error('search suggest failed', { err });
    return NextResponse.json({ ok: false, error: 'پیشنهاد جست‌وجو در حال حاضر امکان‌پذیر نیست.' }, { status: 500 });
  }
}
