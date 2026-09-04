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

const idSchema = z.object({ reviewId: z.string().min(1) });

export async function approveReview(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('review.moderate');

  await db.review.update({ where: { id: parsed.data.reviewId }, data: { status: 'APPROVED' } });
  await audit({ action: 'review.approve', entity: 'Review', entityId: parsed.data.reviewId, actorId: user.id, actorType: 'STAFF' });
  revalidatePath('/admin/reviews');
  return ok('دیدگاه تأیید شد.');
}

const rejectSchema = z.object({ reviewId: z.string().min(1), reason: z.string().max(300).optional() });

export async function rejectReview(input: z.infer<typeof rejectSchema>): Promise<ActionResult> {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('review.moderate');

  await db.review.update({ where: { id: parsed.data.reviewId }, data: { status: 'REJECTED' } });
  await audit({ action: 'review.reject', entity: 'Review', entityId: parsed.data.reviewId, actorId: user.id, actorType: 'STAFF', summary: parsed.data.reason });
  revalidatePath('/admin/reviews');
  return ok('دیدگاه رد شد.');
}

export async function bulkApproveReviews(ids: string[]): Promise<ActionResult> {
  if (ids.length === 0) return fail('موردی انتخاب نشده است.');
  const user = await assertPermission('review.moderate');

  await db.review.updateMany({ where: { id: { in: ids } }, data: { status: 'APPROVED' } });
  await audit({ action: 'review.bulk-approve', entity: 'Review', actorId: user.id, actorType: 'STAFF', summary: `${ids.length} دیدگاه تأیید شد.`, after: { ids } });
  revalidatePath('/admin/reviews');
  return ok(`${ids.length.toLocaleString('fa-IR')} دیدگاه تأیید شد.`);
}

const replySchema = z.object({ reviewId: z.string().min(1), reply: z.string().min(1, 'متن پاسخ نمی‌تواند خالی باشد.').max(2000) });

export async function replyToReview(input: z.infer<typeof replySchema>): Promise<ActionResult> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const user = await assertPermission('review.moderate');

  await db.review.update({ where: { id: parsed.data.reviewId }, data: { adminReplyFa: parsed.data.reply, adminReplyAt: new Date() } });
  await audit({ action: 'review.reply', entity: 'Review', entityId: parsed.data.reviewId, actorId: user.id, actorType: 'STAFF', summary: parsed.data.reply });
  revalidatePath('/admin/reviews');
  return ok('پاسخ عمومی ثبت شد.');
}

/**
 * Single entry point for the review list's bulk actions — see the note on
 * `BulkAction` in `@/components/admin/data-table`: a Client Component can only
 * receive a Server Action, never a plain callback.
 */
export async function runReviewBulkAction(key: string, ids: string[]): Promise<ActionResult> {
  if (key === 'approve') return bulkApproveReviews(ids);
  return { ok: false, error: 'عملیات ناشناخته است.' };
}
