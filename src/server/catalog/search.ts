import 'server-only';

/**
 * Persian-tolerant catalog search.
 *
 * Strategy (see docs/SEARCH.md for the full write-up):
 *  1. The query is normalized with `normalizeFa`/`searchKey` from `@/lib/persian`
 *     — the same normalization used to build `Product.searchKeywords` at write
 *     time — so Arabic glyph variants, digits, ZWNJ and spacing differences
 *     fold to the same comparison key on both sides.
 *  2. Matching runs in Postgres via `pg_trgm` (GIN trigram indexes, migration
 *     `20260904113140_search_indexes`) so it stays fast without an external
 *     search engine.
 *  3. Ranking is tiered: exact normalized match > prefix match > trigram
 *     similarity > taxonomy/SKU match, each tier broken by trigram score then
 *     `salesCount` as a popularity tiebreaker.
 *
 * ALL raw SQL here uses `Prisma.sql` tagged templates — every interpolated
 * value is bound as a query parameter, never string-concatenated.
 */

import { Prisma } from '@prisma/client';
import { db } from '@/server/db';
import { logger } from '@/lib/logger';
import { normalizeFa, searchKey } from '@/lib/persian';

// ─────────────────────────────────────────────────────────────
// Ranked product search
// ─────────────────────────────────────────────────────────────

export type SearchHit = {
  id: string;
  slug: string;
  nameFa: string;
  nameEn: string | null;
  posterPath: string | null;
  priceFromToman: number | null;
  brandNameFa: string;
  categoryNameFa: string;
  rankTier: number;
  score: number;
};

/**
 * Full ranked product search across name (fa/en), search keywords, brand
 * name, category name and variant SKUs. Only visible products are returned.
 */
