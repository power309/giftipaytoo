'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { clientIp } from '@/server/auth/session';
import { logger } from '@/lib/logger';
import { makeReference } from '@/lib/utils';
import type { ActionResult } from '@/app/admin/orders/_lib';

/**
 * Order-detail server actions. Every mutation: zod-validated input,
 * `assertPermission()`, `audit()`, and a Persian-language `{ ok, error }`
 * result — never a raw thrown error to the client.
 *
 * The fulfillment/payment engines (`@/server/inventory/fulfillment`,
 * `@/server/inventory/codes`, `@/server/payments/service`) are owned by
 * other agents working concurrently, so every call into them goes through a
 * lazy dynamic import wrapped in try/catch — if one is ever unavailable the
 * action reports that honestly instead of crashing or faking a result.
 */

function fail(error: string): ActionResult {
  return { ok: false, error };
}
function ok(message?: string): ActionResult {
  return { ok: true, message };
}

async function requireActor(permission: Parameters<typeof assertPermission>[0]) {
  const user = await assertPermission(permission);
  const ip = await clientIp().catch(() => null);
  return { user, ip };
}

function revalidateOrder(orderId: string) {
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath('/admin/orders');
  revalidatePath('/admin/reviews-queue');
}

// ── Status change ───────────────────────────────────────────────

const changeStatusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum([
    'PENDING', 'AWAITING_PAYMENT', 'PAID', 'UNDER_REVIEW', 'PROCESSING', 'COMPLETED',
    'PARTIALLY_FULFILLED', 'CANCELED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED',
  ]),
  note: z.string().max(500).optional(),
});

export async function changeOrderStatus(input: z.infer<typeof changeStatusSchema>): Promise<ActionResult> {
  const parsed = changeStatusSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const { user } = await requireActor('order.update');

  const order = await db.order.findUnique({ where: { id: parsed.data.orderId }, select: { id: true, status: true, orderNumber: true } });
  if (!order) return fail('سفارش یافت نشد.');
  if (order.status === parsed.data.status) return ok('وضعیت تغییری نکرد.');

  await db.$transaction([
    db.order.update({ where: { id: order.id }, data: { status: parsed.data.status } }),
    db.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: parsed.data.status,
        field: 'status',
        note: parsed.data.note ?? null,
        actorId: user.id,
        actorType: 'STAFF',
      },
    }),
  ]);

  await audit({
    action: 'order.status.change',
    entity: 'Order',
    entityId: order.id,
    actorId: user.id,
    actorType: 'STAFF',
    summary: `تغییر وضعیت سفارش ${order.orderNumber} از ${order.status} به ${parsed.data.status}`,
    before: { status: order.status },
    after: { status: parsed.data.status },
  });

  revalidateOrder(order.id);
  return ok('وضعیت سفارش به‌روزرسانی شد.');
}

// ── Mark paid manually ──────────────────────────────────────────

const idSchema = z.object({ orderId: z.string().min(1) });

