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

function revalidateRefunds(orderId?: string) {
  revalidatePath('/admin/refunds');
  if (orderId) revalidatePath(`/admin/orders/${orderId}`);
}

const idSchema = z.object({ refundId: z.string().min(1) });

/** Approves a REQUESTED refund without executing it — a second staff member (or the same one) later processes it. */
export async function approveRefund(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('order.refund');

  const refund = await db.refund.findUnique({ where: { id: parsed.data.refundId } });
  if (!refund) return fail('درخواست بازپرداخت یافت نشد.');
  if (refund.status !== 'REQUESTED') return fail('این درخواست در وضعیت قابل تأیید نیست.');

  await db.refund.update({ where: { id: refund.id }, data: { status: 'APPROVED', approvedById: user.id } });
  await audit({ action: 'refund.approve', entity: 'Refund', entityId: refund.id, actorId: user.id, actorType: 'STAFF' });
  revalidateRefunds(refund.orderId);
  return ok('بازپرداخت تأیید شد.');
}

const rejectSchema = z.object({ refundId: z.string().min(1), reason: z.string().min(3, 'دلیل رد الزامی است.').max(500) });

export async function rejectRefund(input: z.infer<typeof rejectSchema>): Promise<ActionResult> {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const user = await assertPermission('order.refund');

  const refund = await db.refund.findUnique({ where: { id: parsed.data.refundId } });
  if (!refund) return fail('درخواست بازپرداخت یافت نشد.');
  if (refund.status !== 'REQUESTED' && refund.status !== 'APPROVED') return fail('این درخواست در وضعیت قابل رد نیست.');

  await db.refund.update({
    where: { id: refund.id },
    data: { status: 'REJECTED', approvedById: user.id, adminNote: parsed.data.reason },
  });
  await audit({ action: 'refund.reject', entity: 'Refund', entityId: refund.id, actorId: user.id, actorType: 'STAFF', summary: parsed.data.reason });
  revalidateRefunds(refund.orderId);
  return ok('درخواست بازپرداخت رد شد.');
}

/** Actually moves money — wallet credit or gateway reverse charge (lazy import: `@/server/payments/service` is owned by another agent). */
export async function processRefundAction(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('order.refund');

  const refund = await db.refund.findUnique({ where: { id: parsed.data.refundId } });
  if (!refund) return fail('درخواست بازپرداخت یافت نشد.');
  if (refund.status !== 'REQUESTED' && refund.status !== 'APPROVED') return fail('این بازپرداخت قابل پردازش نیست.');

  try {
    const svc = await import('@/server/payments/service');
    const res = await svc.processRefund({ refundId: refund.id, approvedById: user.id });
    revalidateRefunds(refund.orderId);
    if (!res.ok) return fail(res.error);
    return ok('بازپرداخت با موفقیت پردازش شد.');
  } catch (err) {
    logger.error('processRefundAction: payments service unavailable', { err: err instanceof Error ? err.message : String(err) });
    return fail('ماژول بازپرداخت هنوز آماده نیست؛ بعداً دوباره تلاش کنید.');
  }
}
