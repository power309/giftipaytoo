import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/server/db';
import { encryptSecret, fingerprintCode, maskCode } from '@/lib/crypto';
import { fulfillOrder } from '@/server/inventory/fulfillment';
import { makeReference } from '@/lib/utils';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PREFIX = 'TEST-FUL-';

let categoryId: string;
let brandId: string;
let productId: string;
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];

function makeCode(label: string) {
  const plaintext = `${PREFIX}${label}-${RUN_ID}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    plaintext,
    cipher: encryptSecret(plaintext),
    fingerprint: fingerprintCode(plaintext),
    mask: maskCode(plaintext),
  };
}

async function createTestVariant(label: string): Promise<string> {
  const variant = await db.productVariant.create({
    data: { productId, sku: `${PREFIX}VAR-${label}-${RUN_ID}`, nameFa: `متغیر تستی ${label}` },
  });
  createdVariantIds.push(variant.id);
  return variant.id;
}

async function createAvailableItem(variantId: string, label: string, costToman = 500) {
  const c = makeCode(label);
  return db.inventoryItem.create({
    data: {
      variantId,
      codeCipher: c.cipher,
      codeFingerprint: c.fingerprint,
      codeMask: c.mask,
      status: 'AVAILABLE',
      costToman,
      isDemo: true,
    },
  });
}

async function createPaidOrder(variantId: string, qty: number, unitPriceToman = 1000) {
  const order = await db.order.create({
    data: {
      orderNumber: makeReference('TEST'),
      guestEmail: `fulfillment-test-${RUN_ID}@example.com`,
      status: 'PAID',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'UNFULFILLED',
      subtotalToman: unitPriceToman * qty,
      totalToman: unitPriceToman * qty,
      isDemo: true,
      items: {
        create: [
          {
            variantId,
            productNameFa: 'محصول تستی تحویل',
            variantNameFa: 'متغیر تستی تحویل',
            productSlug: `${PREFIX}slug-${RUN_ID}`,
            qty,
            unitPriceToman,
            unitCostToman: 500,
            lineTotalToman: unitPriceToman * qty,
          },
        ],
      },
    },
    include: { items: true },
  });
  createdOrderIds.push(order.id);
  return order;
}

beforeAll(async () => {
  const category = await db.category.create({ data: { slug: `${PREFIX}cat-${RUN_ID}`, nameFa: 'دسته تستی تحویل' } });
  const brand = await db.brand.create({ data: { slug: `${PREFIX}brand-${RUN_ID}`, nameFa: 'برند تستی', nameEn: 'Test Brand' } });
  const product = await db.product.create({
    data: {
      slug: `${PREFIX}prod-${RUN_ID}`,
      sku: `${PREFIX}SKU-${RUN_ID}`,
      nameFa: 'محصول تستی تحویل',
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
  const notifyKeys = createdOrderIds.flatMap((id) => [`notify:order-delivered:${id}`, `notify:manual-review:${id}`]);
  await db.jobQueue.deleteMany({ where: { idempotencyKey: { in: notifyKeys } } });
  await db.delivery.deleteMany({ where: { orderItem: { orderId: { in: createdOrderIds } } } });
  await db.orderStatusHistory.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  await db.inventoryAuditLog.deleteMany({ where: { item: { variantId: { in: createdVariantIds } } } });
  await db.inventoryItem.deleteMany({ where: { variantId: { in: createdVariantIds } } });
  await db.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.brand.deleteMany({ where: { id: brandId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.$disconnect();
});

describe('fulfillOrder — idempotency and duplicate-delivery prevention', () => {
  it('two concurrent calls for the same paid order produce exactly one Delivery per unit and mark items SOLD once', async () => {
    const variantId = await createTestVariant('concurrent');
    const [itemA, itemB] = await Promise.all([
      createAvailableItem(variantId, 'a'),
      createAvailableItem(variantId, 'b'),
    ]);
    const order = await createPaidOrder(variantId, 2);
    const orderItemId = order.items[0].id;

    const [r1, r2] = await Promise.all([fulfillOrder(order.id), fulfillOrder(order.id)]);

    // Exactly one of the two racing calls should report having actually
    // delivered the 2 units (the row lock serializes them); the other must
    // see the work already done and report zero newly-delivered units —
    // never both delivering, never a duplicate delivery.
    const delivered = [r1, r2].map((r) => (r.ok && !r.alreadyFulfilled ? r.delivered : r.ok && r.alreadyFulfilled ? 0 : -1));
    expect(delivered.every((d) => d >= 0)).toBe(true);
    expect(delivered.reduce((a, b) => a + b, 0)).toBe(2);

    const deliveries = await db.delivery.findMany({ where: { orderItemId } });
    expect(deliveries).toHaveLength(2);
    const inventoryItemIds = deliveries.map((d) => d.inventoryItemId).sort();
    expect(inventoryItemIds).toEqual([itemA.id, itemB.id].sort());

    const [refreshedA, refreshedB] = await Promise.all([
      db.inventoryItem.findUniqueOrThrow({ where: { id: itemA.id } }),
      db.inventoryItem.findUniqueOrThrow({ where: { id: itemB.id } }),
    ]);
    expect(refreshedA.status).toBe('SOLD');
    expect(refreshedB.status).toBe('SOLD');
    expect(refreshedA.soldAt).not.toBeNull();
    expect(refreshedA.orderItemId).toBe(orderItemId);

    const refreshedOrderItem = await db.orderItem.findUniqueOrThrow({ where: { id: orderItemId } });
    expect(refreshedOrderItem.fulfilledQty).toBe(2);

    const refreshedOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshedOrder.fulfillmentStatus).toBe('FULFILLED');
    expect(refreshedOrder.status).toBe('COMPLETED');
    expect(refreshedOrder.fulfilledAt).not.toBeNull();

    // Only one customer notification job should have been enqueued despite
    // the race — enqueueJob's idempotencyKey dedupe must have caught the second.
    const notifyJobs = await db.jobQueue.findMany({ where: { idempotencyKey: `notify:order-delivered:${order.id}` } });
    expect(notifyJobs).toHaveLength(1);
  });

  it('a third, sequential call after full fulfillment is a pure no-op', async () => {
    const variantId = await createTestVariant('noop');
    const item = await createAvailableItem(variantId, 'noop-item');
    const order = await createPaidOrder(variantId, 1);
    const orderItemId = order.items[0].id;

    const first = await fulfillOrder(order.id);
    expect(first.ok).toBe(true);
    if (first.ok && !first.alreadyFulfilled) expect(first.delivered).toBe(1);

    const deliveriesAfterFirst = await db.delivery.count({ where: { orderItemId } });
    expect(deliveriesAfterFirst).toBe(1);

    const second = await fulfillOrder(order.id);
    expect(second).toEqual({ ok: true, alreadyFulfilled: true, delivered: 0 });

    const deliveriesAfterSecond = await db.delivery.count({ where: { orderItemId } });
    expect(deliveriesAfterSecond).toBe(1);

    const refreshedItem = await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(refreshedItem.status).toBe('SOLD');

    const refreshedOrderItem = await db.orderItem.findUniqueOrThrow({ where: { id: orderItemId } });
    expect(refreshedOrderItem.fulfilledQty).toBe(1);
  });

  it('refuses to fulfill an order that is not paid', async () => {
    const variantId = await createTestVariant('unpaid');
    await createAvailableItem(variantId, 'unpaid-item');
    const order = await db.order.create({
      data: {
        orderNumber: makeReference('TEST'),
        status: 'PENDING',
        paymentStatus: 'PENDING',
        fulfillmentStatus: 'UNFULFILLED',
        isDemo: true,
        items: {
          create: [
            {
              variantId,
              productNameFa: 'محصول',
              variantNameFa: 'متغیر',
              productSlug: `${PREFIX}unpaid-${RUN_ID}`,
              qty: 1,
              unitPriceToman: 1000,
              lineTotalToman: 1000,
            },
          ],
        },
      },
    });
    createdOrderIds.push(order.id);

    const result = await fulfillOrder(order.id);
    expect(result).toEqual({ ok: false, reason: 'not-paid' });

    const deliveries = await db.delivery.count({ where: { orderItem: { orderId: order.id } } });
    expect(deliveries).toBe(0);
  });

  it('flags the order for manual review and notifies admins when stock is genuinely unavailable', async () => {
    const variantId = await createTestVariant('oos');
    // No InventoryItem created at all for this variant.
    const order = await createPaidOrder(variantId, 1);

    const result = await fulfillOrder(order.id);
    expect(result.ok).toBe(true);
    if (result.ok && !result.alreadyFulfilled) {
      expect(result.manualReview).toBe(true);
      expect(result.delivered).toBe(0);
    }

    const refreshedOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refreshedOrder.needsReview).toBe(true);

    const notifyJobs = await db.jobQueue.findMany({ where: { idempotencyKey: `notify:manual-review:${order.id}` } });
    expect(notifyJobs).toHaveLength(1);
  });

  it('returns not-found for a nonexistent order id', async () => {
    const result = await fulfillOrder(`TEST-DOES-NOT-EXIST-${RUN_ID}`);
    expect(result).toEqual({ ok: false, reason: 'not-found' });
  });
});
