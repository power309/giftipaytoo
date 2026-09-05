'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertPermission } from '@/server/auth/guard';

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

const decisionSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(500).optional().nullable(),
});

export async function decideApproval(input: unknown): Promise<ActionResult> {
  const actor = await assertPermission('pricing.approve');
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ورودی نامعتبر است.' };
  if (parsed.data.decision === 'REJECTED' && !parsed.data.note) {
    return { ok: false, error: 'برای رد درخواست، ذکر دلیل الزامی است.' };
  }

  try {
    const { applyApproval } = await import('@/server/pricing-service');
    await applyApproval(parsed.data.approvalId, actor.id, parsed.data.decision, parsed.data.note ?? null);
  } catch (err) {
    if (err instanceof Error && (err.message.includes('یافت نشد') || err.message.includes('بررسی شده'))) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: 'سرویس تأیید قیمت در دسترس نیست.' };
  }

  revalidatePath('/admin/approvals');
  return { ok: true, message: parsed.data.decision === 'APPROVED' ? 'تغییر قیمت تأیید و اعمال شد.' : 'درخواست رد شد.' };
}
