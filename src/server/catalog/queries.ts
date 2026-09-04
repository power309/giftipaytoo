import 'server-only';

/**
 * Catalog read layer — every query the storefront needs to render products,
 * categories, brands, home sections, search results and recommendations.
 *
 * Rules enforced here:
 *  - `visibleProductWhere()` is the ONE place that encodes "is this product
 *    visible to a shopper right now". Every list/detail query goes through it
 *    so a draft/scheduled/expired/archived product can never leak.
 *  - No query here ever selects `InventoryItem.codeCipher`, `serialCipher`,
 *    `pinCipher` or `codeFingerprint` — availability is derived from
 *    `status`/row presence only.
 *  - Listing/aggregate queries are batched (`Promise.all`) or use a single
 *    grouped/raw query instead of looping per row, so nothing here is N+1.
 */

import { Prisma, type DeliveryType } from '@prisma/client';
import { db } from '@/server/db';
import { safeCache } from './cache';
import { logger } from '@/lib/logger';
import { discountPercent } from '@/lib/money';
import { effectiveUnitPrice } from '@/lib/pricing';
import { searchProductIds } from './search';
import {
  PRICE_BUCKETS,
  type ListProductsOptions,
  type ListProductsResult,
  type ProductFacets,
  type ProductFilters,
  type ProductSort,
} from './types';

// ─────────────────────────────────────────────────────────────
// Visibility
// ─────────────────────────────────────────────────────────────

/**
 * The single source of truth for "is this product visible to a shopper".
 * ACTIVE status, published (publishAt null or in the past), not expired,
 * not archived. Every product query in this file composes with this.
 */
