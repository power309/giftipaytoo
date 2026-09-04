import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { clientIp } from '@/server/auth/session';
import { getSessionUser } from '@/server/auth/session';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { logger } from '@/lib/logger';
import { searchProducts, logSearch, zeroResultSuggestions } from '@/server/catalog/search';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(48).optional().default(24),
  offset: z.coerce.number().int().min(0).max(1000).optional().default(0),
});

/**
 * GET /api/search?q=...&limit=...&offset=...
 * Public, read-only. Returns ranked product hits, and when nothing matches,
 * zero-result suggestions so the UI never dead-ends.
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
    offset: searchParams.get('offset') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'عبارت جست‌وجو نامعتبر است.' }, { status: 400 });
  }
  const { q, limit, offset } = parsed.data;

  try {
    const hits = await searchProducts(q, { limit, offset });

    const user = await getSessionUser().catch(() => null);
    void logSearch(q, hits.length, user?.id ?? null);

    const results = hits.map((h) => ({
      slug: h.slug,
      nameFa: h.nameFa,
      nameEn: h.nameEn,
      posterPath: h.posterPath,
      priceFromToman: h.priceFromToman,
      brandNameFa: h.brandNameFa,
      categoryNameFa: h.categoryNameFa,
    }));

    const suggestions = results.length === 0 ? await zeroResultSuggestions(q) : null;

    return NextResponse.json(
      { ok: true, query: q, results, suggestions },
      { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=60' } },
    );
  } catch (err) {
    logger.error('search query failed', { err });
    return NextResponse.json({ ok: false, error: 'جست‌وجو در حال حاضر امکان‌پذیر نیست.' }, { status: 500 });
  }
}
