'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { slugify } from '@/lib/persian';

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let slug = slugify(base) || `برند-${Date.now()}`;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await db.brand.findFirst({ where: { slug, NOT: ignoreId ? { id: ignoreId } : undefined } });
    if (!exists) return slug;
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
}

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'کد رنگ باید به‌صورت #rrggbb باشد.')
  .nullable()
  .optional();

const brandSchema = z.object({
  id: z.string().min(1).optional(),
  nameFa: z.string().trim().min(1, 'نام فارسی الزامی است.').max(120),
  nameEn: z.string().trim().min(1, 'نام انگلیسی الزامی است.').max(120),
  descriptionFa: z.string().trim().max(2000).optional().nullable(),
  logoKey: z.string().trim().max(500).optional().nullable(),
  bannerKey: z.string().trim().max(500).optional().nullable(),
  accentColor: hexColor,
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  seoTitle: z.string().trim().max(200).optional().nullable(),
  seoDescription: z.string().trim().max(400).optional().nullable(),
});

export async function saveBrand(input: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await assertPermission('taxonomy.manage');
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.' };
  const { id, ...rest } = parsed.data;

  if (id) {
    const before = await db.brand.findUnique({ where: { id } });
    if (!before) return { ok: false, error: 'برند یافت نشد.' };
    const data = {
      nameFa: rest.nameFa,
      nameEn: rest.nameEn,
      descriptionFa: rest.descriptionFa ?? null,
      logoKey: rest.logoKey ?? null,
      bannerKey: rest.bannerKey ?? null,
      accentColor: rest.accentColor ?? null,
      isActive: rest.isActive ?? before.isActive,
      isFeatured: rest.isFeatured ?? before.isFeatured,
      seoTitle: rest.seoTitle ?? null,
      seoDescription: rest.seoDescription ?? null,
    };
    await db.brand.update({ where: { id }, data });
    await audit({ action: 'brand.update', entity: 'Brand', entityId: id, actorId: actor.id, actorType: 'STAFF', before, after: { ...before, ...data } });
    revalidatePath('/admin/brands');
    return { ok: true, data: { id } };
  }

  const slug = await uniqueSlug(rest.nameFa);
  const created = await db.brand.create({
    data: {
      slug,
      nameFa: rest.nameFa,
      nameEn: rest.nameEn,
      descriptionFa: rest.descriptionFa ?? null,
      logoKey: rest.logoKey ?? null,
      bannerKey: rest.bannerKey ?? null,
      accentColor: rest.accentColor ?? null,
      isActive: rest.isActive ?? true,
      isFeatured: rest.isFeatured ?? false,
      seoTitle: rest.seoTitle ?? null,
      seoDescription: rest.seoDescription ?? null,
    },
    select: { id: true },
  });
  await audit({ action: 'brand.create', entity: 'Brand', entityId: created.id, actorId: actor.id, actorType: 'STAFF', after: rest });
  revalidatePath('/admin/brands');
  return { ok: true, data: { id: created.id } };
}

const deleteSchema = z.object({ id: z.string().min(1), reassignToId: z.string().min(1).nullable().optional() });

export async function deleteBrand(input: unknown): Promise<ActionResult> {
  const actor = await assertPermission('taxonomy.manage');
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ورودی نامعتبر است.' };
  const { id, reassignToId } = parsed.data;

  const brand = await db.brand.findUnique({ where: { id }, select: { id: true, nameFa: true, _count: { select: { products: true } } } });
  if (!brand) return { ok: false, error: 'برند یافت نشد.' };

  if (brand._count.products > 0) {
    if (!reassignToId) {
      return {
        ok: false,
        error: `این برند دارای ${brand._count.products.toLocaleString('fa-IR')} محصول است و قابل حذف نیست. یک برند جایگزین انتخاب کنید.`,
      };
    }
    if (reassignToId === id) return { ok: false, error: 'برند جایگزین نمی‌تواند همان برند حذف‌شونده باشد.' };
    const target = await db.brand.findUnique({ where: { id: reassignToId }, select: { id: true } });
    if (!target) return { ok: false, error: 'برند جایگزین یافت نشد.' };
    await db.product.updateMany({ where: { brandId: id }, data: { brandId: reassignToId } });
  }

  await db.brand.delete({ where: { id } });
  await audit({
    action: 'brand.delete',
    entity: 'Brand',
    entityId: id,
    actorId: actor.id,
    actorType: 'STAFF',
    before: { nameFa: brand.nameFa, productCount: brand._count.products },
  });
  revalidatePath('/admin/brands');
  return { ok: true };
}

export async function toggleBrandActive(id: string, isActive: boolean): Promise<ActionResult> {
  const actor = await assertPermission('taxonomy.manage');
  const before = await db.brand.findUnique({ where: { id }, select: { isActive: true } });
  if (!before) return { ok: false, error: 'برند یافت نشد.' };
  await db.brand.update({ where: { id }, data: { isActive } });
  await audit({ action: 'brand.update', entity: 'Brand', entityId: id, actorId: actor.id, actorType: 'STAFF', before, after: { isActive } });
  revalidatePath('/admin/brands');
  return { ok: true };
}
