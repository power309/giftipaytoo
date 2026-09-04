'use server';

import type { Coupon, ProductVariant, Product } from '@prisma/client';
import { db } from './db';
import { logger } from '@/lib/logger';
import { computeTotals, couponDiscount, type CouponInput } from '@/lib/pricing';
import { assertToman } from '@/lib/money';
import { getSessionUser, getOrCreateCartKey } from './auth/session';
import { getSetting } from './settings';
import {
  addToCartSchema,
  applyCouponSchema,
  removeCartItemSchema,
  toPlainObject,
  updateCartQtySchema,
  firstZodMessage,
} from '@/lib/schemas';

/**
 * Cart Server Actions — work identically for guests (keyed by the
 * `gp_cart` cookie via `getOrCreateCartKey()`) and signed-in users (keyed by
 * `userId`). Every write recomputes price/availability from the database;
 * nothing here ever trusts a client-supplied price or quantity.
 *
 * Lazy-import seam: `@/server/pricing-service`'s `computeVariantPrice` for
 * live, DB-backed pricing (margin rules, campaigns, customer-group and bulk
 * discounts, exchange-rate driven cost). Degrades honestly to
 * `variant.salePriceToman ?? basePriceToman` if that module is ever
 * unavailable. `@/server/inventory/reservation`'s `availabilityMap` is used
 * the same way for live stock counts.
 */

const CART_EXPIRY_DAYS = 30;

// ── Lazy seams ──────────────────────────────────────────────────

type PricingServiceModule = {
  computeVariantPrice?: (
    variantId: string,
    opts: { customerGroupId?: string | null; qty?: number },
  ) => Promise<{ unitPriceToman: number }>;
};

async function loadPricingService(): Promise<PricingServiceModule | null> {
  try {
    return (await import('@/server/pricing-service')) as PricingServiceModule;
  } catch {
    return null;
  }
}

/** Fallback used verbatim per spec: `variant.salePriceToman ?? basePriceToman`. */
function fallbackUnitPrice(variant: { basePriceToman: number; salePriceToman: number | null }): number {
  return variant.salePriceToman ?? variant.basePriceToman;
}