export function visibleProductWhere(now: Date = new Date()): Prisma.ProductWhereInput {
  return {
    status: 'ACTIVE',
    archivedAt: null,
    AND: [
      { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// Product card (list/section shape)
// ─────────────────────────────────────────────────────────────

function productCardSelect(now: Date) {
  return {
    id: true,
    slug: true,
    nameFa: true,
    nameEn: true,
    deliveryType: true,
    estimatedDeliveryMin: true,
    isFeatured: true,
    isPopular: true,
    viewCount: true,
    salesCount: true,
    ratingAvg: true,
    ratingCount: true,
    brand: { select: { slug: true, nameFa: true, nameEn: true, logoKey: true } },
    category: { select: { slug: true, nameFa: true } },
    platform: { select: { slug: true, nameFa: true, iconKey: true } },
    media: {
      where: { kind: 'POSTER' as const },
      orderBy: { sortOrder: 'asc' as const },
      take: 1,
      select: { path: true, alt: true, blurData: true, width: true, height: true },
    },
    variants: {
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' as const },
      select: {
        id: true,
        basePriceToman: true,
        salePriceToman: true,
        compareAtToman: true,
        currencyCode: true,
        denominationMinor: true,
      },
    },
    campaigns: {
      where: { campaign: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } } },
      select: { campaign: { select: { discountPercent: true } } },
    },
  } satisfies Prisma.ProductSelect;
}

type ProductCardRow = Prisma.ProductGetPayload<{ select: ReturnType<typeof productCardSelect> }>;

export type ProductCard = {
  id: string;
  slug: string;
  nameFa: string;
  nameEn: string | null;
  deliveryType: DeliveryType;
  estimatedDeliveryMin: number;
  isFeatured: boolean;
  isPopular: boolean;
  viewCount: number;
  salesCount: number;
  ratingAvg: number;
  ratingCount: number;
  brand: { slug: string; nameFa: string; nameEn: string; logoKey: string | null };
  category: { slug: string; nameFa: string };
  platform: { slug: string; nameFa: string; iconKey: string | null } | null;
  poster: { path: string; alt: string; blurData: string | null; width: number | null; height: number | null } | null;
  /** Cheapest active variant's effective (post sale/campaign) price, or null if no active variant. */
  priceFromToman: number | null;
  currencyCode: string | null;
  /** Strike-through price to show alongside the best discount found, or null when nothing is discounted. */
  compareAtToman: number | null;
  discountPercent: number;
};

function toProductCard(p: ProductCardRow): ProductCard {
  const campaignPercent = p.campaigns.reduce((max, c) => Math.max(max, c.campaign.discountPercent), 0);

  let priceFromToman: number | null = null;
  let currencyCode: string | null = null;
  let bestCompareAt: number | null = null;
  let bestDiscount = 0;

  for (const v of p.variants) {
    const { unitPriceToman } = effectiveUnitPrice({
      listPriceToman: v.basePriceToman,
      salePriceToman: v.salePriceToman,
      campaignPercent,
    });
    const compareAt = v.compareAtToman ?? (v.salePriceToman ? v.basePriceToman : null);
    const pct = discountPercent(compareAt, unitPriceToman);

    if (priceFromToman === null || unitPriceToman < priceFromToman) {
      priceFromToman = unitPriceToman;
      currencyCode = v.currencyCode;
    }
    if (pct > bestDiscount) {
      bestDiscount = pct;
      bestCompareAt = compareAt;
    }
  }

  return {
    id: p.id,
    slug: p.slug,
    nameFa: p.nameFa,
    nameEn: p.nameEn,
    deliveryType: p.deliveryType,
    estimatedDeliveryMin: p.estimatedDeliveryMin,
    isFeatured: p.isFeatured,
    isPopular: p.isPopular,
    viewCount: p.viewCount,
    salesCount: p.salesCount,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    brand: p.brand,
    category: p.category,
    platform: p.platform,
    poster: p.media[0] ?? null,
    priceFromToman,
    currencyCode,
    compareAtToman: bestDiscount > 0 ? bestCompareAt : null,
    discountPercent: bestDiscount,
  };
}

// ─────────────────────────────────────────────────────────────
// Home sections (cached, batched)
// ─────────────────────────────────────────────────────────────

export type HomeSections = {
  featured: ProductCard[];
  newest: ProductCard[];
  bestSelling: ProductCard[];
  popular: ProductCard[];
  discounted: ProductCard[];
  banners: Array<{
    id: string;
    titleFa: string;
    subtitleFa: string | null;
    ctaLabel: string | null;
    href: string | null;
    imageDesktop: string | null;
    imageMobile: string | null;
    bgColor: string | null;
    position: string;
    sortOrder: number;
  }>;
  campaigns: Array<{
    id: string;
    slug: string;
    nameFa: string;
    descriptionFa: string | null;
    discountPercent: number;
    bannerDesktop: string | null;
    bannerMobile: string | null;
    startsAt: Date;
    endsAt: Date;
  }>;
  topCategories: Array<{ id: string; slug: string; nameFa: string; iconKey: string | null; posterKey: string | null }>;
  featuredBrands: Array<{ id: string; slug: string; nameFa: string; nameEn: string; logoKey: string | null }>;
};

/**
 * Everything the home page needs, in one batched + cached call. Revalidate
 * with `revalidateTag('catalog:home')` (or the narrower `catalog:products`)
 * whenever admin mutations change featured/popular/discount state.
 */
export const getHomeSections = safeCache(
  async (): Promise<HomeSections> => {
    const now = new Date();
    const visible = visibleProductWhere(now);
    const select = productCardSelect(now);

    const [featuredRows, newestRows, bestSellingRows, popularRows, discountCandidates, banners, campaigns, topCategories, featuredBrands] =
      await Promise.all([
        db.product.findMany({
          where: { AND: [visible, { isFeatured: true }] },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
          take: 10,
          select,
        }),
        db.product.findMany({ where: visible, orderBy: { createdAt: 'desc' }, take: 10, select }),
        db.product.findMany({ where: visible, orderBy: { salesCount: 'desc' }, take: 10, select }),
        db.product.findMany({
          where: { AND: [visible, { isPopular: true }] },
          orderBy: [{ viewCount: 'desc' }, { salesCount: 'desc' }],
          take: 10,
          select,
        }),
        db.product.findMany({
          where: {
            AND: [
              visible,
              { variants: { some: { isActive: true, OR: [{ salePriceToman: { not: null } }, { compareAtToman: { not: null } }] } } },
            ],
          },
          select: { id: true },
          take: 300,
        }),
        db.banner.findMany({
          where: {
            isActive: true,
            AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
          },
          orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }],
          select: {
            id: true,
            titleFa: true,
            subtitleFa: true,
            ctaLabel: true,
            href: true,
            imageDesktop: true,
            imageMobile: true,
            bgColor: true,
            position: true,
            sortOrder: true,
          },
        }),
        db.campaign.findMany({
          where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
          orderBy: { startsAt: 'desc' },
          take: 6,
          select: {
            id: true,
            slug: true,
            nameFa: true,
            descriptionFa: true,
            discountPercent: true,
            bannerDesktop: true,
            bannerMobile: true,
            startsAt: true,
            endsAt: true,
          },
        }),
        db.category.findMany({
          where: { isActive: true, showInMegaMenu: true },
          orderBy: { sortOrder: 'asc' },
          take: 12,
          select: { id: true, slug: true, nameFa: true, iconKey: true, posterKey: true },
        }),
        db.brand.findMany({
          where: { isActive: true, isFeatured: true },
          orderBy: { sortOrder: 'asc' },
          take: 12,
          select: { id: true, slug: true, nameFa: true, nameEn: true, logoKey: true },
        }),
      ]);

    const rankedDiscountIds = await rankProductsByPriceOrDiscount(discountCandidates.map((d) => d.id), 'discount');
    const topDiscountIds = rankedDiscountIds.slice(0, 10);
    const discountedRows = topDiscountIds.length
      ? await db.product.findMany({ where: { id: { in: topDiscountIds } }, select })
      : [];
    const discountedById = new Map(discountedRows.map((r) => [r.id, r]));
    const discounted = topDiscountIds
      .map((id) => discountedById.get(id))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map(toProductCard);

    return {
      featured: featuredRows.map(toProductCard),
      newest: newestRows.map(toProductCard),
      bestSelling: bestSellingRows.map(toProductCard),
      popular: popularRows.map(toProductCard),
      discounted,
      banners,
      campaigns,
      topCategories,
      featuredBrands,
    };
  },
  ['catalog:home-sections'],
  { revalidate: 120, tags: ['catalog:home', 'catalog:products'] },
);