export async function markPaidManually(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const { user, ip } = await requireActor('order.update');

  const order = await db.order.findUnique({ where: { id: parsed.data.orderId } });
  if (!order) return fail('سفارش یافت نشد.');
  if (order.paymentStatus === 'PAID') return fail('این سفارش قبلاً پرداخت‌شده است.');

  const amountToman = order.totalToman - order.walletAppliedToman;
  if (amountToman <= 0) return fail('مبلغی برای پرداخت باقی نمانده است.');

  try {
    const svc = await import('@/server/payments/service');
    let payment = await db.payment.findFirst({
      where: { orderId: order.id, gateway: 'manual', status: { in: ['PENDING', 'PROCESSING'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) {
      const attemptNumber = (await db.payment.count({ where: { orderId: order.id, gateway: 'manual' } })) + 1;
      payment = await db.payment.create({
        data: {
          orderId: order.id,
          gateway: 'manual',
          mode: 'sandbox',
          amountToman,
          status: 'PROCESSING',
          idempotencyKey: `${order.id}:manual:${attemptNumber}`,
        },
      });
    } else if (payment.status === 'PENDING') {
      payment = await db.payment.update({ where: { id: payment.id }, data: { status: 'PROCESSING' } });
    }

    const result = await svc.confirmManualPayment({ paymentId: payment.id, approvedById: user.id, ip });
    if (!result.ok) return fail(result.messageFa);

    revalidateOrder(order.id);
    return ok(result.messageFa);
  } catch (err) {
    logger.error('markPaidManually: payments service unavailable', { err: err instanceof Error ? err.message : String(err) });
    return fail('ماژول پرداخت هنوز آماده نیست؛ بعداً دوباره تلاش کنید.');
  }
}

// ── Cancel / expire ──────────────────────────────────────────────

const cancelSchema = z.object({ orderId: z.string().min(1), reason: z.string().min(3, 'دلیل لغو الزامی است.').max(500) });

export async function cancelOrder(input: z.infer<typeof cancelSchema>): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const { user } = await requireActor('order.update');

  const order = await db.order.findUnique({ where: { id: parsed.data.orderId } });
  if (!order) return fail('سفارش یافت نشد.');
  if (order.status === 'CANCELED') return fail('این سفارش قبلاً لغو شده است.');
  if (order.paymentStatus === 'PAID') {
    return fail('این سفارش پرداخت‌شده است؛ برای لغو ابتدا از طریق بازپرداخت اقدام کنید.');
  }

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELED', paymentStatus: 'CANCELED', canceledAt: new Date(), notesInternal: appendNote(order.notesInternal, user.id, `لغو: ${parsed.data.reason}`) } });
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: 'CANCELED', field: 'status', note: parsed.data.reason, actorId: user.id, actorType: 'STAFF' },
    });
    await tx.jobQueue.upsert({
      where: { idempotencyKey: `release:${order.id}` },
      create: { type: 'release-reservation', payload: { orderId: order.id }, idempotencyKey: `release:${order.id}` },
      update: {},
    }).catch(() => null);
  });

  await audit({ action: 'order.cancel', entity: 'Order', entityId: order.id, actorId: user.id, actorType: 'STAFF', summary: parsed.data.reason });
  revalidateOrder(order.id);
  return ok('سفارش لغو شد.');
}

export async function expireOrder(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const { user } = await requireActor('order.update');

  const order = await db.order.findUnique({ where: { id: parsed.data.orderId } });
  if (!order) return fail('سفارش یافت نشد.');
  if (order.paymentStatus === 'PAID') return fail('سفارش پرداخت‌شده را نمی‌توان منقضی کرد.');

  await db.$transaction([
    db.order.update({ where: { id: order.id }, data: { status: 'EXPIRED', paymentStatus: 'EXPIRED' } }),
    db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: 'EXPIRED', field: 'status', actorId: user.id, actorType: 'STAFF' },
    }),
  ]);

  await audit({ action: 'order.expire', entity: 'Order', entityId: order.id, actorId: user.id, actorType: 'STAFF' });
  revalidateOrder(order.id);
  return ok('سفارش منقضی علامت‌گذاری شد.');
}

// ── Fulfillment actions ──────────────────────────────────────────

const manualFulfillSchema = z.object({
  orderItemId: z.string().min(1),
  code: z.string().min(2, 'کد الزامی است.').max(200),
  serial: z.string().max(100).optional(),
  pin: z.string().max(50).optional(),
});

export async function manualFulfillOrderItem(input: z.infer<typeof manualFulfillSchema>): Promise<ActionResult> {
  const parsed = manualFulfillSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const { user } = await requireActor('order.fulfill');

  const item = await db.orderItem.findUnique({ where: { id: parsed.data.orderItemId }, select: { orderId: true } });
  if (!item) return fail('ردیف سفارش یافت نشد.');

  try {
    const { manualFulfill } = await import('@/server/inventory/fulfillment');
    await manualFulfill({
      orderItemId: parsed.data.orderItemId,
      plaintextCode: parsed.data.code,
      serial: parsed.data.serial,
      pin: parsed.data.pin,
      actorId: user.id,
    });
    revalidateOrder(item.orderId);
    return ok('کد با موفقیت ثبت و تحویل داده شد.');
  } catch (err) {
    logger.error('manualFulfillOrderItem failed', { err: err instanceof Error ? err.message : String(err) });
    return fail(err instanceof Error ? err.message : 'خطا در ثبت تحویل دستی.');
  }
}

