'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import type { ActionResult } from '@/app/admin/orders/_lib';

function fail(error: string): ActionResult {
  return { ok: false, error };
}
function ok(message?: string): ActionResult {
  return { ok: true, message };
}
function revalidateCustomer(id: string) {
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath('/admin/customers');
}

const idSchema = z.object({ userId: z.string().min(1) });

export async function verifyContact(input: z.infer<typeof idSchema> & { channel: 'email' | 'phone' }): Promise<ActionResult> {
  const parsed = z.object({ userId: z.string().min(1), channel: z.enum(['email', 'phone']) }).safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('customer.update');

  const data = parsed.data.channel === 'email' ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() };
  await db.user.update({ where: { id: parsed.data.userId }, data });
  await audit({ action: 'customer.verify', entity: 'User', entityId: parsed.data.userId, actorId: user.id, actorType: 'STAFF', summary: `تأیید دستی ${parsed.data.channel}` });
  revalidateCustomer(parsed.data.userId);
  return ok('تأیید شد.');
}

const statusSchema = z.object({ userId: z.string().min(1), status: z.enum(['ACTIVE', 'SUSPENDED']) });

export async function setCustomerStatus(input: z.infer<typeof statusSchema>): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('customer.update');

  const target = await db.user.findUnique({ where: { id: parsed.data.userId }, select: { status: true } });
  if (!target) return fail('کاربر یافت نشد.');

  await db.user.update({ where: { id: parsed.data.userId }, data: { status: parsed.data.status } });
  if (parsed.data.status === 'SUSPENDED') {
    await db.session.updateMany({ where: { userId: parsed.data.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await audit({
    action: parsed.data.status === 'SUSPENDED' ? 'customer.suspend' : 'customer.activate',
    entity: 'User',
    entityId: parsed.data.userId,
    actorId: user.id,
    actorType: 'STAFF',
    before: { status: target.status },
    after: { status: parsed.data.status },
  });
  revalidateCustomer(parsed.data.userId);
  return ok(parsed.data.status === 'SUSPENDED' ? 'حساب مسدود شد.' : 'حساب فعال شد.');
}

const noteSchema = z.object({ userId: z.string().min(1), note: z.string().min(1, 'متن یادداشت الزامی است.').max(2000) });

/** Customer notes have no dedicated table — recorded as audit entries (`customer.note`) and rendered from the audit trail. */
export async function addCustomerNoteAction(input: z.infer<typeof noteSchema>): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const user = await assertPermission('customer.update');

  await audit({ action: 'customer.note', entity: 'User', entityId: parsed.data.userId, actorId: user.id, actorType: 'STAFF', summary: parsed.data.note });
  revalidateCustomer(parsed.data.userId);
  return ok('یادداشت ثبت شد.');
}

const walletSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(['CREDIT', 'DEBIT']),
  amountToman: z.coerce.number().int().positive('مبلغ باید مثبت باشد.'),
  reason: z.string().min(3, 'دلیل الزامی است.').max(300),
});

export async function adjustWallet(input: z.infer<typeof walletSchema>): Promise<ActionResult> {
  const parsed = walletSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const staff = await assertPermission('customer.wallet');

  const target = await db.user.findUnique({ where: { id: parsed.data.userId }, select: { walletBalance: true } });
  if (!target) return fail('کاربر یافت نشد.');
  if (parsed.data.type === 'DEBIT' && target.walletBalance < parsed.data.amountToman) {
    return fail('موجودی کیف پول کافی نیست.');
  }

  const delta = parsed.data.type === 'CREDIT' ? parsed.data.amountToman : -parsed.data.amountToman;
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: parsed.data.userId }, data: { walletBalance: { increment: delta } } });
    await tx.walletTransaction.create({
      data: {
        userId: parsed.data.userId,
        type: parsed.data.type,
        amountToman: parsed.data.amountToman,
        balanceAfter: updated.walletBalance,
        reason: `${parsed.data.reason} (توسط پشتیبانی)`,
        actorId: staff.id,
      },
    });
    return updated;
  });

  await audit({
    action: 'customer.wallet.adjust',
    entity: 'User',
    entityId: parsed.data.userId,
    actorId: staff.id,
    actorType: 'STAFF',
    summary: `${parsed.data.type === 'CREDIT' ? 'واریز' : 'برداشت'} ${parsed.data.amountToman} تومان: ${parsed.data.reason}`,
    after: { balanceAfter: result.walletBalance },
  });
  revalidateCustomer(parsed.data.userId);
  return ok('کیف پول به‌روزرسانی شد.');
}

