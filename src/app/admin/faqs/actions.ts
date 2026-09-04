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

const faqSchema = z.object({
  id: z.string().optional(),
  questionFa: z.string().min(3, 'سؤال الزامی است.').max(400),
  answerFa: z.string().min(1, 'پاسخ نمی‌تواند خالی باشد.').max(3000),
  categoryId: z.string().optional(),
  group: z.string().min(1).max(60),
  sortOrder: z.coerce.number().int(),
  isActive: z.coerce.boolean(),
});

export async function saveFaq(input: z.infer<typeof faqSchema>): Promise<ActionResult> {
  const parsed = faqSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const user = await assertPermission('content.manage');
  const d = parsed.data;

  const data = { questionFa: d.questionFa, answerFa: d.answerFa, categoryId: d.categoryId || null, group: d.group, sortOrder: d.sortOrder, isActive: d.isActive };

  if (d.id) {
    const before = await db.faq.findUnique({ where: { id: d.id } });
    if (!before) return fail('سؤال یافت نشد.');
    await db.faq.update({ where: { id: d.id }, data });
    await audit({ action: 'faq.update', entity: 'Faq', entityId: d.id, actorId: user.id, actorType: 'STAFF', before, after: data });
  } else {
    const created = await db.faq.create({ data });
    await audit({ action: 'faq.create', entity: 'Faq', entityId: created.id, actorId: user.id, actorType: 'STAFF', after: data });
  }
  revalidatePath('/admin/faqs');
  return ok(d.id ? 'سؤال به‌روزرسانی شد.' : 'سؤال ایجاد شد.');
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteFaq(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('content.manage');

  await db.faq.delete({ where: { id: parsed.data.id } });
  await audit({ action: 'faq.delete', entity: 'Faq', entityId: parsed.data.id, actorId: user.id, actorType: 'STAFF' });
  revalidatePath('/admin/faqs');
  return ok('سؤال حذف شد.');
}