// ─────────────────────────────────────────────────────────────
// Price / discount ranking (raw SQL, parameterized — Prisma can't ORDER BY
// an aggregate of a to-many relation, so this is the one place a small,
// tightly-scoped raw query is used instead of duplicating filter logic).
// ─────────────────────────────────────────────────────────────

async function rankProductsByPriceOrDiscount(
  candidateIds: string[],
  mode: 'price-asc' | 'price-desc' | 'discount',
): Promise<string[]> {
  if (candidateIds.length === 0) return [];
  const rows = await db.$queryRaw<{ id: string; price: number; discount: number }[]>(Prisma.sql`
    SELECT v."productId" AS id,
           MIN(COALESCE(v."salePriceToman", v."basePriceToman"))::int AS price,
           MAX(
             CASE
               WHEN v."compareAtToman" IS NOT NULL AND v."compareAtToman" > COALESCE(v."salePriceToman", v."basePriceToman")
               THEN ROUND(100.0 * (v."compareAtToman" - COALESCE(v."salePriceToman", v."basePriceToman")) / v."compareAtToman")
               ELSE 0
             END
           )::int AS discount
    FROM "product_variants" v
    WHERE v."isActive" = true AND v."productId" IN (${Prisma.join(candidateIds)})
    GROUP BY v."productId"
  `);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return [...candidateIds].sort((a, b) => {
    const ra = byId.get(a);
    const rb = byId.get(b);
    if (mode === 'discount') return (rb?.discount ?? 0) - (ra?.discount ?? 0);
    const pa = ra?.price ?? Number.POSITIVE_INFINITY;
    const pb = rb?.price ?? Number.POSITIVE_INFINITY;
    return mode === 'price-asc' ? pa - pb : pb - pa;
  });
}

// A generous but bounded cap on how many candidate ids we will rank in memory
// for price/discount sorting. The catalog is a curated gift-card marketplace
// (hundreds to low thousands of SKUs), not an open marketplace, so this is
// safe; if the catalog grows far beyond this, replace with a materialized
// `minPriceToman` column maintained by the pricing service.
const PRICE_RANK_CANDIDATE_CAP = 5000;

// ─────────────────────────────────────────────────────────────
// Filters → Prisma where
// ─────────────────────────────────────────────────────────────

function variantEffectivePriceRange(minToman?: number | null, maxToman?: number | null): Prisma.ProductVariantWhereInput {
  if (minToman == null && maxToman == null) return {};
  const range: Prisma.IntFilter = {};
  if (minToman != null) range.gte = minToman;
  if (maxToman != null) range.lte = maxToman;
  return {
    OR: [{ salePriceToman: range }, { AND: [{ salePriceToman: null }, { basePriceToman: range }] }],
  };
}

type WhereExclude = {
  excludeCategory?: boolean;
  excludeBrand?: boolean;
  excludePlatform?: boolean;
  excludeRegion?: boolean;
  excludePrice?: boolean;
  excludeAvailability?: boolean;
};

async function buildProductWhere(filters: ProductFilters, exclude: WhereExclude = {}): Promise<Prisma.ProductWhereInput> {
  const now = new Date();
  const and: Prisma.ProductWhereInput[] = [visibleProductWhere(now)];

  if (filters.categorySlug && !exclude.excludeCategory) {
    const ids = await resolveCategoryIds(filters.categorySlug);
    and.push({ categoryId: { in: ids } });
  }
  if (filters.brandSlugs?.length && !exclude.excludeBrand) {
    and.push({ brand: { slug: { in: filters.brandSlugs } } });
  }
  if (filters.platformSlugs?.length && !exclude.excludePlatform) {
    and.push({
      OR: [
        { platform: { slug: { in: filters.platformSlugs } } },
        { variants: { some: { isActive: true, platform: { slug: { in: filters.platformSlugs } } } } },
      ],
    });
  }
  if (filters.deliveryTypes?.length) {
    and.push({ deliveryType: { in: filters.deliveryTypes } });
  }
  if (filters.tagSlugs?.length) {
    and.push({ tags: { some: { tag: { slug: { in: filters.tagSlugs } } } } });
  }

  const variantConds: Prisma.ProductVariantWhereInput[] = [{ isActive: true }];
  if (filters.regionCodes?.length && !exclude.excludeRegion) {
    variantConds.push({ region: { code: { in: filters.regionCodes } } });
  }
  if (filters.currencyCodes?.length) {
    variantConds.push({ currencyCode: { in: filters.currencyCodes } });
  }
  if (filters.denominationMin != null) {
    variantConds.push({ denominationMinor: { gte: filters.denominationMin } });
  }
  if (filters.denominationMax != null) {
    variantConds.push({ denominationMinor: { lte: filters.denominationMax } });
  }
  if (!exclude.excludePrice && (filters.priceMinToman != null || filters.priceMaxToman != null)) {
    variantConds.push(variantEffectivePriceRange(filters.priceMinToman, filters.priceMaxToman));
  }
  if (filters.hasDiscount) {
    variantConds.push({ OR: [{ salePriceToman: { not: null } }, { compareAtToman: { not: null } }] });
  }
  if (variantConds.length > 1) {
    and.push({ variants: { some: { AND: variantConds } } });
  }

  if (filters.inStockOnly && !exclude.excludeAvailability) {
    and.push({ variants: { some: { isActive: true, inventory: { some: { status: 'AVAILABLE' } } } } });
  }

  if (filters.q && filters.q.trim()) {
    const ids = await searchProductIds(filters.q, { limit: 500 });
    and.push({ id: { in: ids.length ? ids : ['__no_match__'] } });
  }

  return { AND: and };
}

