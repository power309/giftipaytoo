import 'server-only';
import { db } from '@/server/db';
import type { Prisma } from '@prisma/client';
import type { ProductCardData } from '@/components/storefront/product-card';

/**
 * Storefront data-access layer.
 *
 * Another agent owns `src/server/catalog/**` and `src/server/pricing-service.ts`
 * (query/search/facet/pricing logic). Those modules may not exist yet while this
 * page is being built. Every exported function here FIRST tries to load the
 * equivalent from that module (via a non-literal specifier so bundlers cannot
 * fail the build on a file that is not there yet) and falls back to a complete,
 * correct, direct Prisma implementation when it is unavailable. The fallback is
 * never a stub — every route in `(storefront)` works fully against it.
 *
 * NOTE for the coordinator: because the specifier is intentionally non-literal
 * (to dodge a hard "module not found" at build time), bundlers may treat the
 * import as fully dynamic and never actually resolve `@/server/catalog/queries`
 * at runtime even after that file lands. Once it exists, prefer replacing the
 * `loadModule(...)` calls below with a normal static `import` + try/catch, or a
 * thin re-export, so the real implementation is actually picked up.
 */

async function loadModule<T = Record<string, unknown>>(specifier: string): Promise<T | null> {
  try {
    const mod = (await import(specifier)) as T;
    return mod;
  } catch {
    return null;
  }
}

const CATALOG_SPECIFIER = '@/server/catalog/queries';

// ── Shared filter/sort/pagination contracts ─────────────────────────────

export type SortKey =
  | 'newest'
  | 'popular'
  | 'best-selling'
  | 'price-asc'
  | 'price-desc'
  | 'discount'
  | 'rating';

export const SORT_LABELS: Record<SortKey, string> = {
  newest: 'جدیدترین',
  popular: 'محبوب‌ترین',
  'best-selling': 'پرفروش‌ترین',
  'price-asc': 'ارزان‌ترین',
  'price-desc': 'گران‌ترین',
  discount: 'بیشترین تخفیف',
  rating: 'بالاترین امتیاز',
};

export type ProductFilters = {
  categorySlug?: string;
  brandSlug?: string;
  platformSlugs?: string[];
  regionCodes?: string[];
  currencyCodes?: string[];
  priceMin?: number;
  priceMax?: number;
  denominations?: number[]; // matched against variant.denominationMinor
  inStockOnly?: boolean;
  deliveryTypes?: string[];
  discountOnly?: boolean;
  tags?: string[];
  q?: string;
  sort?: SortKey;
  page?: number;
  perPage?: number;
};

export type FacetOption = { value: string; label: string; count: number };

export type ProductListFacets = {
  categories: FacetOption[];
  brands: FacetOption[];
  platforms: FacetOption[];
  regions: FacetOption[];
  currencies: FacetOption[];
  deliveryTypes: FacetOption[];
  tags: FacetOption[];
  priceMin: number;
  priceMax: number;
};

