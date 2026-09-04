'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { logger } from '@/lib/logger';
import type { ActionResult } from '@/app/admin/orders/_lib';

function fail(error: string): ActionResult {
  return { ok: false, error };
}
function ok(message?: string): ActionResult {
  return { ok: true, message };
}

function revalidateAll(orderId: string) {
  revalidatePath('/admin/reviews-queue');
  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderId}`);
}

const idSchema = z.object({ orderId: z.string().min(1) });

/** Clears the review flag and, if the order is paid, attempts fulfillment right away. */
export async function approveAndFulfil(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('order.review');

  const order = await db.order.findUnique({
    where: { id: parsed.data.orderId },
    include: { items: { select: { qty: true, fulfilledQty: true } } },
  });
  if (!order) return fail('سفارش یافت نشد.');
  if (!order.needsReview) return fail('این سفارش در صف بررسی نیست.');

  const totalQty = order.items.reduce((s, i) => s + i.qty, 0);
  const totalFulfilled = order.items.reduce((s, i) => s + Math.min(i.fulfilledQty, i.qty), 0);
  const allDone = totalQty > 0 && totalFulfilled >= totalQty;
  const anyDone = totalFulfilled > 0;
  const nextStatus = order.paymentStatus !== 'PAID' ? order.status : allDone ? 'COMPLETED' : anyDone ? 'PARTIALLY_FULFILLED' : 'PROCESSING';

  await db.$transaction([
    db.order.update({ where: { id: order.id }, data: { needsReview: false, status: nextStatus } }),
    db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: nextStatus, field: 'status', note: 'تأیید در صف بررسی ریسک', actorId: user.id, actorType: 'STAFF' },
    }),
  ]);
  await audit({ action: 'order.review.approve', entity: 'Order', entityId: order.id, actorId: user.id, actorType: 'STAFF' });

  let fulfillMessage = '';
  if (order.paymentStatus === 'PAID' && !allDone) {
    try {
      const { fulfillOrder } = await import('@/server/inventory/fulfillment');
      const res = await fulfillOrder(order.id);
      if (res.ok && !res.alreadyFulfilled) {
        fulfillMessage = ` ${res.delivered.toLocaleString('fa-IR')} قلم تحویل داده شد.`;
      }
    } catch (err) {
      logger.error('approveAndFulfil: fulfillment module unavailable', { err: err instanceof Error ? err.message : String(err) });
      fulfillMessage = ' توجه: تحویل خودکار انجام نشد؛ به‌صورت دستی تحویل دهید.';
    }
  }

  revalidateAll(order.id);
  return ok(`سفارش تأیید شد.${fulfillMessage}`);
}

const rejectSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().min(3, 'دلیل رد الزامی است.').max(500),
  method: z.enum(['WALLET', 'GATEWAY', 'MANUAL']).default('WALLET'),
});

/** Cancels the order and, if it was paid, files (and processes) a full refund. */
export async function rejectAndRefund(input: z.infer<typeof rejectSchema>): Promise<ActionResult> {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const user = await assertPermission('order.review');

  const order = await db.order.findUnique({ where: { id: parsed.data.orderId }, include: { refunds: { where: { status: { in: ['PROCESSED', 'APPROVED'] } } } } });
  if (!order) return fail('سفارش یافت نشد.');
  if (!order.needsReview) return fail('این سفارش در صف بررسی نیست.');

  const wasPaid = order.paymentStatus === 'PAID' || order.paymentStatus === 'PARTIALLY_REFUNDED';
  const alreadyRefunded = order.refunds.reduce((s, r) => s + r.amountToman, 0);
  const remaining = order.totalToman - alreadyRefunded;

  await db.$transaction([
    db.order.update({ where: { id: order.id }, data: { needsReview: false, status: 'CANCELED', canceledAt: new Date() } }),
    db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: 'CANCELED', field: 'status', note: `رد در صف بررسی: ${parsed.data.reason}`, actorId: user.id, actorType: 'STAFF' },
    }),
  ]);
  await audit({ action: 'order.review.reject', entity: 'Order', entityId: order.id, actorId: user.id, actorType: 'STAFF', summary: parsed.data.reason });

  let refundMessage = '';
  if (wasPaid && remaining > 0) {
    await assertPermission('order.refund');
    try {
      const svc = await import('@/server/payments/service');
      const req = await svc.requestRefund({
        orderId: order.id,
        amountToman: remaining,
        reason: `رد سفارش در صف بررسی ریسک: ${parsed.data.reason}`,
        method: parsed.data.method,
        requestedById: user.id,
      });
      if (req.ok) {
        const processed = await svc.processRefund({ refundId: req.refundId, approvedById: user.id });
        refundMessage = processed.ok ? ' مبلغ سفارش بازپرداخت شد.' : ` بازپرداخت با خطا مواجه شد: ${processed.error}`;
      } else {
        refundMessage = ` ثبت بازپرداخت با خطا مواجه شد: ${req.error}`;
      }
    } catch (err) {
      logger.error('rejectAndRefund: payments module unavailable', { err: err instanceof Error ? err.message : String(err) });
      refundMessage = ' توجه: بازپرداخت خودکار انجام نشد؛ از بخش بازپرداخت‌ها اقدام کنید.';
    }
  }

  revalidateAll(order.id);
  revalidatePath('/admin/refunds');
  return ok(`سفارش رد و لغو شد.${refundMessage}`);
}