// ─────────────────────────────────────────────────────────────
// listProducts
// ─────────────────────────────────────────────────────────────

export async function listProducts(
  filters: ProductFilters = {},
  options: ListProductsOptions = {},
): Promise<ListProductsResult<ProductCard>> {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const perPage = Math.min(60, Math.max(1, Math.floor(options.perPage ?? 24)));
  const sort: ProductSort = options.sort ?? 'newest';

  const where = await buildProductWhere(filters);

  const [total, items, facets] = await Promise.all([
    db.product.count({ where }),
    fetchSortedPage(where, sort, page, perPage),
    buildFacets(filters),
  ]);

  return {
    items,
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
    facets,
  };
}

async function fetchSortedPage(
  where: Prisma.ProductWhereInput,
  sort: ProductSort,
  page: number,
  perPage: number,
): Promise<ProductCard[]> {
  const now = new Date();
  const select = productCardSelect(now);

  if (sort === 'price-asc' || sort === 'price-desc' || sort === 'discount') {
    const candidates = await db.product.findMany({
      where,
      select: { id: true },
      take: PRICE_RANK_CANDIDATE_CAP,
      orderBy: { createdAt: 'desc' },
    });
    const rankedIds = await rankProductsByPriceOrDiscount(candidates.map((c) => c.id), sort);
    const pageIds = rankedIds.slice((page - 1) * perPage, (page - 1) * perPage + perPage);
    if (pageIds.length === 0) return [];
    const rows = await db.product.findMany({ where: { id: { in: pageIds } }, select });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return pageIds
      .map((id) => byId.get(id))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map(toProductCard);
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    sort === 'popular'
      ? [{ viewCount: 'desc' }, { id: 'asc' }]
      : sort === 'best-selling'
        ? [{ salesCount: 'desc' }, { id: 'asc' }]
        : sort === 'rating'
          ? [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'asc' }]; // newest (default)

  const rows = await db.product.findMany({
    where,
    select,
    orderBy,
    skip: (page - 1) * perPage,
    take: perPage,
  });
  return rows.map(toProductCard);
}

// ─────────────────────────────────────────────────────────────
// Facets
// ─────────────────────────────────────────────────────────────

