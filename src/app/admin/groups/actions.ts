'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { slugify } from '@/lib/persian';
import type { ActionResult } from '@/app/admin/orders/_lib';

function fail(error: string): ActionResult {
  return { ok: false, error };
}
function ok(message?: string): ActionResult {
  return { ok: true, message };
}

const groupSchema = z.object({
  id: z.string().optional(),
  nameFa: z.string().min(2, 'نام گروه الزامی است.').max(120),
  description: z.string().max(500).optional(),
  discountPercent: z.coerce.number().int().min(0).max(100),
  isReseller: z.coerce.boolean(),
  minSpendToman: z.coerce.number().int().min(0),
  priority: z.coerce.number().int().min(0).max(1000),
  isActive: z.coerce.boolean(),
});

export async function saveCustomerGroup(input: z.infer<typeof groupSchema>): Promise<ActionResult> {
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const user = await assertPermission('customer.update');
  const d = parsed.data;

  const data = {
    nameFa: d.nameFa,
    description: d.description || null,
    discountPercent: d.discountPercent,
    isReseller: d.isReseller,
    minSpendToman: d.minSpendToman,
    priority: d.priority,
    isActive: d.isActive,
  };

  if (d.id) {
    const before = await db.customerGroup.findUnique({ where: { id: d.id } });
    if (!before) return fail('گروه یافت نشد.');
    await db.customerGroup.update({ where: { id: d.id }, data });
    await audit({ action: 'customer-group.update', entity: 'CustomerGroup', entityId: d.id, actorId: user.id, actorType: 'STAFF', before, after: data });
  } else {
    let slug = slugify(d.nameFa) || `group-${Date.now()}`;
    const existing = await db.customerGroup.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;
    const created = await db.customerGroup.create({ data: { ...data, slug } });
    await audit({ action: 'customer-group.create', entity: 'CustomerGroup', entityId: created.id, actorId: user.id, actorType: 'STAFF', after: data });
  }

  revalidatePath('/admin/groups');
  return ok(d.id ? 'گروه به‌روزرسانی شد.' : 'گروه ایجاد شد.');
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteCustomerGroup(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('customer.update');

  const memberCount = await db.user.count({ where: { customerGroupId: parsed.data.id } });
  if (memberCount > 0) return fail(`این گروه ${memberCount.toLocaleString('fa-IR')} عضو دارد؛ ابتدا اعضا را جابه‌جا کنید یا گروه را غیرفعال کنید.`);

  await db.customerGroup.delete({ where: { id: parsed.data.id } });
  await audit({ action: 'customer-group.delete', entity: 'CustomerGroup', entityId: parsed.data.id, actorId: user.id, actorType: 'STAFF' });
  revalidatePath('/admin/groups');
  return ok('گروه حذف شد.');
}
