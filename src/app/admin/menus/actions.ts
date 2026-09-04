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
function revalidateMenus() {
  revalidatePath('/admin/menus');
}

const itemSchema = z.object({
  id: z.string().optional(),
  menuKey: z.string().min(1).max(40),
  label: z.string().min(1, 'عنوان الزامی است.').max(80),
  href: z.string().min(1, 'لینک الزامی است.').max(300),
  iconKey: z.string().max(60).optional(),
  parentId: z.string().nullable().optional(),
  isActive: z.coerce.boolean(),
});

export async function saveMenuItem(input: z.infer<typeof itemSchema>): Promise<ActionResult> {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const user = await assertPermission('content.manage');
  const d = parsed.data;

  if (d.id && d.parentId === d.id) return fail('یک آیتم نمی‌تواند زیرمجموعه خودش باشد.');

  if (d.id) {
    const before = await db.menuItem.findUnique({ where: { id: d.id } });
    if (!before) return fail('آیتم منو یافت نشد.');
    await db.menuItem.update({ where: { id: d.id }, data: { label: d.label, href: d.href, iconKey: d.iconKey || null, parentId: d.parentId || null, isActive: d.isActive } });
    await audit({ action: 'menu.update', entity: 'MenuItem', entityId: d.id, actorId: user.id, actorType: 'STAFF', before, after: d });
  } else {
    const maxSort = await db.menuItem.aggregate({ where: { menuKey: d.menuKey, parentId: d.parentId || null }, _max: { sortOrder: true } });
    const created = await db.menuItem.create({
      data: { menuKey: d.menuKey, label: d.label, href: d.href, iconKey: d.iconKey || null, parentId: d.parentId || null, isActive: d.isActive, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 },
    });
    await audit({ action: 'menu.create', entity: 'MenuItem', entityId: created.id, actorId: user.id, actorType: 'STAFF', after: d });
  }
  revalidateMenus();
  return ok(d.id ? 'آیتم منو به‌روزرسانی شد.' : 'آیتم منو ایجاد شد.');
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteMenuItem(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('content.manage');

  const childCount = await db.menuItem.count({ where: { parentId: parsed.data.id } });
  if (childCount > 0) return fail('این آیتم زیرمجموعه دارد؛ ابتدا زیرمجموعه‌ها را حذف یا جابه‌جا کنید.');

  await db.menuItem.delete({ where: { id: parsed.data.id } });
  await audit({ action: 'menu.delete', entity: 'MenuItem', entityId: parsed.data.id, actorId: user.id, actorType: 'STAFF' });
  revalidateMenus();
  return ok('آیتم منو حذف شد.');
}

const moveSchema = z.object({ id: z.string().min(1), direction: z.enum(['up', 'down']) });

export async function moveMenuItem(input: z.infer<typeof moveSchema>): Promise<ActionResult> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('content.manage');

  const item = await db.menuItem.findUnique({ where: { id: parsed.data.id } });
  if (!item) return fail('آیتم منو یافت نشد.');

  const siblings = await db.menuItem.findMany({
    where: { menuKey: item.menuKey, parentId: item.parentId },
    orderBy: { sortOrder: 'asc' },
  });
  const idx = siblings.findIndex((s) => s.id === item.id);
  const swapIdx = parsed.data.direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) return ok();

  const other = siblings[swapIdx];
  await db.$transaction([
    db.menuItem.update({ where: { id: item.id }, data: { sortOrder: other.sortOrder } }),
    db.menuItem.update({ where: { id: other.id }, data: { sortOrder: item.sortOrder } }),
  ]);
  await audit({ action: 'menu.reorder', entity: 'MenuItem', entityId: item.id, actorId: user.id, actorType: 'STAFF' });
  revalidateMenus();
  return ok();
}