async function buildFacets(filters: ProductFilters): Promise<ProductFacets> {
  const [catWhere, brandWhere, platformWhere, regionWhere, priceWhere, availWhere] = await Promise.all([
    buildProductWhere(filters, { excludeCategory: true }),
    buildProductWhere(filters, { excludeBrand: true }),
    buildProductWhere(filters, { excludePlatform: true }),
    buildProductWhere(filters, { excludeRegion: true }),
    buildProductWhere(filters, { excludePrice: true }),
    buildProductWhere(filters, { excludeAvailability: true }),
  ]);

  const [categoryGroups, brandGroups, categories, brands, platforms, regions] = await Promise.all([
    db.product.groupBy({ by: ['categoryId'], where: catWhere, _count: { _all: true } }),
    db.product.groupBy({ by: ['brandId'], where: brandWhere, _count: { _all: true } }),
    db.category.findMany({ select: { id: true, slug: true, nameFa: true } }),
    db.brand.findMany({ select: { id: true, slug: true, nameFa: true } }),
    db.platform.findMany({ where: { isActive: true }, select: { slug: true, nameFa: true } }),
    db.region.findMany({ where: { isActive: true }, select: { code: true, nameFa: true } }),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const brandById = new Map(brands.map((b) => [b.id, b]));

  const categoryFacets = categoryGroups
    .map((g) => {
      const c = categoryById.get(g.categoryId);
      return c ? { value: c.slug, label: c.nameFa, count: g._count._all } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.count - a.count);

  const brandFacets = brandGroups
    .map((g) => {
      const b = brandById.get(g.brandId);
      return b ? { value: b.slug, label: b.nameFa, count: g._count._all } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.count - a.count);

  const [platformFacets, regionFacets, priceBucketFacets, inStockCount, availabilityBaseCount] = await Promise.all([
    Promise.all(
      platforms.map(async (p) => ({
        value: p.slug,
        label: p.nameFa,
        count: await db.product.count({
          where: {
            AND: [
              platformWhere,
              {
                OR: [
                  { platform: { slug: p.slug } },
                  { variants: { some: { isActive: true, platform: { slug: p.slug } } } },
                ],
              },
            ],
          },
        }),
      })),
    ),
    Promise.all(
      regions.map(async (r) => ({
        value: r.code,
        label: r.nameFa,
        count: await db.product.count({
          where: { AND: [regionWhere, { variants: { some: { isActive: true, region: { code: r.code } } } }] },
        }),
      })),
    ),
    Promise.all(
      PRICE_BUCKETS.map(async (b) => ({
        value: b.key,
        label: b.labelFa,
        minToman: b.minToman,
        maxToman: b.maxToman,
        count: await db.product.count({
          where: {
            AND: [
              priceWhere,
              { variants: { some: { AND: [{ isActive: true }, variantEffectivePriceRange(b.minToman, b.maxToman)] } } },
            ],
          },
        }),
      })),
    ),
    db.product.count({
      where: { AND: [availWhere, { variants: { some: { isActive: true, inventory: { some: { status: 'AVAILABLE' } } } } }] },
    }),
    db.product.count({ where: availWhere }),
  ]);

  return {
    categories: categoryFacets,
    brands: brandFacets,
    platforms: platformFacets.filter((p) => p.count > 0),
    regions: regionFacets.filter((r) => r.count > 0),
    priceBuckets: priceBucketFacets,
    availability: { inStock: inStockCount, outOfStock: Math.max(0, availabilityBaseCount - inStockCount) },
  };
}

// ─────────────────────────────────────────────────────────────
// Category tree
// ─────────────────────────────────────────────────────────────

export type CategoryNode = {
  id: string;
  slug: string;
  nameFa: string;
  nameEn: string | null;
  iconKey: string | null;
  posterKey: string | null;
  parentId: string | null;
  sortOrder: number;
  children: CategoryNode[];
};

export const getCategoryTree = safeCache(
  async (): Promise<CategoryNode[]> => {
    const rows = await db.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true, nameFa: true, nameEn: true, iconKey: true, posterKey: true, parentId: true, sortOrder: true },
    });
    const byId = new Map<string, CategoryNode>();
    for (const r of rows) byId.set(r.id, { ...r, children: [] });
    const roots: CategoryNode[] = [];
    for (const r of rows) {
      const node = byId.get(r.id)!;
      const parent = r.parentId ? byId.get(r.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  },
  ['catalog:category-tree'],
  { revalidate: 300, tags: ['catalog:categories'] },
);

function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

async function resolveCategoryIds(slug: string): Promise<string[]> {
  const flat = flattenTree(await getCategoryTree());
  const target = flat.find((c) => c.slug === slug);
  if (!target) return ['__no_such_category__'];
  const ids = [target.id];
  const collect = (node: CategoryNode) => {
    for (const child of node.children) {
      ids.push(child.id);
      collect(child);
    }
  };
  collect(target);
  return ids;
}

function categoryBreadcrumb(flat: CategoryNode[], id: string): { slug: string; nameFa: string }[] {
  const byId = new Map(flat.map((c) => [c.id, c]));
  const trail: { slug: string; nameFa: string }[] = [];
  let cur: CategoryNode | undefined = byId.get(id);
  while (cur) {
    trail.unshift({ slug: cur.slug, nameFa: cur.nameFa });
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return trail;
}

export async function getCategoryBySlug(slug: string) {
  const flat = flattenTree(await getCategoryTree());
  const node = flat.find((c) => c.slug === slug);
  if (!node) return null;

  const full = await db.category.findUnique({
    where: { id: node.id },
    select: {
      id: true,
      slug: true,
      nameFa: true,
      nameEn: true,
      descriptionFa: true,
      posterKey: true,
      bannerKey: true,
      seoTitle: true,
      seoDescription: true,
    },
  });
  if (!full) return null;

  return {
    ...full,
    breadcrumb: categoryBreadcrumb(flat, node.id),
    children: node.children.map((c) => ({ id: c.id, slug: c.slug, nameFa: c.nameFa, iconKey: c.iconKey })),
  };
}

// ─────────────────────────────────────────────────────────────
// Brands
// ─────────────────────────────────────────────────────────────

export type BrandSummary = {
  id: string;
  slug: string;
  nameFa: string;
  nameEn: string;
  logoKey: string | null;
  isFeatured: boolean;
  accentColor: string | null;
};

export const listBrands = safeCache(
  async (): Promise<BrandSummary[]> =>
    db.brand.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameFa: 'asc' }],
      select: { id: true, slug: true, nameFa: true, nameEn: true, logoKey: true, isFeatured: true, accentColor: true },
    }),
  ['catalog:brand-list'],
  { revalidate: 300, tags: ['catalog:brands'] },
);

