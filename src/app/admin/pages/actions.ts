'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { slugify } from '@/lib/persian';
import type { ActionResult } from '@/app/admin/orders/_lib';

function fail(error: string): ActionResult {
  return { ok: false, error };
}

const pageSchema = z.object({
  id: z.string().optional(),
  slug: z.string().min(2, 'نشانی الزامی است.').max(120),
  titleFa: z.string().min(2, 'عنوان الزامی است.').max(200),
  contentFa: z.string().min(1, 'محتوا نمی‌تواند خالی باشد.'),
  excerptFa: z.string().max(400).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(400).optional(),
  showInFooter: z.coerce.boolean(),
  sortOrder: z.coerce.number().int(),
});

export async function savePage(input: z.infer<typeof pageSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const user = await assertPermission('content.manage');
  const d = parsed.data;
  const slug = slugify(d.slug) || slugify(d.titleFa);

  const data = {
    slug, titleFa: d.titleFa, contentFa: d.contentFa, excerptFa: d.excerptFa || null,
    status: d.status, seoTitle: d.seoTitle || null, seoDescription: d.seoDescription || null,
    showInFooter: d.showInFooter, sortOrder: d.sortOrder,
  };

  try {
    if (d.id) {
      const before = await db.page.findUnique({ where: { id: d.id } });
      if (!before) return fail('صفحه یافت نشد.');
      await db.page.update({ where: { id: d.id }, data });
      await audit({ action: 'page.update', entity: 'Page', entityId: d.id, actorId: user.id, actorType: 'STAFF', before, after: data });
      revalidatePath('/admin/pages');
      return { ok: true, data: { id: d.id } };
    }
    const created = await db.page.create({ data });
    await audit({ action: 'page.create', entity: 'Page', entityId: created.id, actorId: user.id, actorType: 'STAFF', after: data });
    revalidatePath('/admin/pages');
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    if (err instanceof Error && /Unique constraint/i.test(err.message)) return fail('این نشانی قبلاً استفاده شده است.');
    throw err;
  }
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deletePage(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('content.manage');

  await db.page.delete({ where: { id: parsed.data.id } });
  await audit({ action: 'page.delete', entity: 'Page', entityId: parsed.data.id, actorId: user.id, actorType: 'STAFF' });
  revalidatePath('/admin/pages');
  return { ok: true };
}

export async function deletePageAndRedirect(id: string) {
  await deletePage({ id });
  redirect('/admin/pages');
}
