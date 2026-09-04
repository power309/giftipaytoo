-- Search & filter indexes.
--
-- These are hand-written and managed OUTSIDE prisma/schema.prisma (Prisma has
-- no first-class support for the `pg_trgm` extension or GIN operator classes).
-- See docs/SEARCH.md for the rationale. Do not edit this migration; if the
-- indexing strategy changes, add a new migration.

-- Trigram similarity + fast ILIKE / substring matching.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Persian-tolerant fuzzy search ───────────────────────────────────────────
-- All text going into these columns is normalized (see src/lib/persian.ts)
-- before being written or compared, so the trigram index matches Persian
-- glyph variants (ي/ی, ك/ک) consistently.

CREATE INDEX IF NOT EXISTS "products_nameFa_trgm_idx"
  ON "products" USING GIN ("nameFa" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "products_nameEn_trgm_idx"
  ON "products" USING GIN ("nameEn" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "products_searchKeywords_trgm_idx"
  ON "products" USING GIN ("searchKeywords" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "brands_nameFa_trgm_idx"
  ON "brands" USING GIN ("nameFa" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "brands_nameEn_trgm_idx"
  ON "brands" USING GIN ("nameEn" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "categories_nameFa_trgm_idx"
  ON "categories" USING GIN ("nameFa" gin_trgm_ops);

-- Variant SKUs are searched (e.g. staff/partial queries pasting a SKU) in
-- addition to their exact-match unique btree index.
CREATE INDEX IF NOT EXISTS "product_variants_sku_trgm_idx"
  ON "product_variants" USING GIN ("sku" gin_trgm_ops);

-- ── B-tree indexes the filter/sort matrix needs that the base schema lacks ─

-- sort=popular (view count) and sort=rating within the visible-product scope.
CREATE INDEX IF NOT EXISTS "products_status_viewCount_idx"
  ON "products" ("status", "viewCount");

CREATE INDEX IF NOT EXISTS "products_status_ratingAvg_idx"
  ON "products" ("status", "ratingAvg");

-- publishAt / expiresAt are checked on every visible-product query
-- (visibleProductWhere()) — index them so the planner can range-scan instead
-- of scanning every ACTIVE row.
CREATE INDEX IF NOT EXISTS "products_publishAt_idx"
  ON "products" ("publishAt");

CREATE INDEX IF NOT EXISTS "products_expiresAt_idx"
  ON "products" ("expiresAt");

-- price-asc / price-desc sort and priceMin/priceMax filtering read the
-- variant's effective list price; regionId/currencyCode/platformId are also
-- facet/filter dimensions on the variant.
CREATE INDEX IF NOT EXISTS "product_variants_active_basePrice_idx"
  ON "product_variants" ("isActive", "basePriceToman");

CREATE INDEX IF NOT EXISTS "product_variants_currencyCode_idx"
  ON "product_variants" ("currencyCode");

CREATE INDEX IF NOT EXISTS "product_variants_platformId_idx"
  ON "product_variants" ("platformId");

-- availability facet/filter ("in stock only") counts AVAILABLE inventory
-- per variant; codeCipher itself is never selected by catalog queries.
CREATE INDEX IF NOT EXISTS "inventory_items_variant_available_idx"
  ON "inventory_items" ("variantId")
  WHERE "status" = 'AVAILABLE';

-- co-purchase recommendations join order_items back to product_variants by
-- variant and walk sibling order items within the same order.
CREATE INDEX IF NOT EXISTS "order_items_variantId_idx"
  ON "order_items" ("variantId");

-- Note: search_query_logs already has @@index([normalized, createdAt]) in
-- the base schema, which covers popularSearches()/zeroResultSuggestions() —
-- no additional index needed here.
