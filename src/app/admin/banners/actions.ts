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

const bannerSchema = z.object({
  id: z.string().optional(),
  titleFa: z.string().min(1, 'عنوان الزامی است.').max(200),
  subtitleFa: z.string().max(300).optional(),
  ctaLabel: z.string().max(60).optional(),
  href: z.string().max(300).optional(),
  imageDesktop: z.string().max(300).optional(),
  imageMobile: z.string().max(300).optional(),
  bgColor: z.string().max(20).optional(),
  position: z.string().min(1).max(60),
  sortOrder: z.coerce.number().int(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  isActive: z.coerce.boolean(),
});

export async function saveBanner(input: z.infer<typeof bannerSchema>): Promise<ActionResult> {
  const parsed = bannerSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const user = await assertPermission('content.manage');
  const d = parsed.data;

  const data = {
    titleFa: d.titleFa, subtitleFa: d.subtitleFa || null, ctaLabel: d.ctaLabel || null, href: d.href || null,
    imageDesktop: d.imageDesktop || null, imageMobile: d.imageMobile || null, bgColor: d.bgColor || null,
    position: d.position, sortOrder: d.sortOrder, startsAt: d.startsAt ? new Date(d.startsAt) : null,
    endsAt: d.endsAt ? new Date(d.endsAt) : null, isActive: d.isActive,
  };

  if (d.id) {
    const before = await db.banner.findUnique({ where: { id: d.id } });
    if (!before) return fail('بنر یافت نشد.');
    await db.banner.update({ where: { id: d.id }, data });
    await audit({ action: 'banner.update', entity: 'Banner', entityId: d.id, actorId: user.id, actorType: 'STAFF', before, after: data });
  } else {
    const created = await db.banner.create({ data });
    await audit({ action: 'banner.create', entity: 'Banner', entityId: created.id, actorId: user.id, actorType: 'STAFF', after: data });
  }
  revalidatePath('/admin/banners');
  return ok(d.id ? 'بنر به‌روزرسانی شد.' : 'بنر ایجاد شد.');
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteBanner(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('content.manage');

  await db.banner.delete({ where: { id: parsed.data.id } });
  await audit({ action: 'banner.delete', entity: 'Banner', entityId: parsed.data.id, actorId: user.id, actorType: 'STAFF' });
  revalidatePath('/admin/banners');
  return ok('بنر حذف شد.');
}