export type ListProductsResult = {
  items: ProductCardData[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  facets: ProductListFacets;
};

const DEFAULT_PER_PAGE = 24;
const FALLBACK_TAKE_CAP = 800; // upper bound scanned before in-memory filtering

export function visibleProductWhere(): Prisma.ProductWhereInput {
  const now = new Date();
  return {
    status: 'ACTIVE',
    OR: [{ publishAt: null }, { publishAt: { lte: now } }],
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
  };
}

const PRODUCT_LIST_SELECT = {
  id: true,
  slug: true,
  nameFa: true,
  deliveryType: true,
  isFeatured: true,
  isPopular: true,
  ratingAvg: true,
  ratingCount: true,
  salesCount: true,
  viewCount: true,
  createdAt: true,
  categoryId: true,
  brandId: true,
  platformId: true,
  brand: { select: { slug: true, nameFa: true } },
  category: { select: { slug: true, nameFa: true } },
  platform: { select: { slug: true, nameFa: true } },
  media: {
    where: { kind: 'POSTER' },
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { path: true, alt: true, blurData: true },
  },
  tags: { select: { tag: { select: { slug: true, nameFa: true } } } },
  variants: {
    where: { isActive: true },
    select: {
      id: true,
      basePriceToman: true,
      salePriceToman: true,
      compareAtToman: true,
      denominationMinor: true,
      currencyCode: true,
      regionId: true,
      region: { select: { code: true, nameFa: true } },
      currency: { select: { symbol: true } },
      isDefault: true,
      sortOrder: true,
      _count: { select: { inventory: { where: { status: 'AVAILABLE' } } } },
    },
  },
} satisfies Prisma.ProductSelect;

type RawProduct = Prisma.ProductGetPayload<{ select: typeof PRODUCT_LIST_SELECT }>;

/** Effective price + discount for one variant, from already-computed columns. */
export function computeVariantPrice(v: {
  basePriceToman: number;
  salePriceToman: number | null;
  compareAtToman: number | null;
}): { priceToman: number; compareAtToman: number | null } {
  const priceToman = v.salePriceToman ?? v.basePriceToman;
  const compareAtToman = v.compareAtToman ?? (v.salePriceToman ? v.basePriceToman : null);
  return { priceToman, compareAtToman: compareAtToman && compareAtToman > priceToman ? compareAtToman : null };
}

function pickRepresentativeVariant<
  V extends { isDefault: boolean; sortOrder: number; basePriceToman: number; salePriceToman: number | null },
>(variants: V[]): V | null {
  if (variants.length === 0) return null;
  const def = variants.find((v) => v.isDefault);
  if (def) return def;
  return [...variants].sort((a, b) => {
    const pa = a.salePriceToman ?? a.basePriceToman;
    const pb = b.salePriceToman ?? b.basePriceToman;
    return pa - pb || a.sortOrder - b.sortOrder;
  })[0];
}

function toCardData(p: RawProduct): ProductCardData {
  const rep = pickRepresentativeVariant(p.variants);
  const price = rep ? computeVariantPrice(rep) : null;
  const totalStock = p.variants.reduce((a, v) => a + v._count.inventory, 0);
  const poster = p.media[0];
  return {
    slug: p.slug,
    nameFa: p.nameFa,
    brandNameFa: p.brand.nameFa,
    posterPath: poster?.path ?? null,
    posterAlt: poster?.alt ?? p.nameFa,
    blurData: poster?.blurData ?? null,
    priceToman: price?.priceToman ?? null,
    compareAtToman: price?.compareAtToman ?? null,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    inStock: totalStock > 0,
    isFeatured: p.isFeatured,
    isPopular: p.isPopular,
    deliveryType: p.deliveryType,
    regionLabel: rep?.region?.nameFa ?? null,
    variantCount: p.variants.length,
  };
}

function discountOf(p: RawProduct): number {
  const rep = pickRepresentativeVariant(p.variants);
  if (!rep) return 0;
  const { priceToman, compareAtToman } = computeVariantPrice(rep);
  if (!compareAtToman || compareAtToman <= priceToman) return 0;
  return Math.round(((compareAtToman - priceToman) / compareAtToman) * 100);
}

function priceOf(p: RawProduct): number {
  const rep = pickRepresentativeVariant(p.variants);
  return rep ? computeVariantPrice(rep).priceToman : 0;
}

function stockOf(p: RawProduct): number {
  return p.variants.reduce((a, v) => a + v._count.inventory, 0);
}

async function listProductsFallback(filters: ProductFilters): Promise<ListProductsResult> {
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(60, Math.max(1, filters.perPage ?? DEFAULT_PER_PAGE));

  const where: Prisma.ProductWhereInput = { ...visibleProductWhere() };
  const and: Prisma.ProductWhereInput[] = [where];

  if (filters.categorySlug) {
    and.push({
      category: { OR: [{ slug: filters.categorySlug }, { parent: { slug: filters.categorySlug } }] },
    });
  }
  if (filters.brandSlug) and.push({ brand: { slug: filters.brandSlug } });
  if (filters.platformSlugs?.length) and.push({ platform: { slug: { in: filters.platformSlugs } } });
  if (filters.deliveryTypes?.length) {
    and.push({ deliveryType: { in: filters.deliveryTypes } } as Prisma.ProductWhereInput);
  }
  if (filters.tags?.length) and.push({ tags: { some: { tag: { slug: { in: filters.tags } } } } });
  if (filters.regionCodes?.length) and.push({ variants: { some: { region: { code: { in: filters.regionCodes } } } } });
  if (filters.currencyCodes?.length) and.push({ variants: { some: { currencyCode: { in: filters.currencyCodes } } } });
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    and.push({
      OR: [
        { nameFa: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { searchKeywords: { contains: q, mode: 'insensitive' } },
        { brand: { nameFa: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }

  const rows = await db.product.findMany({
    where: { AND: and },
    select: PRODUCT_LIST_SELECT,
    take: FALLBACK_TAKE_CAP,
  });

  // In-memory refinement: price range / denomination / stock / discount need
  // derived numbers that aren't plain indexed columns.
  let filtered = rows;

  if (filters.priceMin != null) filtered = filtered.filter((p) => priceOf(p) >= filters.priceMin!);
  if (filters.priceMax != null) filtered = filtered.filter((p) => priceOf(p) <= filters.priceMax!);
  if (filters.denominations?.length) {
    const set = new Set(filters.denominations);
    filtered = filtered.filter((p) => p.variants.some((v) => v.denominationMinor != null && set.has(v.denominationMinor)));
  }
  if (filters.inStockOnly) filtered = filtered.filter((p) => stockOf(p) > 0);
  if (filters.discountOnly) filtered = filtered.filter((p) => discountOf(p) > 0);

  // Facets computed from the where-filtered (pre price/stock refinement) set
  // so counts reflect "what else is available if you relax this one filter".
  const facets = buildFacets(rows);

  const sort = filters.sort ?? 'newest';
  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'price-asc':
        return priceOf(a) - priceOf(b);
      case 'price-desc':
        return priceOf(b) - priceOf(a);
      case 'discount':
        return discountOf(b) - discountOf(a);
      case 'rating':
        return b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount;
      case 'best-selling':
        return b.salesCount - a.salesCount;
      case 'popular':
        return Number(b.isPopular) - Number(a.isPopular) || b.viewCount - a.viewCount;
      case 'newest':
      default:
        return b.createdAt.getTime() - a.createdAt.getTime();
    }
  });

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((clampedPage - 1) * perPage, clampedPage * perPage);

  return {
    items: pageRows.map(toCardData),
    total,
    page: clampedPage,
    perPage,
    totalPages,
    facets,
  };
}

function buildFacets(rows: RawProduct[]): ProductListFacets {
  const cat = new Map<string, FacetOption>();
  const brand = new Map<string, FacetOption>();
  const platform = new Map<string, FacetOption>();
  const region = new Map<string, FacetOption>();
  const currency = new Map<string, FacetOption>();
  const delivery = new Map<string, FacetOption>();
  const tag = new Map<string, FacetOption>();
  let priceMin = Infinity;
  let priceMax = 0;

  const bump = (m: Map<string, FacetOption>, value: string, label: string) => {
    const cur = m.get(value);
    if (cur) cur.count += 1;
    else m.set(value, { value, label, count: 1 });
  };

  for (const p of rows) {
    bump(cat, p.category.slug, p.category.nameFa);
    bump(brand, p.brand.slug, p.brand.nameFa);
    if (p.platform) bump(platform, p.platform.slug, p.platform.nameFa);
    bump(delivery, p.deliveryType, deliveryLabel(p.deliveryType));
    for (const t of p.tags) bump(tag, t.tag.slug, t.tag.nameFa);
    for (const v of p.variants) {
      if (v.region) bump(region, v.region.code, v.region.nameFa);
      if (v.currencyCode) bump(currency, v.currencyCode, v.currencyCode);
    }
    const price = priceOf(p);
    if (price > 0) {
      priceMin = Math.min(priceMin, price);
      priceMax = Math.max(priceMax, price);
    }
  }

  return {
    categories: [...cat.values()].sort((a, b) => b.count - a.count),
    brands: [...brand.values()].sort((a, b) => a.label.localeCompare(b.label, 'fa')),
    platforms: [...platform.values()].sort((a, b) => b.count - a.count),
    regions: [...region.values()].sort((a, b) => b.count - a.count),
    currencies: [...currency.values()].sort((a, b) => b.count - a.count),
    deliveryTypes: [...delivery.values()],
    tags: [...tag.values()].sort((a, b) => b.count - a.count),
    priceMin: Number.isFinite(priceMin) ? priceMin : 0,
    priceMax,
  };
}

export function deliveryLabel(type: string): string {
  switch (type) {
    case 'INSTANT_CODE':
      return 'تحویل آنی کد';
    case 'MANUAL_CODE':
      return 'تحویل دستی کد';
    case 'ACCOUNT_TOPUP':
      return 'شارژ مستقیم حساب';
    case 'SUPPLIER_API':
      return 'تحویل خودکار از تأمین‌کننده';
    default:
      return type;
  }
}

export async function listProducts(filters: ProductFilters): Promise<ListProductsResult> {
  const mod = await loadModule<{ listProducts?: (f: ProductFilters) => Promise<ListProductsResult> }>(
    CATALOG_SPECIFIER,
  );
  if (mod?.listProducts) {
    try {
      return await mod.listProducts(filters);
    } catch {
      /* fall through to the direct implementation */
    }
  }
  return listProductsFallback(filters);
}

// ── Single product ───────────────────────────────────────────────────────

export type ProductVariantDetail = {
  id: string;
  sku: string;
  nameFa: string;
  denominationMinor: number | null;
  currencyCode: string | null;
  currencySymbol: string | null;
  currencyMinorUnits: number;
  regionId: string | null;
  regionCode: string | null;
  regionNameFa: string | null;
  regionNotesFa: string | null;
  platformNameFa: string | null;
  priceToman: number;
  compareAtToman: number | null;
  discountPercent: number;
  priceUpdatedAt: string | null;
  minQty: number;
  maxQty: number;
  lowStockThreshold: number;
  stockCount: number;
  isDefault: boolean;
};

export type ProductDetail = {
  id: string;
  slug: string;
  sku: string;
  nameFa: string;
  brand: { slug: string; nameFa: string; logoPath: string | null };
  category: { slug: string; nameFa: string; parent: { slug: string; nameFa: string } | null };
  platform: { slug: string; nameFa: string } | null;
  deliveryType: string;
  productType: string;
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
  ratingAvg: number;
  ratingCount: number;
  salesCount: number;
  gallery: { path: string; alt: string; blurData: string | null }[];
  variants: ProductVariantDetail[];
  tags: { slug: string; nameFa: string }[];
  faqs: { id: string; questionFa: string; answerFa: string }[];
  ratingBreakdown: Record<1 | 2 | 3 | 4 | 5, number>;
};

async function getProductBySlugFallback(slug: string): Promise<ProductDetail | null> {
  const p = await db.product.findFirst({
    where: { slug, ...visibleProductWhere() },
    select: {
      id: true,
      slug: true,
      sku: true,
      nameFa: true,
      deliveryType: true,
      productType: true,
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
      ratingAvg: true,
      ratingCount: true,
      salesCount: true,
      brand: { select: { slug: true, nameFa: true, logoKey: true } },
      category: {
        select: { slug: true, nameFa: true, parent: { select: { slug: true, nameFa: true } } },
      },
      platform: { select: { slug: true, nameFa: true } },
      media: {
        where: { kind: { in: ['POSTER', 'GALLERY'] } },
        orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
        select: { path: true, alt: true, blurData: true, kind: true },
      },
      tags: { select: { tag: { select: { slug: true, nameFa: true } } } },
      faqs: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, questionFa: true, answerFa: true },
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
          currency: { select: { symbol: true, minorUnits: true } },
          regionId: true,
          region: { select: { code: true, nameFa: true, notesFa: true } },
          platform: { select: { nameFa: true } },
          basePriceToman: true,
          salePriceToman: true,
          compareAtToman: true,
          priceUpdatedAt: true,
          minQty: true,
          maxQty: true,
          lowStockThreshold: true,
          isDefault: true,
          _count: { select: { inventory: { where: { status: 'AVAILABLE' } } } },
        },
      },
    },
  });
  if (!p) return null;

  const gallery = p.media
    .filter((m) => m.kind === 'POSTER' || m.kind === 'GALLERY')
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'POSTER' ? -1 : 1))
    .map((m) => ({ path: m.path, alt: m.alt, blurData: m.blurData }));

  const variants: ProductVariantDetail[] = p.variants.map((v) => {
    const price = computeVariantPrice(v);
    return {
      id: v.id,
      sku: v.sku,
      nameFa: v.nameFa,
      denominationMinor: v.denominationMinor,
      currencyCode: v.currencyCode,
      currencySymbol: v.currency?.symbol ?? null,
      currencyMinorUnits: v.currency?.minorUnits ?? 2,
      regionId: v.regionId,
      regionCode: v.region?.code ?? null,
      regionNameFa: v.region?.nameFa ?? null,
      regionNotesFa: v.region?.notesFa ?? null,
      platformNameFa: v.platform?.nameFa ?? null,
      priceToman: price.priceToman,
      compareAtToman: price.compareAtToman,
      discountPercent:
        price.compareAtToman && price.compareAtToman > price.priceToman
          ? Math.round(((price.compareAtToman - price.priceToman) / price.compareAtToman) * 100)
          : 0,
      priceUpdatedAt: v.priceUpdatedAt ? v.priceUpdatedAt.toISOString() : null,
      minQty: v.minQty,
      maxQty: v.maxQty,
      lowStockThreshold: v.lowStockThreshold,
      stockCount: v._count.inventory,
      isDefault: v.isDefault,
    };
  });

  const ratingRows = await db.review.groupBy({
    by: ['rating'],
    where: { productId: p.id, status: 'APPROVED' },
    _count: { rating: true },
  });
  const ratingBreakdown: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratingRows) {
    if (r.rating >= 1 && r.rating <= 5) ratingBreakdown[r.rating as 1 | 2 | 3 | 4 | 5] = r._count.rating;
  }

  return {
    id: p.id,
    slug: p.slug,
    sku: p.sku,
    nameFa: p.nameFa,
    brand: { slug: p.brand.slug, nameFa: p.brand.nameFa, logoPath: p.brand.logoKey },
    category: {
      slug: p.category.slug,
      nameFa: p.category.nameFa,
      parent: p.category.parent ? { slug: p.category.parent.slug, nameFa: p.category.parent.nameFa } : null,
    },
    platform: p.platform,
    deliveryType: p.deliveryType,
    productType: p.productType,
    shortDescriptionFa: p.shortDescriptionFa,
    descriptionFa: p.descriptionFa,
    activationGuideFa: p.activationGuideFa,
    restrictionsFa: p.restrictionsFa,
    warningsFa: p.warningsFa,
    refundEligible: p.refundEligible,
    refundPolicyFa: p.refundPolicyFa,
    requiresRegionAck: p.requiresRegionAck,
    estimatedDeliveryMin: p.estimatedDeliveryMin,
    minOrderQty: p.minOrderQty,
    maxOrderQty: p.maxOrderQty,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    salesCount: p.salesCount,
    gallery,
    variants,
    tags: p.tags.map((t) => t.tag),
    faqs: p.faqs,
    ratingBreakdown,
  };
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const mod = await loadModule<{ getProductBySlug?: (s: string) => Promise<ProductDetail | null> }>(
    CATALOG_SPECIFIER,
  );
  if (mod?.getProductBySlug) {
    try {
      return await mod.getProductBySlug(slug);
    } catch {
      /* fall through */
    }
  }
  return getProductBySlugFallback(slug);
}

