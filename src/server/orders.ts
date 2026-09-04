'use server';

import type { Prisma } from '@prisma/client';
import { db } from './db';
import { env } from '@/lib/env';
import { computeTotals, type CouponInput } from '@/lib/pricing';
import { formatToman } from '@/lib/money';
import { checkoutInputSchema, toPlainObject, firstZodMessage, paginationSchema } from '@/lib/schemas';
import { enforceRateLimit, RateLimitError } from './rate-limit';
import { audit } from './audit';
import { clientIp, clientUserAgent, getSessionUser } from './auth/session';
import { assertPermission, assertUser } from './auth/guard';
import { getSetting } from './settings';
import { scoreOrder, requiresManualReview, requiresVerification, explainFa } from './risk';
import { evaluateCoupon, resolveUnitPrice, getActiveCartForCheckout, clearCartById } from './cart';
import { makeReference } from '@/lib/utils';
import { logger } from '@/lib/logger';

/**
 * Checkout + order lifecycle.
 *
 * Checkout state machine:
 *
 *   PENDING ──(payable > 0, wallet fully covers)──▶ PAID ──▶ PROCESSING ──▶ COMPLETED
 *      │                                                         │
 *      │  (reservationExpiresAt elapses / never paid)            └─▶ PARTIALLY_FULFILLED ──▶ COMPLETED
 *      ├──▶ EXPIRED
 *      │
 *      ├──(customer/staff cancels before payment)──▶ CANCELED
 *      │
 *      ├──(risk engine)──▶ UNDER_REVIEW ──(staff clears)──▶ PROCESSING
 *      │
 *      └──(gateway payment succeeds, verified by payments/**)──▶ PAID ──▶ …
 *
 *   PAID ──(refund)──▶ PARTIALLY_REFUNDED | REFUNDED
 *   any pre-PAID state ──(payment fails)──▶ FAILED
 *
 * See docs/ORDERS.md for the full diagram and every transition's guard.
 */

const RESERVATION_MINUTES = env.limits.cartReservationMinutes;

// ── Lazy seams ──────────────────────────────────────────────────

type ShortageLine = { variantId: string; productNameFa: string; requested: number; available: number };

class ShortageError extends Error {
  constructor(public readonly shortage: ShortageLine[]) {
    super('موجودی برای برخی از اقلام سفارش شما کافی نیست.');
    this.name = 'ShortageError';
  }
}

type InventoryReservationModule = {
  reserveInventory?: (opts: {
    orderId: string;
    lines: { variantId: string; qty: number }[];
    minutes: number;
  }) => Promise<{ ok: boolean; shortage?: { variantId: string; available: number }[] }>;
  releaseReservation?: (orderId: string) => Promise<void>;
};

async function loadInventoryReservationModule(): Promise<InventoryReservationModule | null> {
  try {
    return (await import('@/server/inventory/reservation')) as InventoryReservationModule;
  } catch {
    return null;
  }
}

/**
 * Reserves inventory for the given order lines, inside the same transaction
 * that creates the order. Prefers the inventory agent's own module; falls
 * back to a direct, race-safe reservation against `InventoryItem` (row-level
 * `FOR UPDATE SKIP LOCKED`, mirroring `jobs/queue.ts`'s claim pattern) so
 * checkout works honestly before that module lands.
 */