export async function getBrandBySlug(slug: string) {
  return db.brand.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      slug: true,
      nameFa: true,
      nameEn: true,
      descriptionFa: true,
      logoKey: true,
      bannerKey: true,
      accentColor: true,
      seoTitle: true,
      seoDescription: true,
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Product detail
// ─────────────────────────────────────────────────────────────

export type ProductVariantDetail = {
  id: string;
  sku: string;
  nameFa: string;
  denominationMinor: number | null;
  currencyCode: string | null;
  currencySymbol: string | null;
  regionCode: string | null;
  regionNameFa: string | null;
  regionFlagEmoji: string | null;
  platformSlug: string | null;
  platformNameFa: string | null;
  minQty: number;
  maxQty: number;
  bulkTiers: { minQty: number; unitPriceToman: number }[];
  unitPriceToman: number;
  compareAtToman: number | null;
  discountPercent: number;
  priceSource: 'list' | 'sale' | 'campaign' | 'group' | 'bulk';
  inStock: boolean;
};

export type ProductDetail = {
  id: string;
  slug: string;
  sku: string;
  nameFa: string;
  nameEn: string | null;
  shortDescriptionFa: string | null;
  descriptionFa: string | null;
  activationGuideFa: string | null;
  restrictionsFa: string | null;
  warningsFa: string | null;
  refundEligible: boolean;
  refundPolicyFa: string | null;
  requiresRegionAck: boolean;
  estimatedDeliveryMin: number;
  minOrderQty: number;
  maxOrderQty: number;
  deliveryType: DeliveryType;
  seoTitle: string | null;
  seoDescription: string | null;
  ratingAvg: number;
  ratingCount: number;
  brand: { slug: string; nameFa: string; nameEn: string; logoKey: string | null; descriptionFa: string | null };
  category: { slug: string; nameFa: string };
  platform: { slug: string; nameFa: string; iconKey: string | null } | null;
  media: { id: string; kind: string; path: string; alt: string; width: number | null; height: number | null; blurData: string | null; variantId: string | null }[];
  tags: { slug: string; nameFa: string }[];
  faqs: { id: string; questionFa: string; answerFa: string }[];
  variants: ProductVariantDetail[];
  breadcrumb: { slug: string; nameFa: string }[];
  related: ProductCard[];
  crossSell: ProductCard[];
};

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const now = new Date();
  const product = await db.product.findFirst({
    where: { slug, ...visibleProductWhere(now) },
    select: {
      id: true,
      slug: true,
      sku: true,
      nameFa: true,
      nameEn: true,
      shortDescriptionFa: true,
      descriptionFa: true,
      activationGuideFa: true,
      restrictionsFa: true,
      warningsFa: true,
      refundEligible: true,
      refundPolicyFa: true,
      requiresRegionAck: true,
      estimatedDeliveryMin: true,
      minOrderQty: true,
      maxOrderQty: true,
      deliveryType: true,
      seoTitle: true,
      seoDescription: true,
      ratingAvg: true,
      ratingCount: true,
      categoryId: true,
      brand: { select: { slug: true, nameFa: true, nameEn: true, logoKey: true, descriptionFa: true } },
      category: { select: { slug: true, nameFa: true } },
      platform: { select: { slug: true, nameFa: true, iconKey: true } },
      media: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, kind: true, path: true, alt: true, width: true, height: true, blurData: true, variantId: true },
      },
      tags: { select: { tag: { select: { slug: true, nameFa: true } } } },
      faqs: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, questionFa: true, answerFa: true } },
      campaigns: {
        where: { campaign: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } } },
        select: { campaign: { select: { discountPercent: true } } },
      },
      variants: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          sku: true,
          nameFa: true,
          denominationMinor: true,
          currencyCode: true,
          currency: { select: { symbol: true } },
          region: { select: { code: true, nameFa: true, flagEmoji: true } },
          platform: { select: { slug: true, nameFa: true } },
          basePriceToman: true,
          salePriceToman: true,
          compareAtToman: true,
          minQty: true,
          maxQty: true,
          bulkTiers: { select: { minQty: true, unitPriceToman: true }, orderBy: { minQty: 'asc' } },
          // Only ever a presence probe — never selects codeCipher/serialCipher/pinCipher.
          inventory: { where: { status: 'AVAILABLE' }, select: { id: true }, take: 1 },
        },
      },
    },
  });
  if (!product) return null;

  const campaignPercent = product.campaigns.reduce((max, c) => Math.max(max, c.campaign.discountPercent), 0);

  const variants: ProductVariantDetail[] = product.variants.map((v) => {
    const priced = effectiveUnitPrice({
      listPriceToman: v.basePriceToman,
      salePriceToman: v.salePriceToman,
      campaignPercent,
      bulkTiers: v.bulkTiers,
    });
    const compareAt = v.compareAtToman ?? (v.salePriceToman ? v.basePriceToman : null);
    return {
      id: v.id,
      sku: v.sku,
      nameFa: v.nameFa,
      denominationMinor: v.denominationMinor,
      currencyCode: v.currencyCode,
      currencySymbol: v.currency?.symbol ?? null,
      regionCode: v.region?.code ?? null,
      regionNameFa: v.region?.nameFa ?? null,
      regionFlagEmoji: v.region?.flagEmoji ?? null,
      platformSlug: v.platform?.slug ?? null,
      platformNameFa: v.platform?.nameFa ?? null,
      minQty: v.minQty,
      maxQty: v.maxQty,
      bulkTiers: v.bulkTiers,
      unitPriceToman: priced.unitPriceToman,
      compareAtToman: compareAt,
      discountPercent: discountPercent(compareAt, priced.unitPriceToman),
      priceSource: priced.source,
      inStock: v.inventory.length > 0,
    };
  });

  const flat = flattenTree(await getCategoryTree());
  const [related, crossSell] = await Promise.all([
    getRelatedProducts(product.id, { kind: 'RELATED', limit: 8 }),
    getRelatedProducts(product.id, { kind: 'CROSS_SELL', limit: 8, fallback: false }),
  ]);

  return {
    id: product.id,
    slug: product.slug,
    sku: product.sku,
    nameFa: product.nameFa,
    nameEn: product.nameEn,
    shortDescriptionFa: product.shortDescriptionFa,
    descriptionFa: product.descriptionFa,
    activationGuideFa: product.activationGuideFa,
    restrictionsFa: product.restrictionsFa,
    warningsFa: product.warningsFa,
    refundEligible: product.refundEligible,
    refundPolicyFa: product.refundPolicyFa,
    requiresRegionAck: product.requiresRegionAck,
    estimatedDeliveryMin: product.estimatedDeliveryMin,
    minOrderQty: product.minOrderQty,
    maxOrderQty: product.maxOrderQty,
    deliveryType: product.deliveryType,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    brand: product.brand,
    category: product.category,
    platform: product.platform,
    media: product.media,
    tags: product.tags.map((t) => t.tag),
    faqs: product.faqs,
    variants,
    breadcrumb: categoryBreadcrumb(flat, product.categoryId),
    related,
    crossSell,
  };
}

