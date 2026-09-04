'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { encryptSecret } from '@/lib/crypto';
import { slugify } from '@/lib/persian';

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

const supplierSchema = z.object({
  id: z.string().optional(),
  nameFa: z.string().trim().min(1, 'نام تأمین‌کننده الزامی است.').max(160),
  adapterKey: z.enum(['manual', 'http-generic']),
  apiBaseUrl: z.string().trim().url('نشانی معتبر نیست.').max(500).optional().or(z.literal('')),
  // Raw credential fields the client collects — never sent back to the client afterwards.
  apiKey: z.string().trim().max(500).optional(),
  isActive: z.boolean(),
  autoFulfill: z.boolean(),
  notesFa: z.string().trim().max(2000).optional().nullable(),
});

export async function saveSupplier(input: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await assertPermission('supplier.manage');
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.' };
  const d = parsed.data;

  if (d.adapterKey === 'http-generic' && !d.apiBaseUrl) {
    return { ok: false, error: 'برای آداپتور HTTP عمومی، نشانی پایه API الزامی است.' };
  }

  let credentialsEncrypted: string | undefined;
  if (d.adapterKey === 'http-generic' && d.apiKey && d.apiBaseUrl) {
    credentialsEncrypted = encryptSecret(JSON.stringify({ baseUrl: d.apiBaseUrl, apiKey: d.apiKey }));
  }

  if (d.id) {
    const before = await db.supplier.findUnique({ where: { id: d.id } });
    if (!before) return { ok: false, error: 'تأمین‌کننده یافت نشد.' };
    const data = {
      nameFa: d.nameFa,
      adapterKey: d.adapterKey,
      apiBaseUrl: d.apiBaseUrl || null,
      isActive: d.isActive,
      autoFulfill: d.autoFulfill,
      notesFa: d.notesFa || null,
      ...(credentialsEncrypted ? { credentialsEncrypted } : {}),
    };
    await db.supplier.update({ where: { id: d.id }, data });
    await audit({
      action: 'supplier.update',
      entity: 'Supplier',
      entityId: d.id,
      actorId: actor.id,
      actorType: 'STAFF',
      before: { nameFa: before.nameFa, adapterKey: before.adapterKey, isActive: before.isActive },
      after: { nameFa: d.nameFa, adapterKey: d.adapterKey, isActive: d.isActive, credentialsChanged: !!credentialsEncrypted },
    });
    revalidatePath('/admin/suppliers');
    return { ok: true, data: { id: d.id } };
  }

  let slug = slugify(d.nameFa) || `supplier-${Date.now()}`;
  let n = 1;
  while (await db.supplier.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${slugify(d.nameFa)}-${n}`;
  }

  const created = await db.supplier.create({
    data: {
      slug,
      nameFa: d.nameFa,
      adapterKey: d.adapterKey,
      apiBaseUrl: d.apiBaseUrl || null,
      isActive: d.isActive,
      autoFulfill: d.autoFulfill,
      notesFa: d.notesFa || null,
      credentialsEncrypted: credentialsEncrypted ?? null,
    },
  });
  await audit({
    action: 'supplier.create',
    entity: 'Supplier',
    entityId: created.id,
    actorId: actor.id,
    actorType: 'STAFF',
    after: { nameFa: d.nameFa, adapterKey: d.adapterKey, credentialsSet: !!credentialsEncrypted },
  });
  revalidatePath('/admin/suppliers');
  return { ok: true, data: { id: created.id } };
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  const actor = await assertPermission('supplier.manage');
  const supplier = await db.supplier.findUnique({
    where: { id },
    select: { nameFa: true, _count: { select: { variants: true, inventory: true } } },
  });
  if (!supplier) return { ok: false, error: 'تأمین‌کننده یافت نشد.' };
  if (supplier._count.variants > 0 || supplier._count.inventory > 0) {
    return { ok: false, error: 'این تأمین‌کننده به تنوع‌ها یا کدهای انبار متصل است و قابل حذف نیست — به‌جای حذف، غیرفعالش کنید.' };
  }
  await db.supplier.delete({ where: { id } });
  await audit({ action: 'supplier.delete', entity: 'Supplier', entityId: id, actorId: actor.id, actorType: 'STAFF', before: { nameFa: supplier.nameFa } });
  revalidatePath('/admin/suppliers');
  return { ok: true };
}

export async function toggleSupplierActive(id: string, isActive: boolean): Promise<ActionResult> {
  const actor = await assertPermission('supplier.manage');
  const before = await db.supplier.findUnique({ where: { id }, select: { isActive: true } });
  if (!before) return { ok: false, error: 'تأمین‌کننده یافت نشد.' };
  await db.supplier.update({ where: { id }, data: { isActive } });
  await audit({ action: 'supplier.update', entity: 'Supplier', entityId: id, actorId: actor.id, actorType: 'STAFF', before, after: { isActive } });
  revalidatePath('/admin/suppliers');
  return { ok: true };
}

export async function toggleSupplierAutoFulfill(id: string, autoFulfill: boolean): Promise<ActionResult> {
  const actor = await assertPermission('supplier.manage');
  const before = await db.supplier.findUnique({ where: { id }, select: { autoFulfill: true } });
  if (!before) return { ok: false, error: 'تأمین‌کننده یافت نشد.' };
  await db.supplier.update({ where: { id }, data: { autoFulfill } });
  await audit({ action: 'supplier.update', entity: 'Supplier', entityId: id, actorId: actor.id, actorType: 'STAFF', before, after: { autoFulfill } });
  revalidatePath('/admin/suppliers');
  return { ok: true };
}

export type TestConnectionResult = { ok: boolean; message: string; checkedAt: string };

export async function testSupplierConnection(id: string): Promise<ActionResult<TestConnectionResult>> {
  const actor = await assertPermission('supplier.manage');
  const supplier = await db.supplier.findUnique({ where: { id } });
  if (!supplier) return { ok: false, error: 'تأمین‌کننده یافت نشد.' };

  const { getSupplierAdapter } = await import('@/server/suppliers/registry');
  const adapter = getSupplierAdapter(supplier.adapterKey);

  let result: TestConnectionResult;
  if (!adapter.isConfigured(supplier)) {
    result = { ok: false, message: 'این تأمین‌کننده هنوز پیکربندی نشده است (نشانی API یا کلید دسترسی ثبت نشده).', checkedAt: new Date().toISOString() };
  } else if (adapter.checkBalance) {
    const balance = await adapter.checkBalance(supplier);
    result = balance.ok
      ? { ok: true, message: `اتصال موفق بود — موجودی گزارش‌شده: ${balance.balanceToman.toLocaleString('en-US')} تومان`, checkedAt: new Date().toISOString() }
      : { ok: false, message: balance.messageFa, checkedAt: new Date().toISOString() };
  } else {
    result = {
      ok: false,
      message: `آداپتور «${adapter.labelFa}» روش بررسی اتصال (checkBalance) ندارد — فقط می‌توان وضعیت پیکربندی را بررسی کرد که کامل است.`,
      checkedAt: new Date().toISOString(),
    };
  }

  await audit({
    action: 'supplier.test-connection',
    entity: 'Supplier',
    entityId: id,
    actorId: actor.id,
    actorType: 'STAFF',
    summary: result.message,
    after: { ok: result.ok },
  });

  return { ok: true, data: result };
}
