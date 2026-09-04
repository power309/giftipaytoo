import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Same fake cookie/header jar approach as auth-permissions.test.ts — cart.ts
// and orders.ts both read the session/cart cookies via `next/headers`.
const cookieStore = new Map<string, string>();
let mockIp = '10.5.5.5';

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
  headers: async () => ({
    get: (name: string) => (name === 'x-forwarded-for' ? mockIp : name === 'user-agent' ? 'vitest' : null),
  }),
}));

const { db } = await import('@/server/db');
const { randomToken, sha256, hashPassword, encryptSecret, fingerprintCode, maskCode } = await import('@/lib/crypto');
const { SESSION_COOKIE } = await import('@/server/auth/session');
const { computeTotals } = await import('@/lib/pricing');
const { addToCart, applyCoupon, getCart } = await import('@/server/cart');
const { createOrderFromCart } = await import('@/server/orders');

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PREFIX = 'TEST-CHECKOUT-';

let customerId: string;
let categoryId: string;
let brandId: string;
let staleCurrencyCode: string;

const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCouponIds: string[] = [];

function freshIp(): string {
  const octet = () => 1 + Math.floor(Math.random() * 254);
  return `10.${octet()}.${octet()}.${octet()}`;
}

async function loginAsCustomer() {
  const raw = randomToken(32);
  await db.session.create({
    data: { userId: customerId, tokenHash: sha256(raw), twoFactorOk: true, expiresAt: new Date(Date.now() + 3600_000) },
  });
  cookieStore.set(SESSION_COOKIE, raw);
  cookieStore.delete('gp_cart');
  mockIp = freshIp();
}

function makeInventoryCode(label: string) {
  const plaintext = `${PREFIX}${label}-${RUN_ID}-${Math.random().toString(36).slice(2, 10)}`;
  return { cipher: encryptSecret(plaintext), fingerprint: fingerprintCode(plaintext), mask: maskCode(plaintext) };
}

async function addAvailableInventory(variantId: string, count: number) {
  for (let i = 0; i < count; i++) {
    const c = makeInventoryCode(`${variantId}-${i}`);
    await db.inventoryItem.create({
      data: {
        variantId,
        codeCipher: c.cipher,
        codeFingerprint: c.fingerprint,
        codeMask: c.mask,
        status: 'AVAILABLE',
        isDemo: true,
      },
    });
  }
}

async function createVariant(opts: {
  label: string;
  basePriceToman: number;
  costPriceToman?: number;
  minQty?: number;
  maxQty?: number;
  requiresRegionAck?: boolean;
  currencyCode?: string;
}) {
  const product = await db.product.create({
    data: {
      slug: `${PREFIX}${opts.label}-${RUN_ID}`.toLowerCase(),
      sku: `${PREFIX}SKU-${opts.label}-${RUN_ID}`.toUpperCase(),
      nameFa: `کالای تستی ${opts.label}`,
      brandId,
      categoryId,
      status: 'ACTIVE',
      requiresRegionAck: opts.requiresRegionAck ?? false,
      minOrderQty: 1,
      maxOrderQty: 50,
      isDemo: true,
    },
  });
  createdProductIds.push(product.id);

  const variant = await db.productVariant.create({
    data: {
      productId: product.id,
      sku: `${PREFIX}VAR-${opts.label}-${RUN_ID}`.toUpperCase(),
      nameFa: `متغیر ${opts.label}`,
      basePriceToman: opts.basePriceToman,
      costPriceToman: opts.costPriceToman ?? Math.round(opts.basePriceToman * 0.6),
      autoPrice: false, // deterministic price regardless of any global PricingRule
      minQty: opts.minQty ?? 1,
      maxQty: opts.maxQty ?? 10,
      currencyCode: opts.currencyCode,
      isActive: true,
    },
  });
  createdVariantIds.push(variant.id);
  return { productId: product.id, variantId: variant.id };
}