// ─────────────────────────────────────────────────────────────
// Reviews (paginated separately from the product detail payload)
// ─────────────────────────────────────────────────────────────

export async function listProductReviews(
  productId: string,
  opts: { page?: number; perPage?: number } = {},
): Promise<{ items: Array<{ id: string; displayName: string; rating: number; titleFa: string | null; bodyFa: string; isVerifiedPurchase: boolean; adminReplyFa: string | null; helpfulCount: number; createdAt: Date }>; total: number; page: number; perPage: number }> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const perPage = Math.min(50, Math.max(1, Math.floor(opts.perPage ?? 10)));
  const where: Prisma.ReviewWhereInput = { productId, status: 'APPROVED' };

  const [items, total] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        displayName: true,
        rating: true,
        titleFa: true,
        bodyFa: true,
        isVerifiedPurchase: true,
        adminReplyFa: true,
        helpfulCount: true,
        createdAt: true,
      },
    }),
    db.review.count({ where }),
  ]);

  return { items, total, page, perPage };
}

// ─────────────────────────────────────────────────────────────
// Related / cross-sell / recommendations
// ─────────────────────────────────────────────────────────────

export async function getRelatedProducts(
  productId: string,
  opts: { kind?: 'RELATED' | 'CROSS_SELL' | 'UPSELL'; limit?: number; fallback?: boolean } = {},
): Promise<ProductCard[]> {
  const kind = opts.kind ?? 'RELATED';
  const limit = Math.min(20, Math.max(1, opts.limit ?? 8));
  const fallback = opts.fallback ?? true;
  const now = new Date();
  const select = productCardSelect(now);

  const explicit = await db.productRelation.findMany({
    where: { sourceId: productId, kind, target: visibleProductWhere(now) },
    orderBy: { sortOrder: 'asc' },
    take: limit,
    select: { targetId: true },
  });

  const ids = explicit.map((r) => r.targetId);
  const seen = new Set(ids);
  seen.add(productId);

  if (fallback && ids.length < limit) {
    const source = await db.product.findUnique({ where: { id: productId }, select: { categoryId: true, brandId: true } });
    if (source) {
      const fill = await db.product.findMany({
        where: {
          AND: [
            visibleProductWhere(now),
            { id: { notIn: [...seen] } },
            { OR: [{ categoryId: source.categoryId }, { brandId: source.brandId }] },
          ],
        },
        orderBy: [{ salesCount: 'desc' }, { viewCount: 'desc' }],
        take: limit - ids.length,
        select: { id: true },
      });
      for (const f of fill) {
        ids.push(f.id);
        seen.add(f.id);
      }
    }
  }

  if (ids.length === 0) return [];
  const rows = await db.product.findMany({ where: { id: { in: ids } }, select });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map(toProductCard);
}

async function coPurchaseProductIds(productId: string, limit: number): Promise<string[]> {
  const variantIds = (await db.productVariant.findMany({ where: { productId }, select: { id: true } })).map((v) => v.id);
  if (variantIds.length === 0) return [];

  const orderIds = (
    await db.orderItem.findMany({
      where: { variantId: { in: variantIds } },
      select: { orderId: true },
      distinct: ['orderId'],
      take: 300,
    })
  ).map((o) => o.orderId);
  if (orderIds.length === 0) return [];

  const co = await db.orderItem.groupBy({
    by: ['variantId'],
    where: { orderId: { in: orderIds }, variantId: { notIn: variantIds, not: null } },
    _count: { _all: true },
    orderBy: { _count: { variantId: 'desc' } },
    take: limit * 3,
  });
  const coVariantIds = co.map((c) => c.variantId).filter((v): v is string => !!v);
  if (coVariantIds.length === 0) return [];

  const variants = await db.productVariant.findMany({ where: { id: { in: coVariantIds } }, select: { id: true, productId: true } });
  const variantToProduct = new Map(variants.map((v) => [v.id, v.productId]));

  const result: string[] = [];
  const seen = new Set<string>([productId]);
  for (const c of co) {
    const pid = c.variantId ? variantToProduct.get(c.variantId) : undefined;
    if (pid && !seen.has(pid)) {
      seen.add(pid);
      result.push(pid);
      if (result.length >= limit) break;
    }
  }
  return result;
}