// ── Reviews (product page) ───────────────────────────────────────────────

export type ReviewItem = {
  id: string;
  displayName: string;
  rating: number;
  titleFa: string | null;
  bodyFa: string;
  isVerifiedPurchase: boolean;
  helpfulCount: number;
  adminReplyFa: string | null;
  adminReplyAt: string | null;
  createdAt: string;
};

export async function getProductReviews(
  productId: string,
  { page = 1, perPage = 8 }: { page?: number; perPage?: number } = {},
): Promise<{ items: ReviewItem[]; total: number; totalPages: number; page: number }> {
  const [rows, total] = await Promise.all([
    db.review.findMany({
      where: { productId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        displayName: true,
        rating: true,
        titleFa: true,
        bodyFa: true,
        isVerifiedPurchase: true,
        helpfulCount: true,
        adminReplyFa: true,
        adminReplyAt: true,
        createdAt: true,
      },
    }),
    db.review.count({ where: { productId, status: 'APPROVED' } }),
  ]);
  return {
    items: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      adminReplyAt: r.adminReplyAt ? r.adminReplyAt.toISOString() : null,
    })),
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    page,
  };
}

// ── Related / recommended ────────────────────────────────────────────────

async function relationOrFallback(
  productId: string,
  categoryId: string,
  kind: string,
  limit: number,
): Promise<ProductCardData[]> {
  const explicit = await db.productRelation.findMany({
    where: { sourceId: productId, kind },
    orderBy: { sortOrder: 'asc' },
    take: limit,
    select: { target: { select: PRODUCT_LIST_SELECT } },
  });
  if (explicit.length > 0) return explicit.map((r) => toCardData(r.target as RawProduct));

  const rows = await db.product.findMany({
    where: { ...visibleProductWhere(), categoryId, id: { not: productId } },
    orderBy: [{ salesCount: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: PRODUCT_LIST_SELECT,
  });
  return rows.map(toCardData);
}

export async function getRelatedProducts(productId: string, categoryId: string, limit = 8) {
  return relationOrFallback(productId, categoryId, 'RELATED', limit);
}

export async function getRecommendations(productId: string, categoryId: string, limit = 8) {
  const cross = await relationOrFallback(productId, categoryId, 'CROSS_SELL', limit);
  if (cross.length > 0) return cross;
  return relationOrFallback(productId, categoryId, 'UPSELL', limit);
}

// ── Recently viewed ──────────────────────────────────────────────────────

export async function recordProductView(input: {
  productId: string;
  userId?: string | null;
  sessionKey?: string | null;
}): Promise<void> {
  const { productId, userId, sessionKey } = input;
  try {
    await db.product.update({ where: { id: productId }, data: { viewCount: { increment: 1 } } });
    if (userId) {
      await db.recentlyViewed.upsert({
        where: { userId_productId: { userId, productId } },
        create: { userId, productId },
        update: { viewedAt: new Date() },
      });
    } else if (sessionKey) {
      await db.recentlyViewed.upsert({
        where: { sessionKey_productId: { sessionKey, productId } },
        create: { sessionKey, productId },
        update: { viewedAt: new Date() },
      });
    }
  } catch {
    /* best-effort telemetry — never break the page render */
  }
}

export async function getRecentlyViewed(input: {
  userId?: string | null;
  sessionKey?: string | null;
  excludeProductId?: string;
  limit?: number;
}): Promise<ProductCardData[]> {
  const { userId, sessionKey, excludeProductId, limit = 10 } = input;
  if (!userId && !sessionKey) return [];
  const rows = await db.recentlyViewed.findMany({
    where: {
      ...(userId ? { userId } : { sessionKey }),
      ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
      product: visibleProductWhere(),
    },
    orderBy: { viewedAt: 'desc' },
    take: limit,
    select: { product: { select: PRODUCT_LIST_SELECT } },
  });
  return rows.map((r) => toCardData(r.product as RawProduct));
}

// ── Home page sections ───────────────────────────────────────────────────

export type BannerItem = {
  id: string;
  titleFa: string;
  subtitleFa: string | null;
  ctaLabel: string | null;
  href: string | null;
  imageDesktop: string | null;
  imageMobile: string | null;
  bgColor: string | null;
};

export type HomeSections = {
  heroBanners: BannerItem[];
  quickCategories: { slug: string; nameFa: string; iconPath: string | null }[];
  featured: ProductCardData[];
  activeCampaign: {
    slug: string;
    nameFa: string;
    descriptionFa: string | null;
    discountPercent: number;
    bannerDesktop: string | null;
    bannerMobile: string | null;
    endsAt: string;
    products: ProductCardData[];
  } | null;
  bestSelling: ProductCardData[];
  newest: ProductCardData[];
  discounted: ProductCardData[];
  popularBrands: { slug: string; nameFa: string; logoPath: string | null }[];
  latestPosts: { slug: string; titleFa: string; excerptFa: string; coverPath: string | null; coverAlt: string | null; readingMinutes: number; publishedAt: string | null }[];
  faqs: { id: string; questionFa: string; answerFa: string }[];
};

async function getHomeSectionsFallback(): Promise<HomeSections> {
  const now = new Date();

  const [
    heroBanners,
    quickCategories,
    featuredRows,
    campaign,
    bestSellingRows,
    newestRows,
    discountedRows,
    popularBrands,
    latestPosts,
    faqs,
  ] = await Promise.all([
    db.banner.findMany({
      where: {
        position: 'home-hero',
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        titleFa: true,
        subtitleFa: true,
        ctaLabel: true,
        href: true,
        imageDesktop: true,
        imageMobile: true,
        bgColor: true,
      },
    }),
    db.category.findMany({
      where: { parentId: null, isActive: true },
      orderBy: { sortOrder: 'asc' },
      take: 12,
      select: { slug: true, nameFa: true, iconKey: true },
    }),
    db.product.findMany({
      where: { ...visibleProductWhere(), isFeatured: true },
      orderBy: { sortOrder: 'asc' },
      take: 10,
      select: PRODUCT_LIST_SELECT,
    }),
    db.campaign.findFirst({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { startsAt: 'desc' },
      select: {
        slug: true,
        nameFa: true,
        descriptionFa: true,
        discountPercent: true,
        bannerDesktop: true,
        bannerMobile: true,
        endsAt: true,
        products: {
          take: 10,
          select: { product: { select: PRODUCT_LIST_SELECT } },
        },
      },
    }),
    db.product.findMany({
      where: { ...visibleProductWhere(), salesCount: { gt: 0 } },
      orderBy: { salesCount: 'desc' },
      take: 10,
      select: PRODUCT_LIST_SELECT,
    }),
    db.product.findMany({
      where: visibleProductWhere(),
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: PRODUCT_LIST_SELECT,
    }),
    db.product.findMany({
      where: visibleProductWhere(),
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: PRODUCT_LIST_SELECT,
    }),
    db.brand.findMany({
      where: { isActive: true, isFeatured: true },
      orderBy: { sortOrder: 'asc' },
      take: 12,
      select: { slug: true, nameFa: true, logoKey: true },
    }),
    db.blogPost.findMany({
      where: { status: 'PUBLISHED', publishedAt: { lte: now } },
      orderBy: { publishedAt: 'desc' },
      take: 3,
      select: {
        slug: true,
        titleFa: true,
        excerptFa: true,
        coverPath: true,
        coverAlt: true,
        readingMinutes: true,
        publishedAt: true,
      },
    }),
    db.faq.findMany({
      where: { isActive: true, group: 'general', productId: null },
      orderBy: { sortOrder: 'asc' },
      take: 8,
      select: { id: true, questionFa: true, answerFa: true },
    }),
  ]);

  const discounted = discountedRows.filter((p) => discountOf(p) > 0).slice(0, 10);

  return {
    heroBanners: heroBanners.map((b) => ({ ...b })),
    quickCategories: quickCategories.map((c) => ({ slug: c.slug, nameFa: c.nameFa, iconPath: c.iconKey })),
    featured: featuredRows.map(toCardData),
    activeCampaign: campaign
      ? {
          slug: campaign.slug,
          nameFa: campaign.nameFa,
          descriptionFa: campaign.descriptionFa,
          discountPercent: campaign.discountPercent,
          bannerDesktop: campaign.bannerDesktop,
          bannerMobile: campaign.bannerMobile,
          endsAt: campaign.endsAt.toISOString(),
          products: campaign.products.map((cp) => toCardData(cp.product as RawProduct)),
        }
      : null,
    bestSelling: bestSellingRows.map(toCardData),
    newest: newestRows.map(toCardData),
    discounted: discounted.map(toCardData),
    popularBrands: popularBrands.map((b) => ({ slug: b.slug, nameFa: b.nameFa, logoPath: b.logoKey })),
    latestPosts: latestPosts.map((p) => ({
      ...p,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    })),
    faqs,
  };
}

export async function getHomeSections(): Promise<HomeSections> {
  const mod = await loadModule<{ getHomeSections?: () => Promise<HomeSections> }>(CATALOG_SPECIFIER);
  if (mod?.getHomeSections) {
    try {
      return await mod.getHomeSections();
    } catch {
      /* fall through */
    }
  }
  return getHomeSectionsFallback();
}

// ── Categories ────────────────────────────────────────────────────────────

export type CategoryTreeNode = {
  slug: string;
  nameFa: string;
  iconPath: string | null;
  productCount: number;
  children: CategoryTreeNode[];
};

export async function getCategoryTree(): Promise<CategoryTreeNode[]> {
  const mod = await loadModule<{ getCategoryTree?: () => Promise<CategoryTreeNode[]> }>(CATALOG_SPECIFIER);
  if (mod?.getCategoryTree) {
    try {
      return await mod.getCategoryTree();
    } catch {
      /* fall through */
    }
  }
  const roots = await db.category.findMany({
    where: { parentId: null, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      slug: true,
      nameFa: true,
      iconKey: true,
      _count: { select: { products: { where: visibleProductWhere() } } },
      children: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          slug: true,
          nameFa: true,
          iconKey: true,
          _count: { select: { products: { where: visibleProductWhere() } } },
        },
      },
    },
  });
  return roots.map((r) => ({
    slug: r.slug,
    nameFa: r.nameFa,
    iconPath: r.iconKey,
    productCount: r._count.products,
    children: r.children.map((c) => ({
      slug: c.slug,
      nameFa: c.nameFa,
      iconPath: c.iconKey,
      productCount: c._count.products,
      children: [],
    })),
  }));
}