beforeAll(async () => {
  const category = await db.category.create({ data: { slug: `${PREFIX}cat-${RUN_ID}`, nameFa: 'دسته تستی تسویه' } });
  const brand = await db.brand.create({
    data: { slug: `${PREFIX}brand-${RUN_ID}`, nameFa: 'برند تستی', nameEn: 'Test Brand' },
  });
  categoryId = category.id;
  brandId = brand.id;

  const customer = await db.user.create({
    data: {
      email: `${PREFIX}customer-${RUN_ID}@example.com`.toLowerCase(),
      passwordHash: await hashPassword('Str0ng!Passw0rd'),
      isStaff: false,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  customerId = customer.id;

  // A currency code unique to this run, deliberately given NO ExchangeRate
  // row — `checkoutPricingGuard()` treats a currency with no active rate the
  // same as a stale one, which is exactly what the staleness test needs. A
  // shared code like 'USD' would be unreliable here since other fixtures /
  // demo data in this database may well have already set an active rate.
  staleCurrencyCode = `TF${RUN_ID}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase();
  await db.currency.create({
    data: { code: staleCurrencyCode, nameFa: 'ارز تستی بدون نرخ', symbol: '$', minorUnits: 2 },
  });
});

afterAll(async () => {
  await db.orderStatusHistory.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await db.couponRedemption.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await db.walletTransaction.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  await db.coupon.deleteMany({ where: { id: { in: createdCouponIds } } });
  await db.inventoryAuditLog.deleteMany({ where: { item: { variantId: { in: createdVariantIds } } } });
  await db.inventoryItem.deleteMany({ where: { variantId: { in: createdVariantIds } } });
  await db.cartItem.deleteMany({ where: { variant: { id: { in: createdVariantIds } } } });
  await db.cart.deleteMany({ where: { userId: customerId } });
  await db.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
  await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await db.session.deleteMany({ where: { userId: customerId } });
  await db.user.deleteMany({ where: { id: customerId } });
  await db.brand.deleteMany({ where: { id: brandId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.currency.deleteMany({ where: { code: staleCurrencyCode } });
  await db.$disconnect();
});

describe('full checkout flow', () => {
  it('adds to cart, applies a coupon, creates an order with integer totals matching computeTotals, and reserves inventory', async () => {
    await loginAsCustomer();
    const { variantId } = await createVariant({ label: 'main', basePriceToman: 500_000 });
    await addAvailableInventory(variantId, 5);

    const added = await addToCart({ variantId, qty: 2, regionAcknowledged: false });
    expect(added.ok).toBe(true);

    const shortCode = `TF50K${RUN_ID}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 20).toUpperCase();
    const coupon = await db.coupon.create({
      data: {
        code: shortCode,
        nameFa: 'کد تخفیف تستی',
        type: 'FIXED',
        value: 50_000,
        minOrderToman: 0,
        perUserLimit: 5,
        isActive: true,
      },
    });
    createdCouponIds.push(coupon.id);

    const coupled = await applyCoupon({ code: coupon.code });
    expect(coupled.ok).toBe(true);
    if (coupled.ok) {
      expect(coupled.couponCode).toBe(coupon.code);
      expect(coupled.totals.discountToman).toBe(50_000);
    }

    const result = await createOrderFromCart({ termsAccepted: true, regionAcknowledged: false, useWallet: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    createdOrderIds.push(result.orderId);

    const expected = computeTotals({
      lines: [{ variantId, qty: 2, unitPriceToman: 500_000, unitCostToman: 300_000 }],
      coupon: { type: 'FIXED', value: 50_000, maxDiscountToman: null, minOrderToman: 0 },
      taxPercent: 0,
      feeToman: 0,
    });

    const order = await db.order.findUniqueOrThrow({ where: { id: result.orderId }, include: { items: true } });

    for (const amount of [order.subtotalToman, order.discountToman, order.taxToman, order.feeToman, order.totalToman]) {
      expect(Number.isInteger(amount)).toBe(true);
    }
    expect(order.subtotalToman).toBe(expected.subtotalToman);
    expect(order.discountToman).toBe(expected.discountToman);
    expect(order.totalToman).toBe(expected.totalToman);
    expect(result.payableToman).toBe(expected.totalToman);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].qty).toBe(2);
    expect(order.items[0].unitPriceToman).toBe(500_000);

    const reserved = await db.inventoryItem.findMany({ where: { reservedForOrderId: order.id } });
    expect(reserved).toHaveLength(2);
    for (const item of reserved) {
      expect(item.status).toBe('RESERVED');
      expect(item.variantId).toBe(variantId);
    }

    // The two reserved items are no longer counted as available.
    const remainingAvailable = await db.inventoryItem.count({ where: { variantId, status: 'AVAILABLE' } });
    expect(remainingAvailable).toBe(3);
  });

  it('refuses a region-sensitive product without acknowledgement, both at add-to-cart and at checkout', async () => {
    await loginAsCustomer();
    const { variantId } = await createVariant({ label: 'region', basePriceToman: 200_000, requiresRegionAck: true });
    await addAvailableInventory(variantId, 3);

    const added = await addToCart({ variantId, qty: 1, regionAcknowledged: false });
    expect(added.ok).toBe(false);
    if (!added.ok) expect(added.error).toMatch(/منطقه/);

    // Force it into the cart directly (bypassing addToCart's own guard) to
    // prove checkout independently re-checks the acknowledgement too.
    const cart = await getCart();
    await db.cartItem.create({
      data: { cartId: cart.cartId, variantId, qty: 1, unitPriceToman: 200_000, regionAcknowledged: false },
    });

    const result = await createOrderFromCart({ termsAccepted: true, regionAcknowledged: false, useWallet: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/منطقه/);

    await db.cartItem.deleteMany({ where: { cartId: cart.cartId, variantId } });
  });

  it('blocks checkout when a foreign-currency variant has no active exchange rate (stale pricing guard)', async () => {
    await loginAsCustomer();
    const { variantId } = await createVariant({
      label: 'fx-stale',
      basePriceToman: 300_000,
      currencyCode: staleCurrencyCode,
    });
    await db.productVariant.update({ where: { id: variantId }, data: { denominationMinor: 5000 } });
    await addAvailableInventory(variantId, 2);

    const added = await addToCart({ variantId, qty: 1, regionAcknowledged: false });
    expect(added.ok).toBe(true);

    const result = await createOrderFromCart({ termsAccepted: true, regionAcknowledged: false, useWallet: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/نرخ ارز|قیمت/);

    const cart = await getCart();
    await db.cartItem.deleteMany({ where: { cartId: cart.cartId, variantId } });
  });

  it('enforces per-variant quantity limits', async () => {
    await loginAsCustomer();
    const { variantId } = await createVariant({ label: 'qtylimit', basePriceToman: 100_000, minQty: 2, maxQty: 3 });
    await addAvailableInventory(variantId, 5);

    const tooFew = await addToCart({ variantId, qty: 1, regionAcknowledged: false });
    expect(tooFew.ok).toBe(false);

    const tooMany = await addToCart({ variantId, qty: 4, regionAcknowledged: false });
    expect(tooMany.ok).toBe(false);

    const justRight = await addToCart({ variantId, qty: 2, regionAcknowledged: false });
    expect(justRight.ok).toBe(true);
    if (justRight.ok) {
      const line = justRight.lines.find((l) => l.variantId === variantId);
      expect(line?.qty).toBe(2);
    }

    const cart = await getCart();
    await db.cartItem.deleteMany({ where: { cartId: cart.cartId, variantId } });
  });
});