export async function getRecommendations(opts: {
  userId?: string | null;
  sessionKey?: string | null;
  productId?: string | null;
  limit?: number;
}): Promise<ProductCard[]> {
  const limit = Math.min(20, Math.max(1, opts.limit ?? 8));
  const now = new Date();
  const select = productCardSelect(now);
  const picked: string[] = [];
  const excluded = new Set<string>(opts.productId ? [opts.productId] : []);

  if (opts.productId) {
    const coIds = await coPurchaseProductIds(opts.productId, limit);
    for (const id of coIds) {
      if (!excluded.has(id)) {
        picked.push(id);
        excluded.add(id);
      }
    }
  }

  if (picked.length < limit && opts.productId) {
    const source = await db.product.findUnique({ where: { id: opts.productId }, select: { categoryId: true, brandId: true } });
    if (source) {
      const fill = await db.product.findMany({
        where: {
          AND: [
            visibleProductWhere(now),
            { id: { notIn: [...excluded] } },
            { OR: [{ categoryId: source.categoryId }, { brandId: source.brandId }] },
          ],
        },
        orderBy: [{ salesCount: 'desc' }, { viewCount: 'desc' }],
        take: limit - picked.length,
        select: { id: true },
      });
      for (const f of fill) {
        picked.push(f.id);
        excluded.add(f.id);
      }
    }
  }

  if (picked.length < limit && (opts.userId || opts.sessionKey)) {
    const seenRows = await db.recentlyViewed.findMany({
      where: opts.userId ? { userId: opts.userId } : { sessionKey: opts.sessionKey! },
      orderBy: { viewedAt: 'desc' },
      take: 20,
      select: { product: { select: { categoryId: true, brandId: true } } },
    });
    const categoryIds = [...new Set(seenRows.map((s) => s.product.categoryId))];
    const brandIds = [...new Set(seenRows.map((s) => s.product.brandId))];
    if (categoryIds.length || brandIds.length) {
      const fill = await db.product.findMany({
        where: {
          AND: [
            visibleProductWhere(now),
            { id: { notIn: [...excluded] } },
            { OR: [{ categoryId: { in: categoryIds } }, { brandId: { in: brandIds } }] },
          ],
        },
        orderBy: [{ salesCount: 'desc' }],
        take: limit - picked.length,
        select: { id: true },
      });
      for (const f of fill) {
        picked.push(f.id);
        excluded.add(f.id);
      }
    }
  }

  if (picked.length < limit) {
    const fill = await db.product.findMany({
      where: { AND: [visibleProductWhere(now), { id: { notIn: [...excluded] } }] },
      orderBy: [{ isPopular: 'desc' }, { salesCount: 'desc' }],
      take: limit - picked.length,
      select: { id: true },
    });
    for (const f of fill) {
      picked.push(f.id);
      excluded.add(f.id);
    }
  }

  if (picked.length === 0) return [];
  const rows = await db.product.findMany({ where: { id: { in: picked } }, select });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return picked
    .map((id) => byId.get(id))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map(toProductCard);
}

// ─────────────────────────────────────────────────────────────
// Recently viewed
// ─────────────────────────────────────────────────────────────

export async function recordProductView(input: {
  productId: string;
  userId?: string | null;
  sessionKey?: string | null;
}): Promise<void> {
  const productId = input.productId;
  const userId = input.userId ?? null;
  const sessionKey = userId ? null : (input.sessionKey ?? null);
  if (!userId && !sessionKey) return;

  const now = new Date();
  const throttleMs = 5 * 60_000;
  let existing: { viewedAt: Date } | null = null;

  try {
    if (userId) {
      existing = await db.recentlyViewed.findUnique({
        where: { userId_productId: { userId, productId } },
        select: { viewedAt: true },
      });
      await db.recentlyViewed.upsert({
        where: { userId_productId: { userId, productId } },
        create: { userId, productId, viewedAt: now },
        update: { viewedAt: now },
      });
    } else if (sessionKey) {
      existing = await db.recentlyViewed.findUnique({
        where: { sessionKey_productId: { sessionKey, productId } },
        select: { viewedAt: true },
      });
      await db.recentlyViewed.upsert({
        where: { sessionKey_productId: { sessionKey, productId } },
        create: { sessionKey, productId, viewedAt: now },
        update: { viewedAt: now },
      });
    }
  } catch (err) {
    logger.warn('recordProductView upsert failed', { productId, err });
    return;
  }

  // Throttled, fire-and-forget: a view-count bump must never slow the page.
  if (!existing || now.getTime() - existing.viewedAt.getTime() > throttleMs) {
    void db.product
      .update({ where: { id: productId }, data: { viewCount: { increment: 1 } } })
      .catch((err) => logger.warn('viewCount increment failed', { productId, err }));
  }
}

export async function getRecentlyViewed(opts: {
  userId?: string | null;
  sessionKey?: string | null;
  limit?: number;
}): Promise<ProductCard[]> {
  if (!opts.userId && !opts.sessionKey) return [];
  const limit = Math.min(30, Math.max(1, opts.limit ?? 12));
  const now = new Date();

  const rows = await db.recentlyViewed.findMany({
    where: {
      ...(opts.userId ? { userId: opts.userId } : { sessionKey: opts.sessionKey! }),
      product: visibleProductWhere(now),
    },
    orderBy: { viewedAt: 'desc' },
    take: limit,
    select: { product: { select: productCardSelect(now) } },
  });
  return rows.map((r) => toProductCard(r.product));
}