export async function resolveUnitPrice(
  variant: { id: string; basePriceToman: number; salePriceToman: number | null },
  qty: number,
  customerGroupId?: string | null,
): Promise<number> {
  const mod = await loadPricingService();
  if (mod && typeof mod.computeVariantPrice === 'function') {
    try {
      const quote = await mod.computeVariantPrice(variant.id, { customerGroupId, qty });
      if (quote && Number.isInteger(quote.unitPriceToman) && quote.unitPriceToman > 0) return quote.unitPriceToman;
    } catch (err) {
      logger.warn('cart: pricing-service.computeVariantPrice failed, using fallback price', {
        variantId: variant.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return fallbackUnitPrice(variant);
}

type InventoryReservationModule = {
  availabilityMap?: (variantIds: string[]) => Promise<Record<string, number>>;
};

async function loadInventoryReservation(): Promise<InventoryReservationModule | null> {
  try {
    return (await import('@/server/inventory/reservation')) as InventoryReservationModule;
  } catch {
    return null;
  }
}

/** Fallback: count `AVAILABLE` inventory rows directly. */
async function availabilityFallback(variantIds: string[]): Promise<Record<string, number>> {
  if (variantIds.length === 0) return {};
  const rows = await db.inventoryItem.groupBy({
    by: ['variantId'],
    where: { variantId: { in: variantIds }, status: 'AVAILABLE' },
    _count: { _all: true },
  });
  const out: Record<string, number> = Object.fromEntries(variantIds.map((id) => [id, 0]));
  for (const r of rows) out[r.variantId] = r._count._all;
  return out;
}

export async function availabilityFor(variantIds: string[]): Promise<Record<string, number>> {
  const mod = await loadInventoryReservation();
  if (mod && typeof mod.availabilityMap === 'function') {
    try {
      return await mod.availabilityMap(variantIds);
    } catch (err) {
      logger.warn('cart: inventory/reservation.availabilityMap failed, using fallback', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return availabilityFallback(variantIds);
}

// ── Cart resolution ──────────────────────────────────────────────

type ResolvedCart = { cartId: string; sessionKey: string; userId: string | null; isGuest: boolean };

async function resolveCart(): Promise<ResolvedCart> {
  const user = await getSessionUser();
  const expiresAt = new Date(Date.now() + CART_EXPIRY_DAYS * 86_400_000);

  if (user) {
    const existing = await db.cart.findFirst({ where: { userId: user.id }, select: { id: true, sessionKey: true } });
    if (existing) {
      await db.cart.update({ where: { id: existing.id }, data: { expiresAt } });
      return { cartId: existing.id, sessionKey: existing.sessionKey, userId: user.id, isGuest: false };
    }
    const created = await db.cart.create({
      data: { userId: user.id, sessionKey: `user:${user.id}:${Date.now().toString(36)}`, expiresAt },
      select: { id: true, sessionKey: true },
    });
    return { cartId: created.id, sessionKey: created.sessionKey, userId: user.id, isGuest: false };
  }

  const sessionKey = await getOrCreateCartKey();
  const existing = await db.cart.findUnique({ where: { sessionKey }, select: { id: true } });
  if (existing) {
    await db.cart.update({ where: { id: existing.id }, data: { expiresAt } });
    return { cartId: existing.id, sessionKey, userId: null, isGuest: true };
  }
  const created = await db.cart.create({ data: { sessionKey, expiresAt }, select: { id: true } });
  return { cartId: created.id, sessionKey, userId: null, isGuest: true };
}

// ── Coupon evaluation (shared with orders.ts final re-check) ────────────

export type CouponLineInfo = { categoryId: string; brandId: string; supplierId: string | null; variantId: string };

export type CouponEvalResult = { ok: true } | { ok: false; error: string };

/**
 * All the checks a coupon must pass to apply to a given cart — active
 * window, usage limits (global + per-user), minimum order, scope/target
 * match, customer-group match, first-order-only. Reused verbatim by
 * `orders.ts` at checkout so a coupon that stopped being valid between "add
 * to cart" and "place order" is caught server-side either way.
 */
export async function evaluateCoupon(
  coupon: Coupon,
  opts: {
    subtotalToman: number;
    lines: CouponLineInfo[];
    userId: string | null;
    customerGroupId: string | null;
  },
): Promise<CouponEvalResult> {
  if (!coupon.isActive) return { ok: false, error: 'این کد تخفیف غیرفعال است.' };

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    return { ok: false, error: 'این کد تخفیف هنوز فعال نشده است.' };
  }
  if (coupon.endsAt && coupon.endsAt < now) {
    return { ok: false, error: 'مهلت استفاده از این کد تخفیف به پایان رسیده است.' };
  }

  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, error: 'ظرفیت استفاده از این کد تخفیف تکمیل شده است.' };
  }

  if (coupon.minOrderToman > 0 && opts.subtotalToman < coupon.minOrderToman) {
    return { ok: false, error: 'مبلغ سبد خرید برای استفاده از این کد تخفیف کافی نیست.' };
  }

  if (coupon.scope !== 'GLOBAL' && coupon.targetId) {
    const matches = opts.lines.some(
      (l) =>
        l.variantId === coupon.targetId ||
        l.categoryId === coupon.targetId ||
        l.brandId === coupon.targetId ||
        l.supplierId === coupon.targetId,
    );
    if (!matches) return { ok: false, error: 'این کد تخفیف برای اقلام موجود در سبد شما قابل استفاده نیست.' };
  }

  if (coupon.customerGroupId) {
    if (!opts.userId || opts.customerGroupId !== coupon.customerGroupId) {
      return { ok: false, error: 'این کد تخفیف مخصوص گروه مشتریان خاصی است.' };
    }
  }

  if (coupon.firstOrderOnly) {
    if (!opts.userId) return { ok: false, error: 'این کد تخفیف فقط برای سفارش اول با حساب کاربری قابل استفاده است.' };
    const priorOrders = await db.order.count({
      where: { userId: opts.userId, paymentStatus: 'PAID' },
    });
    if (priorOrders > 0) return { ok: false, error: 'این کد تخفیف فقط برای اولین سفارش شما معتبر است.' };
  }

  if (opts.userId) {
    const redemptions = await db.couponRedemption.count({ where: { couponId: coupon.id, userId: opts.userId } });
    if (redemptions >= coupon.perUserLimit) {
      return { ok: false, error: 'شما پیش‌تر از این کد تخفیف استفاده کرده‌اید.' };
    }
  }

  return { ok: true };
}

function toCouponInput(coupon: Coupon): CouponInput {
  return {
    type: coupon.type,
    value: coupon.value,
    maxDiscountToman: coupon.maxDiscountToman,
    minOrderToman: coupon.minOrderToman,
  };
}

// ── Types returned to the caller ──────────────────────────────────

export type CartLineView = {
  id: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantName: string;
  posterPath: string | null;
  qty: number;
  minQty: number;
  maxQty: number;
  unitPriceToman: number;
  lineTotalToman: number;
  available: number;
  inStock: boolean;
  priceChanged: boolean;
  requiresRegionAck: boolean;
  regionAcknowledged: boolean;
};

export type CartView = {
  ok: true;
  cartId: string;
  isGuest: boolean;
  lines: CartLineView[];
  couponCode: string | null;
  couponError: string | null;
  needsRegionAck: boolean;
  totals: ReturnType<typeof computeTotals>;
};

async function hydrate(resolved: ResolvedCart, opts: { useWallet?: boolean } = {}): Promise<CartView> {
  const user = await getSessionUser();

  const items = await db.cartItem.findMany({
    where: { cartId: resolved.cartId },
    include: {
      variant: {
        include: {
          product: { include: { media: { where: { kind: 'POSTER' }, take: 1 } } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const availability = await availabilityFor(items.map((i) => i.variantId));

  const lines: CartLineView[] = [];
  for (const item of items) {
    const variant = item.variant;
    const product = variant.product;
    const unitPriceToman = await resolveUnitPrice(variant, item.qty, user?.customerGroupId);
    const priceChanged = unitPriceToman !== item.unitPriceToman;
    if (priceChanged) {
      await db.cartItem.update({ where: { id: item.id }, data: { unitPriceToman } });
    }
    const effectiveMax = Math.min(product.maxOrderQty, variant.maxQty);
    const effectiveMin = Math.max(product.minOrderQty, variant.minQty);
    lines.push({
      id: item.id,
      variantId: variant.id,
      productId: product.id,
      productSlug: product.slug,
      productName: product.nameFa,
      variantName: variant.nameFa,
      posterPath: product.media[0]?.path ?? null,
      qty: item.qty,
      minQty: effectiveMin,
      maxQty: effectiveMax,
      unitPriceToman,
      lineTotalToman: unitPriceToman * item.qty,
      available: availability[variant.id] ?? 0,
      inStock: (availability[variant.id] ?? 0) >= item.qty,
      priceChanged,
      requiresRegionAck: product.requiresRegionAck,
      regionAcknowledged: item.regionAcknowledged,
    });
  }

  const cartRow = await db.cart.findUnique({ where: { id: resolved.cartId }, select: { couponCode: true } });
  let couponCode: string | null = null;
  let couponError: string | null = null;
  let couponForTotals: CouponInput | null = null;

  const subtotalToman = lines.reduce((acc, l) => acc + l.lineTotalToman, 0);

  if (cartRow?.couponCode) {
    const coupon = await db.coupon.findUnique({ where: { code: cartRow.couponCode } });
    if (!coupon) {
      couponError = 'کد تخفیف اعمال‌شده دیگر معتبر نیست.';
      await db.cart.update({ where: { id: resolved.cartId }, data: { couponCode: null } });
    } else {
      const productRows = await db.product.findMany({
        where: { id: { in: lines.map((l) => l.productId) } },
        select: { id: true, categoryId: true, brandId: true },
      });
      const byProduct = new Map(productRows.map((p) => [p.id, p]));
      const supplierRows = await db.productVariant.findMany({
        where: { id: { in: lines.map((l) => l.variantId) } },
        select: { id: true, supplierId: true },
      });
      const bySupplier = new Map(supplierRows.map((v) => [v.id, v.supplierId]));

      const evalResult = await evaluateCoupon(coupon, {
        subtotalToman,
        userId: resolved.userId,
        customerGroupId: user?.customerGroupId ?? null,
        lines: lines.map((l) => ({
          variantId: l.variantId,
          categoryId: byProduct.get(l.productId)?.categoryId ?? '',
          brandId: byProduct.get(l.productId)?.brandId ?? '',
          supplierId: bySupplier.get(l.variantId) ?? null,
        })),
      });
      if (evalResult.ok) {
        couponCode = coupon.code;
        couponForTotals = toCouponInput(coupon);
      } else {
        couponError = evalResult.error;
        await db.cart.update({ where: { id: resolved.cartId }, data: { couponCode: null } });
      }
    }
  }

  const [taxPercent, feeToman] = await Promise.all([
    getSetting<number>('checkout.taxPercent', 0),
    getSetting<number>('checkout.feeToman', 0),
  ]);

  const totals = computeTotals({
    lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitPriceToman: l.unitPriceToman, unitCostToman: 0 })),
    coupon: couponForTotals,
    taxPercent,
    feeToman,
    walletBalanceToman: user?.walletBalance ?? 0,
    useWallet: !!opts.useWallet,
  });

  return {
    ok: true,
    cartId: resolved.cartId,
    isGuest: resolved.isGuest,
    lines,
    couponCode,
    couponError,
    needsRegionAck: lines.some((l) => l.requiresRegionAck && !l.regionAcknowledged),
    totals,
  };
}

export async function getCart(): Promise<CartView> {
  const resolved = await resolveCart();
  return hydrate(resolved);
}

// ── Mutations ────────────────────────────────────────────────────

type MutationResult = CartView | { ok: false; error: string };

async function loadVariantForCart(variantId: string) {
  return db.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });
}

export async function addToCart(input: FormData | Record<string, unknown>): Promise<MutationResult> {
  const parsed = addToCartSchema.safeParse(toPlainObject(input));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };
  const { variantId, qty, regionAcknowledged } = parsed.data;

  const variant = await loadVariantForCart(variantId);
  if (!variant || !variant.isActive || variant.product.status !== 'ACTIVE') {
    return { ok: false, error: 'این کالا در حال حاضر برای خرید موجود نیست.' };
  }

  const resolved = await resolveCart();
  const existing = await db.cartItem.findUnique({
    where: { cartId_variantId: { cartId: resolved.cartId, variantId } },
  });
  const finalQty = (existing?.qty ?? 0) + qty;

  const effectiveMin = Math.max(variant.product.minOrderQty, variant.minQty);
  const effectiveMax = Math.min(variant.product.maxOrderQty, variant.maxQty);
  if (finalQty < effectiveMin) {
    return { ok: false, error: `حداقل تعداد قابل خرید برای این کالا ${effectiveMin} عدد است.` };
  }
  if (finalQty > effectiveMax) {
    return { ok: false, error: `حداکثر تعداد قابل خرید برای این کالا ${effectiveMax} عدد است.` };
  }

  if (variant.product.requiresRegionAck && !regionAcknowledged && !existing?.regionAcknowledged) {
    return { ok: false, error: 'برای افزودن این کالا باید منطقهٔ مصرف را تأیید کنید.' };
  }

  const availability = await availabilityFor([variantId]);
  if ((availability[variantId] ?? 0) < finalQty) {
    return { ok: false, error: 'موجودی کافی برای این تعداد وجود ندارد.' };
  }

  // Price is ALWAYS recomputed server-side — never trust a client price.
  const cartUser = await getSessionUser();
  const unitPriceToman = await resolveUnitPrice(variant, finalQty, cartUser?.customerGroupId);
  assertToman(unitPriceToman, 'قیمت واحد');

  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId: resolved.cartId, variantId } },
    create: {
      cartId: resolved.cartId,
      variantId,
      qty: finalQty,
      unitPriceToman,
      regionAcknowledged: regionAcknowledged || !!existing?.regionAcknowledged,
    },
    update: {
      qty: finalQty,
      unitPriceToman,
      regionAcknowledged: regionAcknowledged || !!existing?.regionAcknowledged,
    },
  });

  return hydrate(resolved);
}

