# Catalog search

Owner of this doc: `src/server/catalog/**`, `src/app/api/search/**`.

## 1. Layout

```
src/server/catalog/
  types.ts     Shared ProductFilters / ProductSort / facet types, PRICE_BUCKETS
  cache.ts     safeCache() — unstable_cache with a graceful fallback outside Next's runtime
  queries.ts   Catalog read layer: home sections, listing+filters+facets, product
               detail, categories, brands, recommendations, recently-viewed
  search.ts    Persian-tolerant search, autocomplete, zero-result suggestions,
               popular-searches / query log

src/app/api/search/
  route.ts             GET /api/search?q=&limit=&offset=
  suggest/route.ts     GET /api/search/suggest?q=&limit=

prisma/migrations/20260904113140_search_indexes/migration.sql
  pg_trgm extension + GIN trigram indexes + supporting b-tree indexes,
  hand-written and managed OUTSIDE prisma/schema.prisma (see §3).
```

## 2. Normalization strategy — why

Persian/Farsi users routinely type the *same* thing several different ways:

- Arabic vs. Persian glyphs for the same letter: `ي` (Arabic yeh) vs `ی`
  (Persian yeh), `ك` (Arabic kaf) vs `ک` (Persian kaf).
- ZWNJ (zero-width non-joiner, "half-space") vs. a real space vs. no space
  at all: `گیفت‌کارت` / `گیفت کارت` / `گیفتکارت`.
- Persian digits (`۰-۹`), Arabic-Indic digits (`٠-٩`) and Latin digits (`0-9`)
  for the same number.
- Mixed Persian/Latin queries: `کارت پلی استیشن 50 دلاری`.

None of this is something Postgres (or any generic full-text engine) folds
for you out of the box. So **normalization happens in application code**,
with `normalizeFa()` / `searchKey()` from `src/lib/persian.ts`, applied
identically:

1. **At write time** — `Product.searchKeywords` is built with
   `buildSearchKeywords([nameFa, nameEn, ...])` when a product is
   created/updated (owned by the catalog-admin write path). It stores the
   full normalized phrase, the no-space form, and every individual token
   (>1 char) as a space-joined string — e.g. for `"پلی‌استیشن"` /
   `"PlayStation"` it stores something like
   `"پلیاستیشن پلیاستیشن playstation"`.
2. **At query time** — every search/autocomplete function normalizes the
   incoming query the same way before it ever reaches SQL.

Because both sides go through the same normalization, `"پلی استیشن"`,
`"پلی‌استیشن"`, `"پلي استيشن"` (Arabic yeh) and `"playstation"` all converge
on a query that matches the same stored product — see
`tests/unit/search.test.ts` for the exact convergence cases, and
`tests/integration/catalog.test.ts` for the end-to-end proof against a real
product row.

> **Known quirk, not a bug in this module:** `normalizeFa()`'s zero-width
> character strip (`​-‏`) runs *before* its ZWNJ→space rule, so
> ZWNJ is actually removed rather than turned into a space (the words end up
> joined, not spaced). This means `normalizeFa("پلی‌استیشن")` ≠
> `normalizeFa("پلی استیشن")` — but `searchKey()` (which strips *all* spaces
> anyway) makes them converge again, and in SQL the trigram similarity
> comparison still finds the match either way. `src/lib/persian.ts` is
> shared, framework-free code outside this module's ownership; if you're
> the one who owns it and want ZWNJ to literally become a space, swap the
> order of those two `.replace()` calls.

## 3. The index migration

Prisma's schema DSL has no first-class way to declare `pg_trgm`'s GIN
operator classes, so the indexes are a **hand-written SQL migration**
(`prisma migrate dev --create-only`, then edited by hand) rather than
anything in `schema.prisma`. This is intentional and permanent — do not try
to "fix" it by adding trigram indexes to the schema file; Prisma will not
express them correctly.

`20260904113140_search_indexes/migration.sql` creates:

- `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
- GIN trigram indexes on `products.nameFa`, `products."nameEn"`,
  `products."searchKeywords"`, `brands."nameFa"`, `brands."nameEn"`,
  `categories."nameFa"`, `product_variants.sku`.
- B-tree indexes the filter/sort matrix needs that the base schema lacks:
  `products(status, viewCount)` and `(status, ratingAvg)` for `sort=popular`
  /`sort=rating`, `products(publishAt)` / `(expiresAt)` for the visibility
  check every query runs, `product_variants(isActive, basePriceToman)` /
  `(currencyCode)` / `(platformId)` for price/currency/platform
  filtering, a partial index `inventory_items(variantId) WHERE status =
  'AVAILABLE'` for the in-stock filter/facet, and `order_items(variantId)`
  for co-purchase recommendations.

Because these live outside `schema.prisma`, `npx prisma migrate status` and
`npx prisma db pull`/`diff` will never show drift for them as long as nobody
edits this migration file after the fact — treat it as immutable, like every
other applied migration; add a **new** migration for any further index
changes.

Verify locally after checkout:

```bash
npx prisma migrate status   # "Database schema is up to date!"
psql "$DATABASE_URL" -c '\di *trgm*'
```

## 4. Ranking formula

`searchProducts(q, { limit, offset })` in `search.ts` runs one parameterized
`$queryRaw` (built with `Prisma.sql` / `Prisma.join` — **every** interpolated
value is bound as a real query parameter, never string-concatenated) that
computes, per product:

```
rank_tier = GREATEST(
  4  if searchKeywords contains the normalized query as a whole word/phrase
  3  if searchKeywords starts with the normalized query (prefix)
  2  if trigram similarity(searchKeywords | nameFa | nameEn, query) matches (pg_trgm's `%` operator, default threshold 0.3)
  1  if a variant SKU starts with the query, OR the brand/category name is trigram-similar
)
score = GREATEST(similarity(searchKeywords, q), similarity(nameFa, q), similarity(nameEn, q))
```

Results are ordered `rank_tier DESC, score DESC, salesCount DESC, id ASC` —
**exact match beats prefix beats fuzzy beats taxonomy/SKU match**, and within
a tier, the more textually similar hit wins; ties are broken by popularity
(`salesCount`) so that among equally-relevant results the ones people
actually buy surface first, then `id` for a fully deterministic order.

Only rows with `rank_tier > 0` are returned, and only visible products
(`status = ACTIVE`, published, not expired/archived — the same rule as
`visibleProductWhere()` in `queries.ts`, duplicated in raw SQL here because
this is a raw query; keep both in sync if the visibility rule ever changes).

`listProducts({ q })` in `queries.ts` reuses this via `searchProductIds()`
(same ranking, ids only) and intersects it with the other structured filters
— so "search inside a category/brand/price range" works without a second
ranking implementation.

## 5. Autocomplete

`GET /api/search/suggest` → `autocomplete(q, limit)` returns three small,
independently-capped groups (products, brands, categories), each ordered
"prefix match first, then trigram similarity" and capped at 5-10 rows per
group — three small indexed queries in parallel (`Promise.all`), no
aggregation, which is what keeps it fast (<100ms warm on the indexes above).
`q.length < 2` short-circuits to `{ products: [], brands: [], categories: [] }`
without touching the database.

## 6. Zero-result fallback

`zeroResultSuggestions(q)` is called by `GET /api/search` whenever the ranked
search comes back empty. It returns the 5 closest brands and 5 closest
categories by trigram similarity (there is always *some* answer — Postgres
just returns whatever is closest, even if the similarity score is low) plus
`popularSearches()`, so the search UI can always offer *something* — "did
you mean…" chips or "popular searches" — instead of a dead end.

## 7. Popular searches / query log

`logSearch(q, resultCount, userId?)` writes a row to `SearchQueryLog` with
both the raw and normalized query. It is called fire-and-forget
(`void logSearch(...)`) from `GET /api/search` after every successful query,
never on the client's critical path.

Logging is de-duplicated **per process**, per `(userId ?? 'anon', normalized
query)` pair, for 15 seconds (`recentLogs`, a small in-memory `Map`,
opportunistically pruned) — enough to stop a user mashing Enter or a
misbehaving client from flooding the table with identical rows. This is
intentionally lightweight: it is an analytics-quality guard, not a security
boundary. The real guard against abuse volume is the route-level
`enforceRateLimit('search.query', ip)` (90 requests/minute — see
`src/server/rate-limit.ts`), applied to *every* request to `/api/search` and
`/api/search/suggest` regardless of whether it results in a log write.

`popularSearches(limit)` groups `SearchQueryLog` by `normalized` over the
last 30 days, most-frequent first, and resolves a display label by looking
up the most recent raw `query` text for each group.

## 8. Extending the filter/facet matrix

`ProductFilters` in `types.ts` is the single place new filter dimensions get
added. To add one:

1. Add the field to `ProductFilters`.
2. Handle it in `buildProductWhere()` in `queries.ts` — most filters are a
   straightforward Prisma `where` clause; variant-level filters (region,
   currency, price, denomination, discount) get pushed into the shared
   `variantConds` array so they compose as a single `variants: { some: { AND: [...] } }`.
3. If the new dimension should show up in the filter sidebar with real
   counts, add it to `buildFacets()` — follow the existing per-value
   `Promise.all(values.map(async v => ({ value, label, count: await db.product.count(...) })))`
   pattern (bounded by the number of distinct values, e.g. platforms or
   regions — never looped per product).
4. If sorting by the new dimension requires an aggregate that Prisma's
   `orderBy` can't express on a to-many relation (like price/discount
   today), extend `rankProductsByPriceOrDiscount()`'s raw query rather than
   inventing a second ranking mechanism.
5. If the new filter needs a WHERE-clause-shaped index that the base schema
   doesn't have, add a new migration (never edit
   `20260904113140_search_indexes` after the fact) with the extra index.

## 9. Non-negotiables checklist

- Every `$queryRaw` call in this module uses `Prisma.sql`/`Prisma.join` —
  grep for `queryRaw` and confirm no template literal is ever built with
  plain string concatenation of user input.
- No catalog query anywhere selects `InventoryItem.codeCipher`,
  `serialCipher`, `pinCipher` or `codeFingerprint` — availability is always
  a presence/count probe (`select: { id: true }` or `_count`), never the
  encrypted payload.
- `visibleProductWhere()` in `queries.ts` is the only place that decides
  whether a product is shown to a shopper; every list/detail/search query
  composes with it (or, for the raw SQL in `search.ts`, duplicates the exact
  same four conditions — see §4).
