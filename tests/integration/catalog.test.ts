import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/server/db';
import { encryptSecret, fingerprintCode, maskCode } from '@/lib/crypto';
import {
  getCategoryBySlug,
  getProductBySlug,
  listProducts,
  visibleProductWhere,
} from '@/server/catalog/queries';
import { autocomplete, searchProducts, zeroResultSuggestions } from '@/server/catalog/search';
import { PRICE_BUCKETS } from '@/server/catalog/types';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PREFIX = 'TEST-CAT-';

// ── Fixture ids, populated in beforeAll, cleaned up in afterAll ───────────
let parentCategoryId: string;
let parentCategorySlug: string;
let childCategoryId: string;
let childCategorySlug: string;
let brandAId: string;
let brandBId: string;
let platformId: string;
let regionId: string;
let currencyCode: string;

let visibleProductId: string;
let visibleProductSlug: string;
let visibleVariantId: string;
let secondVisibleProductId: string;

let draftProductId: string;
let archivedProductId: string;
let scheduledProductId: string;
let expiredProductId: string;

const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdInventoryItemIds: string[] = [];

function makeCode(label: string) {
  const plaintext = `${PREFIX}${label}-${RUN_ID}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    plaintext,
    cipher: encryptSecret(plaintext),
    fingerprint: fingerprintCode(plaintext),
    mask: maskCode(plaintext),
  };
}

async function addAvailableInventory(variantId: string, label: string) {
  const c = makeCode(label);
  const item = await db.inventoryItem.create({
    data: {
      variantId,
      codeCipher: c.cipher,
      codeFingerprint: c.fingerprint,
      codeMask: c.mask,
      status: 'AVAILABLE',
      isDemo: true,
    },
  });
  createdInventoryItemIds.push(item.id);
  return item;
}

beforeAll(async () => {
  const parentCategory = await db.category.create({
    data: { slug: `${PREFIX}parent-${RUN_ID}`, nameFa: 'دسته والد تستی', isActive: true },
  });
  const childCategory = await db.category.create({
    data: { slug: `${PREFIX}child-${RUN_ID}`, nameFa: 'دسته فرزند تستی', parentId: parentCategory.id, isActive: true },
  });
  parentCategoryId = parentCategory.id;
  parentCategorySlug = parentCategory.slug;
  childCategoryId = childCategory.id;
  childCategorySlug = childCategory.slug;

  const brandA = await db.brand.create({
    data: { slug: `${PREFIX}brand-a-${RUN_ID}`, nameFa: 'برند تستی آ', nameEn: 'Test Brand A', isActive: true },
  });
  const brandB = await db.brand.create({
    data: { slug: `${PREFIX}brand-b-${RUN_ID}`, nameFa: 'برند تستی ب', nameEn: 'Test Brand B', isActive: true },
  });
  brandAId = brandA.id;
  brandBId = brandB.id;

  const platform = await db.platform.create({
    data: { slug: `${PREFIX}platform-${RUN_ID}`, nameFa: 'پلتفرم تستی', nameEn: 'Test Platform', isActive: true },
  });
  platformId = platform.id;

  const region = await db.region.create({
    data: { code: `${PREFIX}REGION-${RUN_ID}`, nameFa: 'منطقه تستی', nameEn: 'Test Region', isActive: true },
  });
  regionId = region.id;

  const currency = await db.currency.create({
    data: { code: `T${RUN_ID.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}`, nameFa: 'دلار تستی', symbol: '$', minorUnits: 2 },
  });
  currencyCode = currency.code;

  // ── The primary visible, searchable product ──────────────────────────
  const nameFa = 'پلی استیشن تستی';
  const nameEn = 'PlayStation Testkit';
  const { buildSearchKeywords } = await import('@/lib/persian');
  const visibleProduct = await db.product.create({
    data: {
      slug: `${PREFIX}visible-${RUN_ID}`,
      sku: `${PREFIX}SKU-VIS-${RUN_ID}`,
      nameFa,
      nameEn,
      searchKeywords: buildSearchKeywords([nameFa, nameEn]),
      brandId: brandAId,
      categoryId: childCategoryId,
      platformId,
      status: 'ACTIVE',
      publishAt: null,
      isDemo: true,
    },
  });
  visibleProductId = visibleProduct.id;
  visibleProductSlug = visibleProduct.slug;
  createdProductIds.push(visibleProduct.id);

  const visibleVariant = await db.productVariant.create({
    data: {
      productId: visibleProductId,
      sku: `${PREFIX}VAR-VIS-${RUN_ID}`,
      nameFa: 'نسخه استاندارد',
      denominationMinor: 5000, // 50.00 units
      currencyCode,
      regionId,
      platformId,
      costPriceToman: 100_000,
      basePriceToman: 200_000,
      compareAtToman: 250_000,
      isActive: true,
      isDefault: true,
    },
  });
  visibleVariantId = visibleVariant.id;
  createdVariantIds.push(visibleVariant.id);
  await addAvailableInventory(visibleVariantId, 'vis');

  // ── A second visible product: different brand/category/platform/price,
  //    no discount, and deliberately OUT of stock (no AVAILABLE inventory) ──
  const secondProduct = await db.product.create({
    data: {
      slug: `${PREFIX}second-${RUN_ID}`,
      sku: `${PREFIX}SKU-SEC-${RUN_ID}`,
      nameFa: 'کارت تستی دوم',
      brandId: brandBId,
      categoryId: childCategoryId,
      status: 'ACTIVE',
      isDemo: true,
    },
  });
  secondVisibleProductId = secondProduct.id;
  createdProductIds.push(secondProduct.id);
  const secondVariant = await db.productVariant.create({
    data: {
      productId: secondVisibleProductId,
      sku: `${PREFIX}VAR-SEC-${RUN_ID}`,
      nameFa: 'نسخه پایه',
      basePriceToman: 1_500_000, // a different price bucket than the first product
      isActive: true,
    },
  });
  createdVariantIds.push(secondVariant.id);
  // Deliberately no inventory row — this variant is out of stock.

  // ── Products that must NOT be visible ────────────────────────────────
  const draft = await db.product.create({
    data: {
      slug: `${PREFIX}draft-${RUN_ID}`,
      sku: `${PREFIX}SKU-DRAFT-${RUN_ID}`,
      nameFa: 'محصول پیش‌نویس تستی',
      brandId: brandAId,
      categoryId: childCategoryId,
      status: 'DRAFT',
      isDemo: true,
    },
  });
  draftProductId = draft.id;
  createdProductIds.push(draft.id);

  const archived = await db.product.create({
    data: {
      slug: `${PREFIX}archived-${RUN_ID}`,
      sku: `${PREFIX}SKU-ARCH-${RUN_ID}`,
      nameFa: 'محصول آرشیوشده تستی',
      brandId: brandAId,
      categoryId: childCategoryId,
      status: 'ARCHIVED',
      archivedAt: new Date(),
      isDemo: true,
    },
  });
  archivedProductId = archived.id;
  createdProductIds.push(archived.id);

  const scheduled = await db.product.create({
    data: {
      slug: `${PREFIX}scheduled-${RUN_ID}`,
      sku: `${PREFIX}SKU-SCHED-${RUN_ID}`,
      nameFa: 'محصول زمان‌بندی‌شده تستی',
      brandId: brandAId,
      categoryId: childCategoryId,
      status: 'ACTIVE',
      publishAt: new Date(Date.now() + 30 * 24 * 3600_000), // 30 days in the future
      isDemo: true,
    },
  });
  scheduledProductId = scheduled.id;
  createdProductIds.push(scheduled.id);

  const expired = await db.product.create({
    data: {
      slug: `${PREFIX}expired-${RUN_ID}`,
      sku: `${PREFIX}SKU-EXP-${RUN_ID}`,
      nameFa: 'محصول منقضی‌شده تستی',
      brandId: brandAId,
      categoryId: childCategoryId,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() - 24 * 3600_000), // expired yesterday
      isDemo: true,
    },
  });
  expiredProductId = expired.id;
  createdProductIds.push(expired.id);
});

afterAll(async () => {
  await db.inventoryItem.deleteMany({ where: { id: { in: createdInventoryItemIds } } });
  await db.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
  await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await db.platform.deleteMany({ where: { id: platformId } });
  await db.region.deleteMany({ where: { id: regionId } });
  await db.currency.deleteMany({ where: { code: currencyCode } });
  await db.brand.deleteMany({ where: { id: { in: [brandAId, brandBId] } } });
  await db.category.deleteMany({ where: { id: { in: [childCategoryId, parentCategoryId] } } });
});

// ─────────────────────────────────────────────────────────────
// Visibility
// ─────────────────────────────────────────────────────────────

describe('visibleProductWhere / product visibility', () => {
  it('a DRAFT product never matches visibleProductWhere()', async () => {
    const found = await db.product.findFirst({ where: { id: draftProductId, ...visibleProductWhere() } });
    expect(found).toBeNull();
  });

  it('an ARCHIVED product never matches visibleProductWhere()', async () => {
    const found = await db.product.findFirst({ where: { id: archivedProductId, ...visibleProductWhere() } });
    expect(found).toBeNull();
  });

  it('a product scheduled to publish in the future never matches visibleProductWhere()', async () => {
    const found = await db.product.findFirst({ where: { id: scheduledProductId, ...visibleProductWhere() } });
    expect(found).toBeNull();
  });

  it('an expired product never matches visibleProductWhere()', async () => {
    const found = await db.product.findFirst({ where: { id: expiredProductId, ...visibleProductWhere() } });
    expect(found).toBeNull();
  });

  it('an ACTIVE, published, non-expired, non-archived product matches', async () => {
    const found = await db.product.findFirst({ where: { id: visibleProductId, ...visibleProductWhere() } });
    expect(found).not.toBeNull();
  });

  it('getProductBySlug returns null for every hidden product', async () => {
    const draft = await db.product.findUniqueOrThrow({ where: { id: draftProductId }, select: { slug: true } });
    const archived = await db.product.findUniqueOrThrow({ where: { id: archivedProductId }, select: { slug: true } });
    const scheduled = await db.product.findUniqueOrThrow({ where: { id: scheduledProductId }, select: { slug: true } });
    const expired = await db.product.findUniqueOrThrow({ where: { id: expiredProductId }, select: { slug: true } });

    expect(await getProductBySlug(draft.slug)).toBeNull();
    expect(await getProductBySlug(archived.slug)).toBeNull();
    expect(await getProductBySlug(scheduled.slug)).toBeNull();
    expect(await getProductBySlug(expired.slug)).toBeNull();
  });

  it('listProducts scoped to the test category never includes a hidden product', async () => {
    const result = await listProducts({ categorySlug: childCategorySlug }, { perPage: 50 });
    const ids = result.items.map((p) => p.id);
    expect(ids).not.toContain(draftProductId);
    expect(ids).not.toContain(archivedProductId);
    expect(ids).not.toContain(scheduledProductId);
    expect(ids).not.toContain(expiredProductId);
    expect(ids).toContain(visibleProductId);
    expect(ids).toContain(secondVisibleProductId);
    // exactly the two visible fixtures — nothing hidden leaked, nothing extra
    expect(result.total).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
// getProductBySlug — full detail
// ─────────────────────────────────────────────────────────────

describe('getProductBySlug', () => {
  it('returns full detail with a computed variant price, breadcrumb and never exposes codeCipher', async () => {
    const detail = await getProductBySlug(visibleProductSlug);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(visibleProductId);
    expect(detail!.breadcrumb.map((b) => b.slug)).toEqual([parentCategorySlug, childCategorySlug]);

    expect(detail!.variants).toHaveLength(1);
    const v = detail!.variants[0];
    expect(v.id).toBe(visibleVariantId);
    expect(v.unitPriceToman).toBe(200_000); // no sale/campaign/group active -> list price
    expect(v.compareAtToman).toBe(250_000);
    expect(v.discountPercent).toBe(20);
    expect(v.inStock).toBe(true);

    // Defense in depth: the raw JSON must never contain the cipher/fingerprint fields.
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toMatch(/codeCipher|codeFingerprint|serialCipher|pinCipher/i);
  });
});

// ─────────────────────────────────────────────────────────────
// Category descendant expansion
// ─────────────────────────────────────────────────────────────

describe('listProducts — category filter expands to descendants', () => {
  it('filtering by the parent category includes products assigned to its child category', async () => {
    const result = await listProducts({ categorySlug: parentCategorySlug }, { perPage: 50 });
    const ids = result.items.map((p) => p.id);
    expect(ids).toContain(visibleProductId);
    expect(ids).toContain(secondVisibleProductId);
  });

  it('getCategoryBySlug returns a breadcrumb and the child in its children list', async () => {
    const parent = await getCategoryBySlug(parentCategorySlug);
    expect(parent).not.toBeNull();
    expect(parent!.children.map((c) => c.slug)).toContain(childCategorySlug);

    const child = await getCategoryBySlug(childCategorySlug);
    expect(child!.breadcrumb.map((b) => b.slug)).toEqual([parentCategorySlug, childCategorySlug]);
  });
});

// ─────────────────────────────────────────────────────────────
// Filters + facets — consistent counts
// ─────────────────────────────────────────────────────────────

describe('listProducts — filters and facets return consistent counts', () => {
  it('brand filter narrows results and matches the brand facet count with no filter applied', async () => {
    const scoped = { categorySlug: childCategorySlug };
    const all = await listProducts(scoped, { perPage: 50 });
    const brandAFacet = all.facets.brands.find((b) => b.value === (await db.brand.findUniqueOrThrow({ where: { id: brandAId } })).slug);

    const filtered = await listProducts({ ...scoped, brandSlugs: [brandAFacet!.value] }, { perPage: 50 });
    // brandA owns: visible product + draft + archived + scheduled + expired (4 hidden + 1 visible)
    // only the visible one should come back from listProducts, matching the facet count.
    expect(filtered.total).toBe(brandAFacet!.count);
    expect(filtered.items.every((p) => p.brand.slug === brandAFacet!.value)).toBe(true);
  });

  it('price range filter matches the sum of the corresponding price-bucket facet counts', async () => {
    const scoped = { categorySlug: childCategorySlug };
    const all = await listProducts(scoped, { perPage: 50 });
    const totalFromBuckets = all.facets.priceBuckets.reduce((sum, b) => sum + b.count, 0);
    // Every visible product in scope has exactly one active variant, so bucket
    // counts (one bucket per product) must sum to the same total as the list.
    expect(totalFromBuckets).toBe(all.total);

    const bucket = PRICE_BUCKETS.find((b) => b.minToman === 0)!; // "تا ۱۰۰ هزار تومان" .. actually first bucket covers up to 100k
    const cheapBucket = all.facets.priceBuckets.find((b) => b.value === bucket.key)!;
    const filtered = await listProducts({ ...scoped, priceMinToman: bucket.minToman ?? undefined, priceMaxToman: bucket.maxToman ?? undefined }, { perPage: 50 });
    expect(filtered.total).toBe(cheapBucket.count);
  });

  it('availability (in-stock only) filter matches the availability facet', async () => {
    const scoped = { categorySlug: childCategorySlug };
    const all = await listProducts(scoped, { perPage: 50 });
    expect(all.facets.availability.inStock + all.facets.availability.outOfStock).toBe(all.total);
    expect(all.facets.availability.inStock).toBeGreaterThanOrEqual(1); // the primary visible product is in stock
    expect(all.facets.availability.outOfStock).toBeGreaterThanOrEqual(1); // the second product is out of stock

    const inStockOnly = await listProducts({ ...scoped, inStockOnly: true }, { perPage: 50 });
    expect(inStockOnly.total).toBe(all.facets.availability.inStock);
    expect(inStockOnly.items.map((p) => p.id)).toContain(visibleProductId);
    expect(inStockOnly.items.map((p) => p.id)).not.toContain(secondVisibleProductId);
  });

  it('hasDiscount filter returns only the product with an active compare-at discount', async () => {
    const scoped = { categorySlug: childCategorySlug, hasDiscount: true };
    const result = await listProducts(scoped, { perPage: 50 });
    expect(result.items.map((p) => p.id)).toEqual([visibleProductId]);
  });

  it('sort=price-asc and sort=price-desc order the two visible products correctly', async () => {
    const scoped = { categorySlug: childCategorySlug };
    const asc = await listProducts(scoped, { sort: 'price-asc', perPage: 50 });
    const desc = await listProducts(scoped, { sort: 'price-desc', perPage: 50 });
    expect(asc.items[0].id).toBe(visibleProductId); // 200,000 < 1,500,000
    expect(desc.items[0].id).toBe(secondVisibleProductId);
  });

  it('sort=discount ranks the discounted product first', async () => {
    const scoped = { categorySlug: childCategorySlug };
    const byDiscount = await listProducts(scoped, { sort: 'discount', perPage: 50 });
    expect(byDiscount.items[0].id).toBe(visibleProductId);
  });
});

// ─────────────────────────────────────────────────────────────
// Search — Persian, English and misspelled name
// ─────────────────────────────────────────────────────────────

describe('search — finds the product by Persian, English and misspelled forms of its name', () => {
  it('finds it by the exact Persian name', async () => {
    const hits = await searchProducts('پلی استیشن تستی', { limit: 20 });
    expect(hits.map((h) => h.id)).toContain(visibleProductId);
  });

  it('finds it by a partial Persian query', async () => {
    const hits = await searchProducts('پلی استیشن', { limit: 20 });
    expect(hits.map((h) => h.id)).toContain(visibleProductId);
  });

  it('finds it by its English name', async () => {
    const hits = await searchProducts('PlayStation Testkit', { limit: 20 });
    expect(hits.map((h) => h.id)).toContain(visibleProductId);
  });

  it('finds it by a partial English (lowercase) query', async () => {
    const hits = await searchProducts('playstation', { limit: 20 });
    expect(hits.map((h) => h.id)).toContain(visibleProductId);
  });

  it('finds it despite a one-character misspelling (trigram similarity)', async () => {
    const hits = await searchProducts('پلی استیشو', { limit: 20 }); // ن -> و typo
    expect(hits.map((h) => h.id)).toContain(visibleProductId);
  });

  it('never leaks a hidden product through search', async () => {
    const hits = await searchProducts('تستی', { limit: 100 });
    const ids = hits.map((h) => h.id);
    expect(ids).not.toContain(draftProductId);
    expect(ids).not.toContain(archivedProductId);
    expect(ids).not.toContain(scheduledProductId);
    expect(ids).not.toContain(expiredProductId);
  });

  it('returns [] for an empty/whitespace query rather than matching everything', async () => {
    expect(await searchProducts('')).toEqual([]);
    expect(await searchProducts('   ')).toEqual([]);
  });

  it('zeroResultSuggestions never throws and returns popular searches as a fallback', async () => {
    const suggestions = await zeroResultSuggestions('زضصثقفغعهخحجچguaranteed-no-match-xyzxyz');
    expect(Array.isArray(suggestions.popular)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Autocomplete — grouped results
// ─────────────────────────────────────────────────────────────

describe('autocomplete', () => {
  it('returns a grouped product suggestion for a partial query', async () => {
    const result = await autocomplete('پلی است', 8);
    expect(result).toHaveProperty('products');
    expect(result).toHaveProperty('brands');
    expect(result).toHaveProperty('categories');
    expect(result.products.some((p) => p.slug === visibleProductSlug)).toBe(true);
    const hit = result.products.find((p) => p.slug === visibleProductSlug)!;
    expect(hit.priceFromToman).toBe(200_000);
  });

  it('returns the test brand when queried by its Persian name', async () => {
    const brandA = await db.brand.findUniqueOrThrow({ where: { id: brandAId } });
    const result = await autocomplete(brandA.nameFa, 8);
    expect(result.brands.some((b) => b.slug === brandA.slug)).toBe(true);
  });

  it('returns [] groups (not an error) for an empty or 1-character query', async () => {
    expect(await autocomplete('')).toEqual({ products: [], brands: [], categories: [] });
    expect(await autocomplete('پ')).toEqual({ products: [], brands: [], categories: [] });
  });
});