export async function updateQty(input: FormData | Record<string, unknown>): Promise<MutationResult> {
  const parsed = updateCartQtySchema.safeParse(toPlainObject(input));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };
  const { cartItemId, qty } = parsed.data;

  const resolved = await resolveCart();
  // Ownership check: the item must belong to THIS cart.
  const item = await db.cartItem.findFirst({
    where: { id: cartItemId, cartId: resolved.cartId },
    include: { variant: { include: { product: true } } },
  });
  if (!item) return { ok: false, error: 'این کالا در سبد خرید شما یافت نشد.' };

  const effectiveMin = Math.max(item.variant.product.minOrderQty, item.variant.minQty);
  const effectiveMax = Math.min(item.variant.product.maxOrderQty, item.variant.maxQty);
  if (qty < effectiveMin || qty > effectiveMax) {
    return { ok: false, error: `تعداد باید بین ${effectiveMin} تا ${effectiveMax} باشد.` };
  }

  const availability = await availabilityFor([item.variantId]);
  if ((availability[item.variantId] ?? 0) < qty) {
    return { ok: false, error: 'موجودی کافی برای این تعداد وجود ندارد.' };
  }

  const qtyUser = await getSessionUser();
  const unitPriceToman = await resolveUnitPrice(item.variant, qty, qtyUser?.customerGroupId);
  await db.cartItem.update({ where: { id: item.id }, data: { qty, unitPriceToman } });

  return hydrate(resolved);
}

