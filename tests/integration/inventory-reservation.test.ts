import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/server/db';
import { encryptSecret, fingerprintCode, maskCode } from '@/lib/crypto';
import {
  reserveForOrder,
  releaseReservation,
  releaseExpiredReservations,
  availableCount,
  availabilityMap,
} from '@/server/inventory/reservation';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PREFIX = 'TEST-RES-';

let categoryId: string;
let brandId: string;
let productId: string;
const createdVariantIds: string[] = [];

function makeCode(label: string) {
  const plaintext = `${PREFIX}${label}-${RUN_ID}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    plaintext,
    cipher: encryptSecret(plaintext),
    fingerprint: fingerprintCode(plaintext),
    mask: maskCode(plaintext),
  };
}

/** Every test gets its own fresh variant so inventory counts never leak between tests. */
async function createTestVariant(label: string): Promise<string> {
  const variant = await db.productVariant.create({
    data: { productId, sku: `${PREFIX}VAR-${label}-${RUN_ID}`, nameFa: `متغیر تستی ${label}` },
  });
  createdVariantIds.push(variant.id);
  return variant.id;
}

async function createAvailableItem(forVariantId: string, label: string) {
  const c = makeCode(label);
  return db.inventoryItem.create({
    data: {
      variantId: forVariantId,
      codeCipher: c.cipher,
      codeFingerprint: c.fingerprint,
      codeMask: c.mask,
      status: 'AVAILABLE',
      isDemo: true,
    },
  });
}

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `${PREFIX}cat-${RUN_ID}`, nameFa: 'دسته تستی موجودی' },
  });
  const brand = await db.brand.create({
    data: { slug: `${PREFIX}brand-${RUN_ID}`, nameFa: 'برند تستی', nameEn: 'Test Brand' },
  });
  const product = await db.product.create({
    data: {
      slug: `${PREFIX}prod-${RUN_ID}`,
      sku: `${PREFIX}SKU-${RUN_ID}`,
      nameFa: 'محصول تستی موجودی',
      brandId: brand.id,
      categoryId: category.id,
      isDemo: true,
    },
  });

  categoryId = category.id;
  brandId = brand.id;
  productId = product.id;
});

afterAll(async () => {
  await db.inventoryAuditLog.deleteMany({ where: { item: { variantId: { in: createdVariantIds } } } });
  await db.inventoryItem.deleteMany({ where: { variantId: { in: createdVariantIds } } });
  await db.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.brand.deleteMany({ where: { id: brandId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.$disconnect();
});

describe('reserveForOrder concurrency (the classic last-unit race)', () => {
  it('exactly one of 5 concurrent reservations succeeds when only 1 unit is available', async () => {
    const variantId = await createTestVariant('race');
    const item = await createAvailableItem(variantId, 'last-unit');

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        reserveForOrder({ orderId: `TEST-ORDER-RACE-${i}-${RUN_ID}`, lines: [{ variantId, qty: 1 }] }),
      ),
    );

    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(4);
    for (const f of failed) {
      if (!f.ok) {
        expect(f.shortages).toEqual([{ variantId, requested: 1, available: 0 }]);
      }
    }
    if (succeeded[0].ok) {
      expect(succeeded[0].reserved).toEqual([{ variantId, itemIds: [item.id] }]);
    }

    const refreshed = await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(refreshed.status).toBe('RESERVED');
    expect(refreshed.reservedForOrderId).not.toBeNull();
  });

  it('reserves exactly N units for a multi-quantity line and no more', async () => {
    const variantId = await createTestVariant('multi');
    await Promise.all([createAvailableItem(variantId, 'multi-a'), createAvailableItem(variantId, 'multi-b'), createAvailableItem(variantId, 'multi-c')]);

    const orderId = `TEST-ORDER-MULTI-${RUN_ID}`;
    const result = await reserveForOrder({ orderId, lines: [{ variantId, qty: 2 }] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reserved[0].itemIds).toHaveLength(2);
    }

    expect(await availableCount(variantId)).toBe(1);
  });

  it('reports an honest shortage without reserving anything when stock is insufficient', async () => {
    const variantId = await createTestVariant('shortage');
    await createAvailableItem(variantId, 'shortage-only-one');

    const orderId = `TEST-ORDER-SHORT-${RUN_ID}`;
    const result = await reserveForOrder({ orderId, lines: [{ variantId, qty: 5 }] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.shortages).toEqual([{ variantId, requested: 5, available: 1 }]);
    }

    // Nothing should have been reserved — the single available unit is
    // still AVAILABLE, not left dangling as RESERVED.
    expect(await availableCount(variantId)).toBe(1);
  });

  it('rolls back the whole multi-line reservation when any one line falls short', async () => {
    const variantA = await createTestVariant('partial-a');
    const variantB = await createTestVariant('partial-b');
    await createAvailableItem(variantA, 'partial-ok');
    await createAvailableItem(variantB, 'partial-short');

    const orderId = `TEST-ORDER-PARTIAL-${RUN_ID}`;
    const result = await reserveForOrder({
      orderId,
      lines: [
        { variantId: variantA, qty: 1 },
        { variantId: variantB, qty: 10 },
      ],
    });

    expect(result.ok).toBe(false);

    // The line that *did* have enough stock must NOT have been left reserved.
    expect(await availableCount(variantA)).toBe(1);
  });
});

describe('releaseReservation / releaseExpiredReservations', () => {
  it('releaseReservation returns reserved items to AVAILABLE', async () => {
    const variantId = await createTestVariant('release');
    const item = await createAvailableItem(variantId, 'release-me');
    const orderId = `TEST-ORDER-REL-${RUN_ID}`;

    const reserveResult = await reserveForOrder({ orderId, lines: [{ variantId, qty: 1 }] });
    expect(reserveResult.ok).toBe(true);

    const count = await releaseReservation(orderId);
    expect(count).toBe(1);

    const refreshed = await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(refreshed.status).toBe('AVAILABLE');
    expect(refreshed.reservedForOrderId).toBeNull();
    expect(refreshed.reservedUntil).toBeNull();
  });

  it('releaseReservation is a no-op the second time (idempotent)', async () => {
    const variantId = await createTestVariant('release-twice');
    const orderId = `TEST-ORDER-REL2-${RUN_ID}`;
    await createAvailableItem(variantId, 'release-twice');
    await reserveForOrder({ orderId, lines: [{ variantId, qty: 1 }] });

    const first = await releaseReservation(orderId);
    const second = await releaseReservation(orderId);
    expect(first).toBe(1);
    expect(second).toBe(0);
  });

  it('releaseExpiredReservations frees a RESERVED item past reservedUntil whose order never paid', async () => {
    const variantId = await createTestVariant('expired');
    const item = await createAvailableItem(variantId, 'expired');
    await db.inventoryItem.update({
      where: { id: item.id },
      data: {
        status: 'RESERVED',
        reservedForOrderId: `TEST-ORDER-EXPIRED-${RUN_ID}`,
        reservedUntil: new Date(Date.now() - 60_000),
      },
    });

    const count = await releaseExpiredReservations();
    expect(count).toBeGreaterThanOrEqual(1);

    const refreshed = await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(refreshed.status).toBe('AVAILABLE');
    expect(refreshed.reservedForOrderId).toBeNull();
  });

  it('releaseExpiredReservations leaves a still-valid (not yet expired) reservation alone', async () => {
    const variantId = await createTestVariant('not-expired');
    const item = await createAvailableItem(variantId, 'not-expired-yet');
    const orderId = `TEST-ORDER-FUTURE-${RUN_ID}`;
    const result = await reserveForOrder({ orderId, lines: [{ variantId, qty: 1 }], minutes: 15 });
    expect(result.ok).toBe(true);

    await releaseExpiredReservations();

    const refreshed = await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(refreshed.status).toBe('RESERVED');
  });
});

describe('availableCount / availabilityMap', () => {
  it('availabilityMap matches availableCount for each variant in one grouped query', async () => {
    const variantA = await createTestVariant('map-a');
    const variantB = await createTestVariant('map-b');
    await createAvailableItem(variantA, 'map-a');
    await createAvailableItem(variantB, 'map-b');

    const [c1, c2] = await Promise.all([availableCount(variantA), availableCount(variantB)]);
    const map = await availabilityMap([variantA, variantB]);

    expect(map[variantA]).toBe(c1);
    expect(map[variantB]).toBe(c2);
    expect(c1).toBe(1);
    expect(c2).toBe(1);
  });

  it('availabilityMap returns 0 for a variant with no available stock, not undefined', async () => {
    const emptyVariant = await createTestVariant('empty');
    const map = await availabilityMap([emptyVariant]);
    expect(map[emptyVariant]).toBe(0);
  });
});