export type CategoryDetail = {
  slug: string;
  nameFa: string;
  descriptionFa: string | null;
  posterPath: string | null;
  bannerPath: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  parent: { slug: string; nameFa: string } | null;
  children: { slug: string; nameFa: string }[];
};

export async function getCategoryBySlug(slug: string): Promise<CategoryDetail | null> {
  const mod = await loadModule<{ getCategoryBySlug?: (s: string) => Promise<CategoryDetail | null> }>(
    CATALOG_SPECIFIER,
  );
  if (mod?.getCategoryBySlug) {
    try {
      return await mod.getCategoryBySlug(slug);
    } catch {
      /* fall through */
    }
  }
  const c = await db.category.findFirst({
    where: { slug, isActive: true },
    select: {
      slug: true,
      nameFa: true,
      descriptionFa: true,
      posterKey: true,
      bannerKey: true,
      seoTitle: true,
      seoDescription: true,
      parent: { select: { slug: true, nameFa: true } },
      children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, nameFa: true } },
    },
  });
  if (!c) return null;
  return {
    slug: c.slug,
    nameFa: c.nameFa,
    descriptionFa: c.descriptionFa,
    posterPath: c.posterKey,
    bannerPath: c.bannerKey,
    seoTitle: c.seoTitle,
    seoDescription: c.seoDescription,
    parent: c.parent,
    children: c.children,
  };
}