const resendSchema = z.object({
  orderItemId: z.string().min(1),
  channel: z.enum(['ACCOUNT', 'EMAIL', 'SMS']),
});

export async function resendOrderItemDelivery(input: z.infer<typeof resendSchema>): Promise<ActionResult> {
  const parsed = resendSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const { user } = await requireActor('order.fulfill');

  const item = await db.orderItem.findUnique({ where: { id: parsed.data.orderItemId }, select: { orderId: true } });
  if (!item) return fail('ردیف سفارش یافت نشد.');

  try {
    const { resendDelivery } = await import('@/server/inventory/fulfillment');
    const res = await resendDelivery({ orderItemId: parsed.data.orderItemId, channel: parsed.data.channel, actorId: user.id });
    revalidateOrder(item.orderId);
    return ok(`ارسال مجدد برای ${res.count.toLocaleString('fa-IR')} کد ثبت شد.`);
  } catch (err) {
    logger.error('resendOrderItemDelivery failed', { err: err instanceof Error ? err.message : String(err) });
    return fail(err instanceof Error ? err.message : 'خطا در ارسال مجدد.');
  }
}

const replaceSchema = z.object({ deliveryId: z.string().min(1), reason: z.string().min(3, 'دلیل الزامی است.').max(500) });

export async function replaceDefectiveDelivery(input: z.infer<typeof replaceSchema>): Promise<ActionResult> {
  const parsed = replaceSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const { user } = await requireActor('order.fulfill');

  const delivery = await db.delivery.findUnique({ where: { id: parsed.data.deliveryId }, select: { orderItem: { select: { orderId: true } } } });
  if (!delivery) return fail('تحویل یافت نشد.');

  try {
    const { replaceDefectiveCode } = await import('@/server/inventory/fulfillment');
    const res = await replaceDefectiveCode({ deliveryId: parsed.data.deliveryId, reason: parsed.data.reason, actorId: user.id });
    revalidateOrder(delivery.orderItem.orderId);
    if (!res.ok) return fail('کد جایگزین موجود نیست؛ سفارش برای بررسی دستی علامت‌گذاری شد.');
    return ok('کد جایگزین صادر و تحویل داده شد.');
  } catch (err) {
    logger.error('replaceDefectiveDelivery failed', { err: err instanceof Error ? err.message : String(err) });
    return fail(err instanceof Error ? err.message : 'خطا در صدور کد جایگزین.');
  }
}

export async function partialFulfillOrder(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const { user } = await requireActor('order.fulfill');

  try {
    const { fulfillOrder } = await import('@/server/inventory/fulfillment');
    const res = await fulfillOrder(parsed.data.orderId);
    if (!res.ok) return fail(res.reason === 'not-paid' ? 'سفارش هنوز پرداخت نشده است.' : 'سفارش یافت نشد.');
    await audit({ action: 'order.partial-fulfill', entity: 'Order', entityId: parsed.data.orderId, actorId: user.id, actorType: 'STAFF' });
    revalidateOrder(parsed.data.orderId);
    if (res.alreadyFulfilled) return ok('سفارش پیش‌تر به‌طور کامل تحویل شده بود.');
    return ok(`${res.delivered.toLocaleString('fa-IR')} قلم تحویل داده شد.${res.manualReview ? ' برخی اقلام نیازمند بررسی دستی است.' : ''}`);
  } catch (err) {
    logger.error('partialFulfillOrder failed', { err: err instanceof Error ? err.message : String(err) });
    return fail('ماژول تحویل هنوز آماده نیست؛ بعداً دوباره تلاش کنید.');
  }
}

// ── Delivery code reveal ─────────────────────────────────────────

const revealSchema = z.object({ inventoryItemId: z.string().min(1) });

export async function revealDeliveryCodeAction(
  input: z.infer<typeof revealSchema>,
): Promise<ActionResult<{ code: string; serial: string | null; pin: string | null }>> {
  const parsed = revealSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const { user, ip } = await requireActor('inventory.reveal');

  try {
    const { revealCode } = await import('@/server/inventory/codes');
    const res = await revealCode({ itemId: parsed.data.inventoryItemId, actorId: user.id, actorType: 'STAFF', ip, reason: 'بررسی سفارش توسط پشتیبانی' });
    return { ok: true, data: { code: res.plaintext, serial: res.serial, pin: res.pin } };
  } catch (err) {
    logger.error('revealDeliveryCodeAction failed', { err: err instanceof Error ? err.message : String(err) });
    return fail('نمایش کد ممکن نشد.');
  }
}