async function reserveInventoryTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  lines: { variantId: string; qty: number; productNameFa: string }[],
  minutes: number,
): Promise<void> {
  const mod = await loadInventoryReservationModule();
  if (mod && typeof mod.reserveInventory === 'function') {
    try {
      const res = await mod.reserveInventory({
        orderId,
        lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
        minutes,
      });
      if (res && typeof res === 'object' && 'ok' in res) {
        if (res.ok) return;
        const byVariant = new Map((res.shortage ?? []).map((s) => [s.variantId, s.available]));
        throw new ShortageError(
          lines
            .filter((l) => byVariant.has(l.variantId))
            .map((l) => ({
              variantId: l.variantId,
              productNameFa: l.productNameFa,
              requested: l.qty,
              available: byVariant.get(l.variantId) ?? 0,
            })),
        );
      }
    } catch (err) {
      if (err instanceof ShortageError) throw err;
      logger.warn('orders: inventory/reservation.reserveInventory failed, using direct fallback', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const shortage: ShortageLine[] = [];
  for (const line of lines) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "public"."inventory_items"
      WHERE "variantId" = ${line.variantId} AND status = 'AVAILABLE'::"public"."InventoryStatus"
      ORDER BY "createdAt" ASC
      LIMIT ${line.qty}
      FOR UPDATE SKIP LOCKED
    `;
    if (rows.length < line.qty) {
      shortage.push({ variantId: line.variantId, productNameFa: line.productNameFa, requested: line.qty, available: rows.length });
      continue;
    }
    await tx.inventoryItem.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: {
        status: 'RESERVED',
        reservedUntil: new Date(Date.now() + minutes * 60_000),
        reservedForOrderId: orderId,
      },
    });
  }
  if (shortage.length > 0) throw new ShortageError(shortage);
}

async function releaseReservation(orderId: string): Promise<void> {
  const mod = await loadInventoryReservationModule();
  if (mod && typeof mod.releaseReservation === 'function') {
    try {
      await mod.releaseReservation(orderId);
      return;
    } catch (err) {
      logger.warn('orders: inventory/reservation.releaseReservation failed, using direct fallback', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  await db.inventoryItem.updateMany({
    where: { reservedForOrderId: orderId, status: 'RESERVED' },
    data: { status: 'AVAILABLE', reservedUntil: null, reservedForOrderId: null },
  });
}

/**
 * Refuses checkout when a line's price hasn't been refreshed recently
 * enough to be trusted. Prefers the pricing agent's own guard; falls back
 * to checking `ProductVariant.priceUpdatedAt` against `pricing.staleHours`.
 */
async function checkPricingStaleness(variantIds: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const mod: Record<string, unknown> = await import('@/server/pricing-service');
    if (typeof mod.checkoutPricingGuard === 'function') {
      const res = (await (mod.checkoutPricingGuard as (opts: unknown) => Promise<unknown>)({ variantIds })) as
        | { ok: boolean; error?: string }
        | undefined;
      if (res && typeof res === 'object' && 'ok' in res) {
        return res.ok
          ? { ok: true }
          : { ok: false, error: res.error ?? 'قیمت برخی از اقلام سبد خرید نیاز به به‌روزرسانی دارد؛ صفحه را تازه کنید.' };
      }
    }
  } catch (err) {
    logger.warn('orders: pricing-service.checkoutPricingGuard unavailable, using direct staleness fallback', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const staleHours = await getSetting<number>('pricing.staleHours', env.limits.priceStaleBlockHours);
  const cutoff = new Date(Date.now() - staleHours * 3600_000);
  const stale = await db.productVariant.findFirst({
    where: { id: { in: variantIds }, autoPrice: true, OR: [{ priceUpdatedAt: null }, { priceUpdatedAt: { lt: cutoff } }] },
    select: { id: true },
  });
  if (stale) {
    return {
      ok: false,
      error: 'قیمت یک یا چند کالای سبد خرید شما به‌روزرسانی نشده است؛ لطفاً چند لحظه دیگر دوباره تلاش کنید.',
    };
  }
  return { ok: true };
}

async function enqueueFulfillment(orderId: string): Promise<void> {
  try {
    const { enqueue } = await import('./jobs/queue');
    await enqueue('fulfill-order', { orderId }, { idempotencyKey: `fulfill:${orderId}` });
  } catch (err) {
    logger.error('orders: could not enqueue fulfill-order job', {
      orderId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function generateUniqueOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const candidate = makeReference('GP');
    const clash = await tx.order.findUnique({ where: { orderNumber: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  return `${makeReference('GP')}${Date.now().toString(36).toUpperCase()}`;
}

// ── Checkout ─────────────────────────────────────────────────────

export type CreateOrderResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      payableToman: number;
      needsReview: boolean;
      riskMessage: string;
    }
  | { ok: false; error: string; shortage?: ShortageLine[] };

export async function createOrderFromCart(input: FormData | Record<string, unknown>): Promise<CreateOrderResult> {
  const ip = await clientIp();
  const userAgent = await clientUserAgent();
  const sessionUser = await getSessionUser();

  try {
    await enforceRateLimit('checkout.create', sessionUser?.id ?? ip);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  const parsed = checkoutInputSchema.safeParse(toPlainObject(input));
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };
  const data = parsed.data;

  const guestCheckoutEnabled = await getSetting<boolean>('checkout.guestCheckoutEnabled', true);
  if (!sessionUser && !guestCheckoutEnabled) {
    return { ok: false, error: 'خرید بدون ثبت‌نام غیرفعال است؛ لطفاً وارد حساب کاربری خود شوید.' };
  }
  if (!sessionUser && !data.guestContact) {
    return { ok: false, error: 'برای خرید مهمان، وارد کردن ایمیل یا شماره موبایل الزامی است.' };
  }

  const { cartId, userId, isGuest } = await getActiveCartForCheckout();

  const items = await db.cartItem.findMany({
    where: { cartId },
    include: { variant: { include: { product: true } } },
    orderBy: { createdAt: 'asc' },
  });
  if (items.length === 0) return { ok: false, error: 'سبد خرید شما خالی است.' };

  type Line = {
    variantId: string;
    qty: number;
    unitPriceToman: number;
    unitCostToman: number;
    productId: string;
    productNameFa: string;
    variantNameFa: string;
    productSlug: string;
    posterPath: string | null;
  };
  const lines: Line[] = [];

  for (const item of items) {
    const variant = item.variant;
    const product = variant.product;
    if (!variant.isActive || product.status !== 'ACTIVE') {
      return { ok: false, error: `کالای «${product.nameFa}» دیگر برای خرید موجود نیست.` };
    }
    const effectiveMin = Math.max(product.minOrderQty, variant.minQty);
    const effectiveMax = Math.min(product.maxOrderQty, variant.maxQty);
    if (item.qty < effectiveMin || item.qty > effectiveMax) {
      return { ok: false, error: `تعداد «${product.nameFa}» باید بین ${effectiveMin} تا ${effectiveMax} باشد.` };
    }
    if (product.requiresRegionAck && !item.regionAcknowledged && !data.regionAcknowledged) {
      return { ok: false, error: 'برای تکمیل خرید، تأیید منطقهٔ مصرف کالاهای منطقه‌ای الزامی است.' };
    }
    const unitPriceToman = await resolveUnitPrice(variant, item.qty);
    lines.push({
      variantId: variant.id,
      qty: item.qty,
      unitPriceToman,
      unitCostToman: variant.costPriceToman,
      productId: product.id,
      productNameFa: product.nameFa,
      variantNameFa: variant.nameFa,
      productSlug: product.slug,
      posterPath: null,
    });
  }

  const posters = await db.productMedia.findMany({
    where: { productId: { in: lines.map((l) => l.productId) }, kind: 'POSTER' },
    orderBy: { sortOrder: 'asc' },
  });
  const posterByProduct = new Map<string, string>();
  for (const p of posters) if (p.productId && !posterByProduct.has(p.productId)) posterByProduct.set(p.productId, p.path);
  for (const l of lines) l.posterPath = posterByProduct.get(l.productId) ?? null;

  const subtotalToman = lines.reduce((acc, l) => acc + l.unitPriceToman * l.qty, 0);

  // Coupon: authoritative final re-check (the cart's own check is only a preview).
  const cartRow = await db.cart.findUnique({ where: { id: cartId }, select: { couponCode: true } });
  const coupon = cartRow?.couponCode ? await db.coupon.findUnique({ where: { code: cartRow.couponCode } }) : null;
  let couponInput: CouponInput | null = null;
  if (coupon) {
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
      userId,
      customerGroupId: sessionUser?.customerGroupId ?? null,
      lines: lines.map((l) => ({
        variantId: l.variantId,
        categoryId: byProduct.get(l.productId)?.categoryId ?? '',
        brandId: byProduct.get(l.productId)?.brandId ?? '',
        supplierId: bySupplier.get(l.variantId) ?? null,
      })),
    });
    if (!evalResult.ok) return { ok: false, error: evalResult.error };
    couponInput = {
      type: coupon.type,
      value: coupon.value,
      maxDiscountToman: coupon.maxDiscountToman,
      minOrderToman: coupon.minOrderToman,
    };
  }

  const [taxPercent, feeToman, minOrderToman, maxOrderToman, walletEnabled] = await Promise.all([
    getSetting<number>('checkout.taxPercent', 0),
    getSetting<number>('checkout.feeToman', 0),
    getSetting<number>('checkout.minOrderToman', 0),
    getSetting<number>('checkout.maxOrderToman', 0),
    getSetting<boolean>('checkout.walletEnabled', true),
  ]);

  if (minOrderToman > 0 && subtotalToman < minOrderToman) {
    return { ok: false, error: `حداقل مبلغ سفارش ${formatToman(minOrderToman)} است.` };
  }
  if (maxOrderToman > 0 && subtotalToman > maxOrderToman) {
    return { ok: false, error: `حداکثر مبلغ سفارش ${formatToman(maxOrderToman)} است.` };
  }

  const staleGuard = await checkPricingStaleness(lines.map((l) => l.variantId));
  if (!staleGuard.ok) return { ok: false, error: staleGuard.error };

  const useWallet = !!(data.useWallet && walletEnabled && userId);
  const totals = computeTotals({
    lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitPriceToman: l.unitPriceToman, unitCostToman: l.unitCostToman })),
    coupon: couponInput,
    taxPercent,
    feeToman,
    walletBalanceToman: useWallet ? sessionUser?.walletBalance ?? 0 : 0,
    useWallet,
  });

  const userRow = sessionUser ? await db.user.findUnique({ where: { id: sessionUser.id }, select: { createdAt: true } }) : null;
  const risk = await scoreOrder({
    user: sessionUser
      ? {
          id: sessionUser.id,
          createdAt: userRow?.createdAt ?? new Date(),
          emailVerified: sessionUser.emailVerified,
          phoneVerified: sessionUser.phoneVerified,
        }
      : null,
    ip,
    userAgent,
    lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitPriceToman: l.unitPriceToman })),
    totalToman: totals.totalToman,
    isGuest,
  });

  const needsReview = await requiresManualReview(risk.score);
  const needsVerification = await requiresVerification(risk.score);
  if (needsVerification && sessionUser && !sessionUser.emailVerified && !sessionUser.phoneVerified) {
    return { ok: false, error: explainFa(risk.flags) };
  }

  try {
    const { order, payableToman } = await db.$transaction(async (tx) => {
      const orderNumber = await generateUniqueOrderNumber(tx);
      const created = await tx.order.create({
        data: {
          orderNumber,
          userId: userId ?? null,
          guestEmail: !userId ? data.guestContact?.email || null : null,
          guestPhone: !userId ? data.guestContact?.mobile || null : null,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          fulfillmentStatus: 'UNFULFILLED',
          subtotalToman: totals.subtotalToman,
          discountToman: totals.discountToman,
          taxToman: totals.taxToman,
          feeToman: totals.feeToman,
          walletAppliedToman: 0,
          totalToman: totals.totalToman,
          costTotalToman: totals.costTotalToman,
          couponId: coupon?.id ?? null,
          couponCode: coupon?.code ?? null,
          ip,
          userAgent: userAgent.slice(0, 400),
          riskScore: risk.score,
          riskFlags: risk.flags as unknown as Prisma.InputJsonValue,
          needsReview,
          termsAcceptedAt: new Date(),
          regionAckAt: data.regionAcknowledged ? new Date() : null,
          reservationExpiresAt: new Date(Date.now() + RESERVATION_MINUTES * 60_000),
          items: {
            create: lines.map((l) => ({
              variantId: l.variantId,
              productNameFa: l.productNameFa,
              variantNameFa: l.variantNameFa,
              productSlug: l.productSlug,
              posterPath: l.posterPath,
              qty: l.qty,
              unitPriceToman: l.unitPriceToman,
              unitCostToman: l.unitCostToman,
              lineTotalToman: l.unitPriceToman * l.qty,
            })),
          },
        },
      });

      await reserveInventoryTx(
        tx,
        created.id,
        lines.map((l) => ({ variantId: l.variantId, qty: l.qty, productNameFa: l.productNameFa })),
        RESERVATION_MINUTES,
      );

      if (coupon) {
        await tx.couponRedemption.create({
          data: { couponId: coupon.id, userId: userId ?? null, orderId: created.id, discountToman: totals.discountToman },
        });
        await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: created.id,
          fromStatus: null,
          toStatus: 'PENDING',
          field: 'status',
          actorId: userId ?? null,
          actorType: userId ? 'USER' : 'SYSTEM',
        },
      });

      let walletAppliedToman = 0;
      if (useWallet && totals.walletAppliedToman > 0 && userId) {
        const guarded = await tx.user.updateMany({
          where: { id: userId, walletBalance: { gte: totals.walletAppliedToman } },
          data: { walletBalance: { decrement: totals.walletAppliedToman } },
        });
        if (guarded.count === 0) throw new Error('موجودی کیف پول برای این سفارش کافی نیست.');
        const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { walletBalance: true } });
        await tx.walletTransaction.create({
          data: {
            userId,
            type: 'DEBIT',
            amountToman: totals.walletAppliedToman,
            balanceAfter: u.walletBalance,
            reason: `پرداخت بخشی از سفارش ${orderNumber} با کیف پول`,
            orderId: created.id,
            idempotencyKey: `order-wallet-debit:${created.id}`,
          },
        });
        walletAppliedToman = totals.walletAppliedToman;
      }

      const payableToman = totals.totalToman - walletAppliedToman;
      const fullyPaidByWallet = payableToman <= 0;

      const updated = await tx.order.update({
        where: { id: created.id },
        data: {
          walletAppliedToman,
          ...(fullyPaidByWallet ? { status: 'PAID', paymentStatus: 'PAID', paidAt: new Date() } : {}),
        },
      });

      if (fullyPaidByWallet) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: created.id,
            fromStatus: 'PENDING',
            toStatus: 'PAID',
            field: 'status',
            actorType: 'SYSTEM',
            note: 'پرداخت کامل سفارش از طریق کیف پول',
          },
        });
      }

      return { order: updated, payableToman };
    });

    if (payableToman <= 0) await enqueueFulfillment(order.id);
    await clearCartById(cartId);

    await audit({
      action: 'order.create',
      entity: 'Order',
      entityId: order.id,
      actorId: userId,
      actorType: userId ? 'USER' : 'SYSTEM',
      ip,
      userAgent,
      summary: `ثبت سفارش ${order.orderNumber}`,
      after: { totalToman: order.totalToman, riskScore: order.riskScore, needsReview },
    });

    return {
      ok: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      payableToman,
      needsReview,
      riskMessage: explainFa(risk.flags),
    };
  } catch (err) {
    if (err instanceof ShortageError) {
      return { ok: false, error: err.message, shortage: err.shortage };
    }
    logger.error('orders: createOrderFromCart failed', { err: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: 'ثبت سفارش با خطا مواجه شد؛ لطفاً دوباره تلاش کنید.' };
  }
}

// ── Lifecycle ────────────────────────────────────────────────────

const CANCELABLE_STATUSES = new Set(['PENDING', 'AWAITING_PAYMENT', 'UNDER_REVIEW']);

export async function cancelOrder(input: { orderId: string; reason?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  const order = await db.order.findUnique({ where: { id: input.orderId } });
  if (!order) return { ok: false, error: 'سفارش یافت نشد.' };

  const isOwner = !!user && order.userId === user.id;
  if (!isOwner) {
    try {
      await assertPermission('order.update');
    } catch {
      return { ok: false, error: 'شما اجازهٔ لغو این سفارش را ندارید.' };
    }
  }

  if (!CANCELABLE_STATUSES.has(order.status)) {
    return { ok: false, error: 'این سفارش دیگر قابل لغو نیست.' };
  }

  await releaseReservation(order.id);

  if (order.walletAppliedToman > 0 && order.userId) {
    const u = await db.user.update({
      where: { id: order.userId },
      data: { walletBalance: { increment: order.walletAppliedToman } },
    });
    await db.walletTransaction.create({
      data: {
        userId: order.userId,
        type: 'CREDIT',
        amountToman: order.walletAppliedToman,
        balanceAfter: u.walletBalance,
        reason: `بازگشت وجه کیف پول برای لغو سفارش ${order.orderNumber}`,
        orderId: order.id,
        idempotencyKey: `order-cancel-refund:${order.id}`,
      },
    });
  }

  await db.$transaction([
    db.order.update({ where: { id: order.id }, data: { status: 'CANCELED', canceledAt: new Date() } }),
    db.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: 'CANCELED',
        field: 'status',
        actorId: user?.id ?? null,
        actorType: user ? (isOwner ? 'USER' : 'STAFF') : 'SYSTEM',
        note: input.reason ?? null,
      },
    }),
  ]);

  await audit({
    action: 'order.cancel',
    entity: 'Order',
    entityId: order.id,
    actorId: user?.id ?? null,
    actorType: user ? 'USER' : 'SYSTEM',
    summary: input.reason ?? 'لغو سفارش',
  });

  return { ok: true };
}

/** Called by the `release-reservation` job for orders whose hold expired unpaid. */
export async function expireOrder(orderId: string): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  if (!['PENDING', 'AWAITING_PAYMENT'].includes(order.status)) return;
  if (!order.reservationExpiresAt || order.reservationExpiresAt > new Date()) return;

  await releaseReservation(order.id);

  if (order.walletAppliedToman > 0 && order.userId) {
    const u = await db.user.update({
      where: { id: order.userId },
      data: { walletBalance: { increment: order.walletAppliedToman } },
    });
    await db.walletTransaction.create({
      data: {
        userId: order.userId,
        type: 'CREDIT',
        amountToman: order.walletAppliedToman,
        balanceAfter: u.walletBalance,
        reason: `بازگشت وجه کیف پول برای انقضای سفارش ${order.orderNumber}`,
        orderId: order.id,
        idempotencyKey: `order-expire-refund:${order.id}`,
      },
    });
  }

  await db.$transaction([
    db.order.update({ where: { id: order.id }, data: { status: 'EXPIRED' } }),
    db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: 'EXPIRED', field: 'status', actorType: 'SYSTEM' },
    }),
  ]);

  await audit({ action: 'order.expire', entity: 'Order', entityId: order.id, actorType: 'SYSTEM' });
}

const ORDER_DETAIL_INCLUDE = {
  items: true,
  statusHistory: { orderBy: { createdAt: 'desc' as const } },
  payments: { select: { id: true, gateway: true, status: true, amountToman: true, verifiedAt: true, createdAt: true } },
  refunds: true,
};

/** Ownership-enforced: the WHERE clause itself excludes any other user's order — no IDOR. */
export async function getOrderForUser(orderId: string) {
  const user = await assertUser();
  const order = await db.order.findFirst({
    where: { id: orderId, userId: user.id },
    include: ORDER_DETAIL_INCLUDE,
  });
  if (!order) return { ok: false as const, error: 'سفارش یافت نشد.' };
  return { ok: true as const, order };
}

export async function getOrderByNumberForGuest(orderNumber: string, contact: { email?: string; mobile?: string }) {
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: { ...ORDER_DETAIL_INCLUDE, user: { select: { email: true, phone: true } } },
  });
  if (!order) return { ok: false as const, error: 'سفارش یافت نشد.' };

  const email = contact.email?.trim().toLowerCase();
  const mobile = contact.mobile?.trim();
  const matches =
    (!!email && (order.guestEmail?.toLowerCase() === email || order.user?.email?.toLowerCase() === email)) ||
    (!!mobile && (order.guestPhone === mobile || order.user?.phone === mobile));

  if (!matches) return { ok: false as const, error: 'سفارش یافت نشد.' };
  return { ok: true as const, order };
}

export async function listUserOrders(input: Record<string, unknown> = {}) {
  const user = await assertUser();
  const { page, perPage } = paginationSchema.parse(input);

  const [total, orders] = await Promise.all([
    db.order.count({ where: { userId: user.id } }),
    db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        totalToman: true,
        createdAt: true,
        items: { select: { productNameFa: true, qty: true, posterPath: true } },
      },
    }),
  ]);

  return { ok: true as const, orders, total, page, perPage };
}

export async function generateInvoice(orderId: string) {
  const user = await getSessionUser();
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, user: true } });
  if (!order) return { ok: false as const, error: 'سفارش یافت نشد.' };

  const isOwner = !!user && order.userId === user.id;
  if (!isOwner) {
    try {
      await assertPermission('order.view');
    } catch {
      return { ok: false as const, error: 'شما اجازهٔ مشاهدهٔ این فاکتور را ندارید.' };
    }
  }

  const snapshot = {
    orderNumber: order.orderNumber,
    issuedAt: new Date().toISOString(),
    buyer: {
      name: order.user ? [order.user.firstName, order.user.lastName].filter(Boolean).join(' ') : null,
      email: order.user?.email ?? order.guestEmail,
      phone: order.user?.phone ?? order.guestPhone,
    },
    items: order.items.map((i) => ({
      name: `${i.productNameFa} — ${i.variantNameFa}`,
      qty: i.qty,
      unitPriceToman: i.unitPriceToman,
      lineTotalToman: i.lineTotalToman,
    })),
    subtotalToman: order.subtotalToman,
    discountToman: order.discountToman,
    taxToman: order.taxToman,
    feeToman: order.feeToman,
    walletAppliedToman: order.walletAppliedToman,
    totalToman: order.totalToman,
  };

  const invoice = await db.invoice.upsert({
    where: { orderId: order.id },
    create: { orderId: order.id, number: `INV-${order.orderNumber}`, snapshot: snapshot as unknown as Prisma.InputJsonValue },
    update: { snapshot: snapshot as unknown as Prisma.InputJsonValue },
  });

  return { ok: true as const, invoice };
}

export async function addStatusHistory(input: {
  orderId: string;
  toStatus: string;
  field?: 'status' | 'paymentStatus' | 'fulfillmentStatus';
  note?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await assertPermission('order.update');
  const field = input.field ?? 'status';

  const order = await db.order.findUnique({ where: { id: input.orderId } });
  if (!order) return { ok: false, error: 'سفارش یافت نشد.' };

  const fromStatus = (order as unknown as Record<string, string>)[field];

  await db.$transaction([
    db.order.update({ where: { id: order.id }, data: { [field]: input.toStatus } as Prisma.OrderUpdateInput }),
    db.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus,
        toStatus: input.toStatus,
        field,
        actorId: staff.id,
        actorType: 'STAFF',
        note: input.note ?? null,
      },
    }),
  ]);

  await audit({
    action: 'order.statusHistory.add',
    entity: 'Order',
    entityId: order.id,
    actorId: staff.id,
    actorType: 'STAFF',
    summary: `${field}: ${fromStatus} → ${input.toStatus}`,
  });

  return { ok: true };
}

export async function setInternalNote(input: { orderId: string; note: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await assertPermission('order.update');
  const order = await db.order.update({ where: { id: input.orderId }, data: { notesInternal: input.note } }).catch(() => null);
  if (!order) return { ok: false, error: 'سفارش یافت نشد.' };
  await audit({ action: 'order.note.internal', entity: 'Order', entityId: order.id, actorId: staff.id, actorType: 'STAFF' });
  return { ok: true };
}

export async function setCustomerNote(input: { orderId: string; note: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  const order = await db.order.findUnique({ where: { id: input.orderId } });
  if (!order) return { ok: false, error: 'سفارش یافت نشد.' };

  const isOwner = !!user && order.userId === user.id;
  if (!isOwner) {
    try {
      await assertPermission('order.update');
    } catch {
      return { ok: false, error: 'شما اجازهٔ ویرایش این سفارش را ندارید.' };
    }
  }

  await db.order.update({ where: { id: order.id }, data: { notesCustomer: input.note } });
  await audit({
    action: 'order.note.customer',
    entity: 'Order',
    entityId: order.id,
    actorId: user?.id ?? null,
    actorType: user ? (isOwner ? 'USER' : 'STAFF') : 'SYSTEM',
  });
  return { ok: true };
}