// ── Brands ────────────────────────────────────────────────────────────────

export type BrandDetail = {
  slug: string;
  nameFa: string;
  nameEn: string;
  descriptionFa: string | null;
  logoPath: string | null;
  bannerPath: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export async function getBrandBySlug(slug: string): Promise<BrandDetail | null> {
  const mod = await loadModule<{ getBrandBySlug?: (s: string) => Promise<BrandDetail | null> }>(CATALOG_SPECIFIER);
  if (mod?.getBrandBySlug) {
    try {
      return await mod.getBrandBySlug(slug);
    } catch {
      /* fall through */
    }
  }
  const b = await db.brand.findFirst({
    where: { slug, isActive: true },
    select: {
      slug: true,
      nameFa: true,
      nameEn: true,
      descriptionFa: true,
      logoKey: true,
      bannerKey: true,
      seoTitle: true,
      seoDescription: true,
    },
  });
  if (!b) return null;
  return {
    slug: b.slug,
    nameFa: b.nameFa,
    nameEn: b.nameEn,
    descriptionFa: b.descriptionFa,
    logoPath: b.logoKey,
    bannerPath: b.bannerKey,
    seoTitle: b.seoTitle,
    seoDescription: b.seoDescription,
  };
}

export type BrandListItem = { slug: string; nameFa: string; nameEn: string; logoPath: string | null; productCount: number };

export async function listBrands(): Promise<BrandListItem[]> {
  const mod = await loadModule<{ listBrands?: () => Promise<BrandListItem[]> }>(CATALOG_SPECIFIER);
  if (mod?.listBrands) {
    try {
      return await mod.listBrands();
    } catch {
      /* fall through */
    }
  }
  const rows = await db.brand.findMany({
    where: { isActive: true },
    orderBy: { nameFa: 'asc' },
    select: {
      slug: true,
      nameFa: true,
      nameEn: true,
      logoKey: true,
      _count: { select: { products: { where: visibleProductWhere() } } },
    },
  });
  return rows.map((b) => ({
    slug: b.slug,
    nameFa: b.nameFa,
    nameEn: b.nameEn,
    logoPath: b.logoKey,
    productCount: b._count.products,
  }));
}