// ── Refunds ───────────────────────────────────────────────────────

const refundRequestSchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().optional(),
  amountToman: z.coerce.number().int().positive('مبلغ نامعتبر است.'),
  reason: z.string().min(3, 'دلیل بازپرداخت الزامی است.').max(500),
  method: z.enum(['WALLET', 'GATEWAY', 'MANUAL']),
  processNow: z.coerce.boolean().optional(),
});

export async function requestOrderRefund(input: z.infer<typeof refundRequestSchema>): Promise<ActionResult> {
  const parsed = refundRequestSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const { user } = await requireActor('order.refund');

  try {
    const svc = await import('@/server/payments/service');
    const res = await svc.requestRefund({
      orderId: parsed.data.orderId,
      paymentId: parsed.data.paymentId ?? null,
      amountToman: parsed.data.amountToman,
      reason: parsed.data.reason,
      method: parsed.data.method,
      requestedById: user.id,
    });
    if (!res.ok) return fail(res.error);

    if (parsed.data.processNow) {
      const processed = await svc.processRefund({ refundId: res.refundId, approvedById: user.id });
      revalidateOrder(parsed.data.orderId);
      revalidatePath('/admin/refunds');
      if (!processed.ok) return fail(`درخواست ثبت شد اما پردازش با خطا مواجه شد: ${processed.error}`);
      return ok('بازپرداخت با موفقیت ثبت و پردازش شد.');
    }

    revalidateOrder(parsed.data.orderId);
    revalidatePath('/admin/refunds');
    return ok('درخواست بازپرداخت ثبت شد.');
  } catch (err) {
    logger.error('requestOrderRefund failed', { err: err instanceof Error ? err.message : String(err) });
    return fail('ماژول بازپرداخت هنوز آماده نیست؛ بعداً دوباره تلاش کنید.');
  }
}

// ── Invoice ───────────────────────────────────────────────────────

export async function regenerateInvoice(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const { user } = await requireActor('order.update');

  const order = await db.order.findUnique({
    where: { id: parsed.data.orderId },
    include: { items: true, user: { select: { firstName: true, lastName: true, email: true, phone: true } }, invoice: true },
  });
  if (!order) return fail('سفارش یافت نشد.');

  const snapshot = {
    orderNumber: order.orderNumber,
    issuedAt: new Date().toISOString(),
    customer: order.user
      ? { name: [order.user.firstName, order.user.lastName].filter(Boolean).join(' '), email: order.user.email, phone: order.user.phone }
      : { name: 'مهمان', email: order.guestEmail, phone: order.guestPhone },
    items: order.items.map((i) => ({ name: i.productNameFa, variant: i.variantNameFa, qty: i.qty, unitPriceToman: i.unitPriceToman, lineTotalToman: i.lineTotalToman })),
    subtotalToman: order.subtotalToman,
    discountToman: order.discountToman,
    taxToman: order.taxToman,
    feeToman: order.feeToman,
    totalToman: order.totalToman,
  };

  const number = order.invoice?.number ?? makeReference('INV');
  await db.invoice.upsert({
    where: { orderId: order.id },
    create: { orderId: order.id, number, snapshot },
    update: { number, snapshot, issuedAt: new Date() },
  });

  await audit({ action: 'order.invoice.regenerate', entity: 'Invoice', entityId: order.id, actorId: user.id, actorType: 'STAFF' });
  revalidateOrder(order.id);
  return ok('فاکتور بازتولید شد.');
}

// ── Notes ─────────────────────────────────────────────────────────

function appendNote(existing: string | null, actorId: string, text: string): string {
  const stamp = new Date().toISOString();
  const line = `[${stamp}] ${text}`;
  return existing ? `${existing}\n${line}` : line;
}

const noteSchema = z.object({ orderId: z.string().min(1), note: z.string().min(1, 'متن یادداشت نمی‌تواند خالی باشد.').max(2000) });