const loyaltySchema = z.object({
  userId: z.string().min(1),
  points: z.coerce.number().int().refine((v) => v !== 0, 'مقدار امتیاز نمی‌تواند صفر باشد.'),
  reason: z.string().min(3, 'دلیل الزامی است.').max(300),
});

export async function adjustLoyaltyPoints(input: z.infer<typeof loyaltySchema>): Promise<ActionResult> {
  const parsed = loyaltySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const staff = await assertPermission('customer.wallet');

  const target = await db.user.findUnique({ where: { id: parsed.data.userId }, select: { loyaltyPoints: true } });
  if (!target) return fail('کاربر یافت نشد.');
  if (target.loyaltyPoints + parsed.data.points < 0) return fail('امتیاز کافی برای کسر وجود ندارد.');

  const result = await db.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: parsed.data.userId }, data: { loyaltyPoints: { increment: parsed.data.points } } });
    await tx.loyaltyTransaction.create({
      data: { userId: parsed.data.userId, points: parsed.data.points, balanceAfter: updated.loyaltyPoints, reason: `${parsed.data.reason} (توسط پشتیبانی)` },
    });
    return updated;
  });

  await audit({
    action: 'customer.loyalty.adjust',
    entity: 'User',
    entityId: parsed.data.userId,
    actorId: staff.id,
    actorType: 'STAFF',
    summary: `${parsed.data.points > 0 ? '+' : ''}${parsed.data.points} امتیاز: ${parsed.data.reason}`,
    after: { balanceAfter: result.loyaltyPoints },
  });
  revalidateCustomer(parsed.data.userId);
  return ok('امتیاز وفاداری به‌روزرسانی شد.');
}

const sessionSchema = z.object({ sessionId: z.string().min(1), userId: z.string().min(1) });

export async function revokeCustomerSession(input: z.infer<typeof sessionSchema>): Promise<ActionResult> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const staff = await assertPermission('customer.update');

  await db.session.update({ where: { id: parsed.data.sessionId }, data: { revokedAt: new Date() } });
  await audit({ action: 'customer.session.revoke', entity: 'Session', entityId: parsed.data.sessionId, actorId: staff.id, actorType: 'STAFF' });
  revalidateCustomer(parsed.data.userId);
  return ok('نشست کاربر لغو شد.');
}

export async function anonymizeCustomer(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const staff = await assertPermission('customer.update');

  const target = await db.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return fail('کاربر یافت نشد.');
  if (target.deletedAt) return fail('این حساب پیش‌تر حذف/ناشناس‌سازی شده است.');

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: parsed.data.userId },
      data: {
        firstName: 'کاربر', lastName: 'حذف‌شده', email: null, phone: null, nationalId: null,
        passwordHash: null, twoFactorSecret: null, twoFactorBackup: null, marketingOptIn: false,
        status: 'DELETED', deletedAt: new Date(),
      },
    });
    await tx.session.updateMany({ where: { userId: parsed.data.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.address.deleteMany({ where: { userId: parsed.data.userId } });
  });

  await audit({
    action: 'customer.anonymize',
    entity: 'User',
    entityId: parsed.data.userId,
    actorId: staff.id,
    actorType: 'STAFF',
    summary: 'ناشناس‌سازی حساب مطابق درخواست حریم خصوصی',
  });
  revalidateCustomer(parsed.data.userId);
  return ok('حساب ناشناس‌سازی و غیرفعال شد.');
}