export async function removeItem(input: FormData | Record<string, unknown>): Promise<MutationResult> {
  const parsed = removeCartItemSchema.safeParse(toPlainObject(input));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  const resolved = await resolveCart();
  await db.cartItem.deleteMany({ where: { id: parsed.data.cartItemId, cartId: resolved.cartId } });
  return hydrate(resolved);
}

export async function clearCart(): Promise<MutationResult> {
  const resolved = await resolveCart();
  await db.$transaction([
    db.cartItem.deleteMany({ where: { cartId: resolved.cartId } }),
    db.cart.update({ where: { id: resolved.cartId }, data: { couponCode: null } }),
  ]);
  return hydrate(resolved);
}

export async function applyCoupon(input: FormData | Record<string, unknown>): Promise<MutationResult> {
  const parsed = applyCouponSchema.safeParse(toPlainObject(input));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  const resolved = await resolveCart();
  const coupon = await db.coupon.findUnique({ where: { code: parsed.data.code } });
  if (!coupon) return { ok: false, error: 'کد تخفیف وارد شده معتبر نیست.' };

  const current = await hydrate(resolved);
  const productRows = await db.product.findMany({
    where: { id: { in: current.lines.map((l) => l.productId) } },
    select: { id: true, categoryId: true, brandId: true },
  });
  const byProduct = new Map(productRows.map((p) => [p.id, p]));
  const supplierRows = await db.productVariant.findMany({
    where: { id: { in: current.lines.map((l) => l.variantId) } },
    select: { id: true, supplierId: true },
  });
  const bySupplier = new Map(supplierRows.map((v) => [v.id, v.supplierId]));
  const user = await getSessionUser();

  const evalResult = await evaluateCoupon(coupon, {
    subtotalToman: current.lines.reduce((acc, l) => acc + l.lineTotalToman, 0),
    userId: resolved.userId,
    customerGroupId: user?.customerGroupId ?? null,
    lines: current.lines.map((l) => ({
      variantId: l.variantId,
      categoryId: byProduct.get(l.productId)?.categoryId ?? '',
      brandId: byProduct.get(l.productId)?.brandId ?? '',
      supplierId: bySupplier.get(l.variantId) ?? null,
    })),
  });
  if (!evalResult.ok) return { ok: false, error: evalResult.error };

  await db.cart.update({ where: { id: resolved.cartId }, data: { couponCode: coupon.code } });
  return hydrate(resolved);
}