export async function addInternalNote(input: z.infer<typeof noteSchema>): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const { user } = await requireActor('order.update');

  const order = await db.order.findUnique({ where: { id: parsed.data.orderId }, select: { notesInternal: true } });
  if (!order) return fail('سفارش یافت نشد.');

  const notesInternal = appendNote(order.notesInternal, user.id, parsed.data.note);
  await db.order.update({ where: { id: parsed.data.orderId }, data: { notesInternal } });
  await audit({ action: 'order.note.internal', entity: 'Order', entityId: parsed.data.orderId, actorId: user.id, actorType: 'STAFF', summary: parsed.data.note });
  revalidateOrder(parsed.data.orderId);
  return ok('یادداشت داخلی ثبت شد.');
}

export async function addCustomerNote(input: z.infer<typeof noteSchema>): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const { user } = await requireActor('order.update');

  const order = await db.order.findUnique({ where: { id: parsed.data.orderId }, select: { notesCustomer: true } });
  if (!order) return fail('سفارش یافت نشد.');

  const notesCustomer = appendNote(order.notesCustomer, user.id, parsed.data.note);
  await db.order.update({ where: { id: parsed.data.orderId }, data: { notesCustomer } });
  await audit({ action: 'order.note.customer', entity: 'Order', entityId: parsed.data.orderId, actorId: user.id, actorType: 'STAFF', summary: parsed.data.note });
  revalidateOrder(parsed.data.orderId);
  return ok('یادداشت مشتری ثبت شد.');
}

// ── Review flag ───────────────────────────────────────────────────

const reviewSchema = z.object({ orderId: z.string().min(1), reason: z.string().max(500).optional() });

export async function assignOrderForReview(input: z.infer<typeof reviewSchema>): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const { user } = await requireActor('order.review');

  const order = await db.order.findUnique({ where: { id: parsed.data.orderId }, select: { id: true, status: true, needsReview: true } });
  if (!order) return fail('سفارش یافت نشد.');
  if (order.needsReview) return ok('این سفارش هم‌اکنون در صف بررسی است.');

  await db.$transaction([
    db.order.update({ where: { id: order.id }, data: { needsReview: true, status: 'UNDER_REVIEW' } }),
    db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: 'UNDER_REVIEW', field: 'status', note: parsed.data.reason ?? 'ارجاع برای بررسی دستی', actorId: user.id, actorType: 'STAFF' },
    }),
  ]);
  await audit({ action: 'order.review.assign', entity: 'Order', entityId: order.id, actorId: user.id, actorType: 'STAFF', summary: parsed.data.reason });
  revalidateOrder(order.id);
  return ok('سفارش برای بررسی ارجاع شد.');
}

export async function clearOrderReviewFlag(input: z.infer<typeof reviewSchema>): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const { user } = await requireActor('order.review');

  const order = await db.order.findUnique({
    where: { id: parsed.data.orderId },
    include: { items: { select: { qty: true, fulfilledQty: true } } },
  });
  if (!order) return fail('سفارش یافت نشد.');
  if (!order.needsReview) return ok('این سفارش در صف بررسی نبود.');

  const totalQty = order.items.reduce((s, i) => s + i.qty, 0);
  const totalFulfilled = order.items.reduce((s, i) => s + Math.min(i.fulfilledQty, i.qty), 0);
  const allDone = totalQty > 0 && totalFulfilled >= totalQty;
  const anyDone = totalFulfilled > 0;
  const nextStatus = order.paymentStatus !== 'PAID' ? order.status : allDone ? 'COMPLETED' : anyDone ? 'PARTIALLY_FULFILLED' : 'PROCESSING';

  await db.$transaction([
    db.order.update({ where: { id: order.id }, data: { needsReview: false, status: nextStatus } }),
    db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: nextStatus, field: 'status', note: parsed.data.reason ?? 'رفع پرچم بررسی', actorId: user.id, actorType: 'STAFF' },
    }),
  ]);
  await audit({ action: 'order.review.clear', entity: 'Order', entityId: order.id, actorId: user.id, actorType: 'STAFF', summary: parsed.data.reason });
  revalidateOrder(order.id);
  return ok('پرچم بررسی برداشته شد.');
}