export async function searchProducts(
  q: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<SearchHit[]> {
  const norm = normalizeFa(q);
  if (!norm) return [];
  const nospace = searchKey(q);
  const limit = Math.min(60, Math.max(1, Math.floor(opts.limit ?? 24)));
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));

  const rows = await db.$queryRaw<
    Array<{
      id: string;
      slug: string;
      nameFa: string;
      nameEn: string | null;
      poster: string | null;
      price: number | null;
      brandNameFa: string;
      categoryNameFa: string;
      rank_tier: number;
      score: number;
    }>
  >(Prisma.sql`
    SELECT
      p.id, p.slug, p."nameFa", p."nameEn",
      (SELECT pm.path FROM product_media pm WHERE pm."productId" = p.id AND pm.kind = 'POSTER'
         ORDER BY pm."sortOrder" ASC LIMIT 1) AS poster,
      (SELECT MIN(COALESCE(v."salePriceToman", v."basePriceToman")) FROM product_variants v
         WHERE v."productId" = p.id AND v."isActive" = true) AS price,
      br."nameFa" AS "brandNameFa",
      cat."nameFa" AS "categoryNameFa",
      GREATEST(
        CASE WHEN p."searchKeywords" IS NOT NULL
               AND ((' ' || p."searchKeywords" || ' ') LIKE ${'% ' + norm + ' %'} OR p."searchKeywords" = ${nospace})
             THEN 4 ELSE 0 END,
        CASE WHEN p."searchKeywords" IS NOT NULL AND p."searchKeywords" LIKE ${norm + '%'} THEN 3 ELSE 0 END,
        CASE WHEN p."searchKeywords" % ${norm} OR p."nameFa" % ${norm} OR COALESCE(p."nameEn", '') % ${norm}
             THEN 2 ELSE 0 END,
        CASE WHEN EXISTS (
               SELECT 1 FROM product_variants v2 WHERE v2."productId" = p.id AND v2.sku ILIKE ${norm + '%'}
             ) THEN 1 ELSE 0 END,
        CASE WHEN br."nameFa" % ${norm} OR br."nameEn" % ${norm} THEN 1 ELSE 0 END,
        CASE WHEN cat."nameFa" % ${norm} THEN 1 ELSE 0 END
      )::int AS rank_tier,
      GREATEST(
        similarity(COALESCE(p."searchKeywords", ''), ${norm}),
        similarity(p."nameFa", ${norm}),
        similarity(COALESCE(p."nameEn", ''), ${norm})
      ) AS score
    FROM products p
    JOIN brands br ON br.id = p."brandId"
    JOIN categories cat ON cat.id = p."categoryId"
    WHERE p.status = 'ACTIVE' AND p."archivedAt" IS NULL
      AND (p."publishAt" IS NULL OR p."publishAt" <= now())
      AND (p."expiresAt" IS NULL OR p."expiresAt" > now())
      AND (
        p."searchKeywords" % ${norm} OR
        p."nameFa" % ${norm} OR
        COALESCE(p."nameEn", '') % ${norm} OR
        (p."searchKeywords" IS NOT NULL AND p."searchKeywords" LIKE ${norm + '%'}) OR
        br."nameFa" % ${norm} OR br."nameEn" % ${norm} OR
        cat."nameFa" % ${norm} OR
        EXISTS (SELECT 1 FROM product_variants v3 WHERE v3."productId" = p.id AND v3.sku ILIKE ${norm + '%'})
      )
    ORDER BY rank_tier DESC, score DESC, p."salesCount" DESC, p.id ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  return rows
    .filter((r) => r.rank_tier > 0)
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      nameFa: r.nameFa,
      nameEn: r.nameEn,
      posterPath: r.poster,
      priceFromToman: r.price,
      brandNameFa: r.brandNameFa,
      categoryNameFa: r.categoryNameFa,
      rankTier: r.rank_tier,
      score: Number(r.score),
    }));
}

/** Convenience used by `listProducts({ q })` to intersect the free-text query with other filters. */
export async function searchProductIds(q: string, opts: { limit?: number } = {}): Promise<string[]> {
  const hits = await searchProducts(q, { limit: opts.limit ?? 200 });
  return hits.map((h) => h.id);
}

// ─────────────────────────────────────────────────────────────
// Autocomplete
// ─────────────────────────────────────────────────────────────

export type AutocompleteResult = {
  products: { slug: string; label: string; posterPath: string | null; priceFromToman: number | null }[];
  brands: { slug: string; label: string; logoPath: string | null }[];
  categories: { slug: string; label: string; posterPath: string | null }[];
};

const EMPTY_AUTOCOMPLETE: AutocompleteResult = { products: [], brands: [], categories: [] };

/** Fast, grouped suggestions for the search box. Safe for empty/very short input. */
export async function autocomplete(q: string, limit = 6): Promise<AutocompleteResult> {
  const norm = normalizeFa(q);
  if (norm.length < 2) return EMPTY_AUTOCOMPLETE;
  const cap = Math.min(10, Math.max(1, Math.floor(limit)));
  const sideCap = Math.min(cap, 5);

  const [productRows, brandRows, categoryRows] = await Promise.all([
    db.$queryRaw<Array<{ slug: string; label: string; poster: string | null; price: number | null }>>(Prisma.sql`
      SELECT p.slug, p."nameFa" AS label,
        (SELECT pm.path FROM product_media pm WHERE pm."productId" = p.id AND pm.kind = 'POSTER'
           ORDER BY pm."sortOrder" ASC LIMIT 1) AS poster,
        (SELECT MIN(COALESCE(v."salePriceToman", v."basePriceToman")) FROM product_variants v
           WHERE v."productId" = p.id AND v."isActive" = true) AS price
      FROM products p
      WHERE p.status = 'ACTIVE' AND p."archivedAt" IS NULL
        AND (p."publishAt" IS NULL OR p."publishAt" <= now())
        AND (p."expiresAt" IS NULL OR p."expiresAt" > now())
        AND (
          (p."searchKeywords" IS NOT NULL AND p."searchKeywords" LIKE ${norm + '%'}) OR
          p."searchKeywords" % ${norm} OR p."nameFa" % ${norm} OR COALESCE(p."nameEn", '') % ${norm}
        )
      ORDER BY
        CASE WHEN p."searchKeywords" IS NOT NULL AND p."searchKeywords" LIKE ${norm + '%'} THEN 0 ELSE 1 END,
        GREATEST(similarity(COALESCE(p."searchKeywords", ''), ${norm}), similarity(p."nameFa", ${norm})) DESC,
        p."salesCount" DESC
      LIMIT ${cap}
    `),
    db.$queryRaw<Array<{ slug: string; label: string; logo: string | null }>>(Prisma.sql`
      SELECT slug, "nameFa" AS label, "logoKey" AS logo
      FROM brands
      WHERE "isActive" = true AND ("nameFa" % ${norm} OR "nameEn" % ${norm} OR "nameFa" LIKE ${norm + '%'})
      ORDER BY
        CASE WHEN "nameFa" LIKE ${norm + '%'} THEN 0 ELSE 1 END,
        GREATEST(similarity("nameFa", ${norm}), similarity("nameEn", ${norm})) DESC
      LIMIT ${sideCap}
    `),
    db.$queryRaw<Array<{ slug: string; label: string; poster: string | null }>>(Prisma.sql`
      SELECT slug, "nameFa" AS label, "posterKey" AS poster
      FROM categories
      WHERE "isActive" = true AND ("nameFa" % ${norm} OR "nameFa" LIKE ${norm + '%'})
      ORDER BY
        CASE WHEN "nameFa" LIKE ${norm + '%'} THEN 0 ELSE 1 END,
        similarity("nameFa", ${norm}) DESC
      LIMIT ${sideCap}
    `),
  ]);

  return {
    products: productRows.map((r) => ({ slug: r.slug, label: r.label, posterPath: r.poster, priceFromToman: r.price })),
    brands: brandRows.map((r) => ({ slug: r.slug, label: r.label, logoPath: r.logo })),
    categories: categoryRows.map((r) => ({ slug: r.slug, label: r.label, posterPath: r.poster })),
  };
}

// ─────────────────────────────────────────────────────────────
// Zero-result fallback
// ─────────────────────────────────────────────────────────────

export type ZeroResultSuggestions = {
  brands: { slug: string; nameFa: string; logoKey: string | null }[];
  categories: { slug: string; nameFa: string; iconKey: string | null }[];
  popular: { query: string; count: number }[];
};

/** When a search comes back empty, offer the closest taxonomy + what other shoppers search for. */
export async function zeroResultSuggestions(q: string): Promise<ZeroResultSuggestions> {
  const norm = normalizeFa(q);
  if (!norm) {
    return { brands: [], categories: [], popular: await popularSearches(8) };
  }

  const [brands, categories, popular] = await Promise.all([
    db.$queryRaw<Array<{ slug: string; nameFa: string; logoKey: string | null }>>(Prisma.sql`
      SELECT slug, "nameFa", "logoKey"
      FROM brands
      WHERE "isActive" = true
      ORDER BY GREATEST(similarity("nameFa", ${norm}), similarity("nameEn", ${norm})) DESC
      LIMIT 5
    `),
    db.$queryRaw<Array<{ slug: string; nameFa: string; iconKey: string | null }>>(Prisma.sql`
      SELECT slug, "nameFa", "iconKey"
      FROM categories
      WHERE "isActive" = true
      ORDER BY similarity("nameFa", ${norm}) DESC
      LIMIT 5
    `),
    popularSearches(8),
  ]);

  return { brands, categories, popular };
}

// ─────────────────────────────────────────────────────────────
// Popular searches / query log
// ─────────────────────────────────────────────────────────────

export async function popularSearches(limit = 10): Promise<{ query: string; count: number }[]> {
  const cap = Math.min(30, Math.max(1, Math.floor(limit)));
  const since = new Date(Date.now() - 30 * 24 * 3600_000);

  const groups = await db.searchQueryLog.groupBy({
    by: ['normalized'],
    where: { createdAt: { gte: since }, normalized: { not: '' } },
    _count: { _all: true },
    orderBy: { _count: { normalized: 'desc' } },
    take: cap,
  });
  if (groups.length === 0) return [];

  const labels = await Promise.all(
    groups.map((g) =>
      db.searchQueryLog.findFirst({
        where: { normalized: g.normalized },
        orderBy: { createdAt: 'desc' },
        select: { query: true },
      }),
    ),
  );
  return groups.map((g, i) => ({ query: labels[i]?.query ?? g.normalized, count: g._count._all }));
}

// Best-effort, per-process de-dupe so a user mashing enter (or a bot loop)
// cannot flood `search_query_logs` with the same normalized query. This is
// intentionally lightweight — logging analytics data, not a security
// boundary (the request-level `enforceRateLimit('search.query', ip)` in the
// route handler is the real guard against abuse volume).
const recentLogs = new Map<string, number>();
const LOG_DEDUPE_MS = 15_000;
const LOG_DEDUPE_MAX_ENTRIES = 5000;

export async function logSearch(q: string, resultCount: number, userId?: string | null): Promise<void> {
  const normalized = normalizeFa(q);
  if (!normalized) return;

  const key = `${userId ?? 'anon'}:${normalized}`;
  const now = Date.now();
  const last = recentLogs.get(key);
  if (last && now - last < LOG_DEDUPE_MS) return;
  recentLogs.set(key, now);

  if (recentLogs.size > LOG_DEDUPE_MAX_ENTRIES) {
    const cutoff = now - LOG_DEDUPE_MS * 4;
    for (const [k, t] of recentLogs) if (t < cutoff) recentLogs.delete(k);
  }

  try {
    await db.searchQueryLog.create({
      data: {
        query: q.slice(0, 200),
        normalized: normalized.slice(0, 200),
        resultCount: Math.max(0, Math.floor(resultCount)),
        userId: userId ?? null,
      },
    });
  } catch (err) {
    logger.warn('logSearch failed', { err });
  }
}