export async function removeCoupon(): Promise<MutationResult> {
  const resolved = await resolveCart();
  await db.cart.update({ where: { id: resolved.cartId }, data: { couponCode: null } });
  return hydrate(resolved);
}

/**
 * Merges a guest cart into a user's cart on login/registration. If the user
 * has no cart yet, the guest cart is simply reassigned to them (cheapest,
 * preserves creation timestamps). Otherwise line items are summed (capped at
 * each variant's max order quantity) and the now-empty guest cart is removed.
 */
export async function mergeGuestCart(sessionKey: string, userId: string): Promise<void> {
  const guestCart = await db.cart.findUnique({ where: { sessionKey }, include: { items: true } });
  if (!guestCart || guestCart.userId === userId) return;

  const userCart = await db.cart.findFirst({ where: { userId } });

  if (!userCart) {
    await db.cart.update({ where: { id: guestCart.id }, data: { userId } });
    return;
  }

  for (const item of guestCart.items) {
    const existing = await db.cartItem.findUnique({
      where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
    });
    const variant = await db.productVariant.findUnique({ where: { id: item.variantId }, include: { product: true } });
    if (!variant) continue;
    const cappedQty = Math.min(
      (existing?.qty ?? 0) + item.qty,
      Math.min(variant.product.maxOrderQty, variant.maxQty),
    );
    await db.cartItem.upsert({
      where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
      create: {
        cartId: userCart.id,
        variantId: item.variantId,
        qty: cappedQty,
        unitPriceToman: item.unitPriceToman,
        regionAcknowledged: item.regionAcknowledged || !!existing?.regionAcknowledged,
      },
      update: {
        qty: cappedQty,
        regionAcknowledged: item.regionAcknowledged || !!existing?.regionAcknowledged,
      },
    });
  }

  await db.cart.delete({ where: { id: guestCart.id } });
}

/** Internal helper for `orders.ts`: the resolved cart id/lines used at checkout. */
export async function getActiveCartForCheckout(): Promise<{
  cartId: string;
  userId: string | null;
  isGuest: boolean;
}> {
  const resolved = await resolveCart();
  return { cartId: resolved.cartId, userId: resolved.userId, isGuest: resolved.isGuest };
}

export async function clearCartById(cartId: string): Promise<void> {
  await db.$transaction([
    db.cartItem.deleteMany({ where: { cartId } }),
    db.cart.update({ where: { id: cartId }, data: { couponCode: null } }),
  ]);
}
