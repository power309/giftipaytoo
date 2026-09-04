'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { slugify, buildSearchKeywords } from '@/lib/persian';
import { productFormSchema, type ProductFormValue } from '@/components/admin/product-form/types';

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// Uniqueness checks (used for the live slug/SKU checks in the form)
// ─────────────────────────────────────────────────────────────

export async function checkSlugAvailable(slug: string, ignoreId?: string): Promise<{ available: boolean }> {
  await assertPermission('product.view');
  const clean = slugify(slug);
  if (!clean) return { available: false };
  const existing = await db.product.findFirst({ where: { slug: clean, NOT: ignoreId ? { id: ignoreId } : undefined }, select: { id: true } });
  return { available: !existing };
}

export async function checkSkuAvailable(sku: string, ignoreId?: string): Promise<{ available: boolean }> {
  await assertPermission('product.view');
  const clean = sku.trim();
  if (!clean) return { available: false };
  const existing = await db.product.findFirst({ where: { sku: clean, NOT: ignoreId ? { id: ignoreId } : undefined }, select: { id: true } });
  return { available: !existing };
}

export async function suggestSlug(nameFa: string): Promise<string> {
  await assertPermission('product.view');
  const base = slugify(nameFa) || 'product';
  let slug = base;
  let n = 1;
  while (await db.product.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

// ─────────────────────────────────────────────────────────────
// Create / update
// ─────────────────────────────────────────────────────────────

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function assertVariantSkusFree(variants: ProductFormValue['variants'], productId: string | undefined) {
  const skus = variants.map((v) => v.sku);
  const clashes = await db.productVariant.findMany({
    where: { sku: { in: skus }, ...(productId ? { productId: { not: productId } } : {}) },
    select: { sku: true },
  });
  return clashes.map((c) => c.sku);
}

export async function saveProduct(
  input: ProductFormValue,
  opts: { asDraft?: boolean } = {},
): Promise<ActionResult<{ id: string; slug: string }>> {
  const actor = await assertPermission(input.id ? 'product.update' : 'product.create');

  const parsed = productFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'اطلاعات فرم نامعتبر است.' };
  }
  const data = parsed.data;
  const status = opts.asDraft ? 'DRAFT' : data.status;

  const slugTaken = await db.product.findFirst({
    where: { slug: data.slug, NOT: data.id ? { id: data.id } : undefined },
    select: { id: true },
  });
  if (slugTaken) return { ok: false, error: 'این نامک قبلاً استفاده شده است.' };

  const skuTaken = await db.product.findFirst({
    where: { sku: data.sku, NOT: data.id ? { id: data.id } : undefined },
    select: { id: true },
  });
  if (skuTaken) return { ok: false, error: 'این SKU قبلاً استفاده شده است.' };

  const variantSkuClashes = await assertVariantSkusFree(data.variants, data.id);
  if (variantSkuClashes.length > 0) {
    return { ok: false, error: `SKU تنوع «${variantSkuClashes[0]}» قبلاً در محصول دیگری استفاده شده است.` };
  }

  const brand = await db.brand.findUnique({ where: { id: data.brandId }, select: { id: true } });
  if (!brand) return { ok: false, error: 'برند انتخاب‌شده معتبر نیست.' };
  const category = await db.category.findUnique({ where: { id: data.categoryId }, select: { id: true } });
  if (!category) return { ok: false, error: 'دسته انتخاب‌شده معتبر نیست.' };

  const searchKeywords = buildSearchKeywords([data.nameFa, data.nameEn, data.sku, data.slug]);

  const productData = {
    nameFa: data.nameFa,
    nameEn: data.nameEn || null,
    slug: data.slug,
    sku: data.sku,
    brandId: data.brandId,
    categoryId: data.categoryId,
    platformId: data.platformId || null,
    productType: data.productType,
    deliveryType: data.deliveryType,
    status,
    publishAt: toDate(data.publishAt),
    expiresAt: toDate(data.expiresAt),
    shortDescriptionFa: data.shortDescriptionFa || null,
    descriptionFa: data.descriptionFa || null,
    activationGuideFa: data.activationGuideFa || null,
    restrictionsFa: data.restrictionsFa || null,
    warningsFa: data.warningsFa || null,
    refundPolicyFa: data.refundPolicyFa || null,
    refundEligible: data.refundEligible,
    requiresRegionAck: data.requiresRegionAck,
    minOrderQty: data.minOrderQty,
    maxOrderQty: data.maxOrderQty,
    estimatedDeliveryMin: data.estimatedDeliveryMin,
    isFeatured: data.isFeatured,
    isPopular: data.isPopular,
    seoTitle: data.seoTitle || null,
    seoDescription: data.seoDescription || null,
    searchKeywords,
  } as const;

  try {
    const productId = await db.$transaction(async (tx) => {
      let id = data.id;
      let before: unknown = null;

      if (id) {
        before = await tx.product.findUnique({ where: { id } });
        if (!before) throw new Error('محصول یافت نشد.');
        await tx.product.update({ where: { id }, data: productData });
      } else {
        const created = await tx.product.create({ data: { ...productData, slug: data.slug, sku: data.sku } });
        id = created.id;
      }

      // Variants: upsert by id (when present) else create; remove ones not sent.
      const keepVariantIds = data.variants.filter((v) => v.id).map((v) => v.id as string);
      await tx.productVariant.deleteMany({ where: { productId: id, id: { notIn: keepVariantIds.length ? keepVariantIds : ['__none__'] } } });
      for (const v of data.variants) {
        const variantData = {
          productId: id,
          sku: v.sku,
          nameFa: v.nameFa,
          denominationMinor: v.denominationMinor ?? null,
          currencyCode: v.currencyCode || null,
          regionId: v.regionId || null,
          platformId: v.platformId || null,
          costPriceToman: v.costPriceToman,
          basePriceToman: v.basePriceToman,
          salePriceToman: v.salePriceToman ?? null,
          compareAtToman: v.compareAtToman ?? null,
          marginType: v.marginType,
          marginValue: v.marginValue,
          minProfitToman: v.minProfitToman,
          minQty: v.minQty,
          maxQty: v.maxQty,
          lowStockThreshold: v.lowStockThreshold,
          supplierId: v.supplierId || null,
          isActive: v.isActive,
          isDefault: v.isDefault,
        };
        if (v.id) {
          await tx.productVariant.update({ where: { id: v.id }, data: variantData });
        } else {
          await tx.productVariant.create({ data: variantData });
        }
      }

      // Media
      const keepMediaIds = data.media.filter((m) => m.id).map((m) => m.id as string);
      await tx.productMedia.deleteMany({ where: { productId: id, id: { notIn: keepMediaIds.length ? keepMediaIds : ['__none__'] } } });
      for (const [idx, m] of data.media.entries()) {
        const mediaData = {
          productId: id,
          kind: m.kind,
          path: m.path,
          alt: m.alt,
          sortOrder: idx,
          width: m.width ?? null,
          height: m.height ?? null,
          format: 'webp',
        };
        if (m.id) {
          await tx.productMedia.update({ where: { id: m.id }, data: mediaData });
        } else {
          await tx.productMedia.create({ data: mediaData });
        }
      }
      if (data.ogImagePath) {
        const existingOg = await tx.productMedia.findFirst({ where: { productId: id, kind: 'OG_IMAGE' } });
        if (existingOg) await tx.productMedia.update({ where: { id: existingOg.id }, data: { path: data.ogImagePath } });
        else await tx.productMedia.create({ data: { productId: id, kind: 'OG_IMAGE', path: data.ogImagePath, alt: data.nameFa, sortOrder: 0, format: 'webp' } });
      }

      // Tags
      await tx.productTag.deleteMany({ where: { productId: id } });
      if (data.tagIds.length > 0) {
        await tx.productTag.createMany({ data: data.tagIds.map((tagId) => ({ productId: id!, tagId })), skipDuplicates: true });
      }

      // Related products
      await tx.productRelation.deleteMany({ where: { sourceId: id } });
      if (data.relatedProductIds.length > 0) {
        await tx.productRelation.createMany({
          data: data.relatedProductIds
            .filter((rid) => rid !== id)
            .map((targetId, idx) => ({ sourceId: id!, targetId, kind: 'RELATED', sortOrder: idx })),
          skipDuplicates: true,
        });
      }

      await audit({
        action: data.id ? 'product.update' : 'product.create',
        entity: 'Product',
        entityId: id!,
        actorId: actor.id,
        actorType: 'STAFF',
        before: before ? { nameFa: (before as { nameFa: string }).nameFa, status: (before as { status: string }).status } : null,
        after: { nameFa: data.nameFa, status, variantCount: data.variants.length },
      });

      return id!;
    });

    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, data: { id: productId, slug: data.slug } };
  } catch (err) {
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: 'ذخیره محصول با خطا مواجه شد.' };
  }
}

const draftSchema = z.object({ id: z.string().optional(), payload: z.record(z.unknown()) });

/** Explicit "ذخیره پیش‌نویس" — persists whatever is on the form right now as a DRAFT, tolerating incomplete data. */
export async function saveProductDraft(input: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await assertPermission(
    (input as { id?: string })?.id ? 'product.update' : 'product.create',
  );
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'داده پیش‌نویس نامعتبر است.' };
  const payload = parsed.data.payload as Partial<ProductFormValue>;
  const nameFa = typeof payload.nameFa === 'string' && payload.nameFa.trim() ? payload.nameFa.trim() : 'محصول بدون‌نام';

  if (parsed.data.id) {
    await db.product.update({ where: { id: parsed.data.id }, data: { nameFa, status: 'DRAFT' } });
    await audit({ action: 'product.draft.save', entity: 'Product', entityId: parsed.data.id, actorId: actor.id, actorType: 'STAFF' });
    return { ok: true, data: { id: parsed.data.id } };
  }

  const slug = await (async () => {
    let s = slugify(nameFa) || `draft-${Date.now()}`;
    let n = 1;
    while (await db.product.findUnique({ where: { slug: s } })) {
      n += 1;
      s = `${slugify(nameFa)}-${n}`;
    }
    return s;
  })();
  const sku = `DRAFT-${Date.now().toString(36).toUpperCase()}`;
  const anyBrand = await db.brand.findFirst({ select: { id: true } });
  const anyCategory = await db.category.findFirst({ select: { id: true } });
  if (!anyBrand || !anyCategory) return { ok: false, error: 'ابتدا حداقل یک برند و یک دسته ایجاد کنید.' };

  const created = await db.product.create({
    data: { nameFa, slug, sku, brandId: anyBrand.id, categoryId: anyCategory.id, status: 'DRAFT' },
    select: { id: true },
  });
  await audit({ action: 'product.draft.create', entity: 'Product', entityId: created.id, actorId: actor.id, actorType: 'STAFF' });
  revalidatePath('/admin/products');
  return { ok: true, data: { id: created.id } };
}

// ─────────────────────────────────────────────────────────────
// Duplicate
// ─────────────────────────────────────────────────────────────

export async function duplicateProduct(id: string): Promise<ActionResult<{ id: string }>> {
  const actor = await assertPermission('product.create');
  const original = await db.product.findUnique({
    where: { id },
    include: { variants: true, media: true, tags: true },
  });
  if (!original) return { ok: false, error: 'محصول یافت نشد.' };

  const suffix = Date.now().toString(36).slice(-5).toUpperCase();
  let slug = `${original.slug}-copy-${suffix}`;
  let n = 1;
  while (await db.product.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${original.slug}-copy-${suffix}-${n}`;
  }
  const sku = `${original.sku}-COPY-${suffix}`;

  const newId = await db.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        nameFa: `${original.nameFa} (کپی)`,
        nameEn: original.nameEn,
        slug,
        sku,
        brandId: original.brandId,
        categoryId: original.categoryId,
        platformId: original.platformId,
        productType: original.productType,
        deliveryType: original.deliveryType,
        status: 'DRAFT',
        shortDescriptionFa: original.shortDescriptionFa,
        descriptionFa: original.descriptionFa,
        activationGuideFa: original.activationGuideFa,
        restrictionsFa: original.restrictionsFa,
        warningsFa: original.warningsFa,
        refundPolicyFa: original.refundPolicyFa,
        refundEligible: original.refundEligible,
        requiresRegionAck: original.requiresRegionAck,
        minOrderQty: original.minOrderQty,
        maxOrderQty: original.maxOrderQty,
        estimatedDeliveryMin: original.estimatedDeliveryMin,
        seoTitle: original.seoTitle,
        seoDescription: original.seoDescription,
        searchKeywords: original.searchKeywords,
      },
    });

    for (const v of original.variants) {
      await tx.productVariant.create({
        data: {
          productId: created.id,
          sku: `${v.sku}-${suffix}`,
          nameFa: v.nameFa,
          denominationMinor: v.denominationMinor,
          currencyCode: v.currencyCode,
          regionId: v.regionId,
          platformId: v.platformId,
          costPriceToman: v.costPriceToman,
          basePriceToman: v.basePriceToman,
          salePriceToman: v.salePriceToman,
          compareAtToman: v.compareAtToman,
          marginType: v.marginType,
          marginValue: v.marginValue,
          minProfitToman: v.minProfitToman,
          minQty: v.minQty,
          maxQty: v.maxQty,
          lowStockThreshold: v.lowStockThreshold,
          supplierId: v.supplierId,
          isActive: v.isActive,
          isDefault: v.isDefault,
        },
      });
    }

    for (const m of original.media) {
      await tx.productMedia.create({
        data: {
          productId: created.id,
          kind: m.kind,
          path: m.path,
          alt: m.alt,
          width: m.width,
          height: m.height,
          format: m.format,
          sortOrder: m.sortOrder,
        },
      });
    }

    if (original.tags.length > 0) {
      await tx.productTag.createMany({ data: original.tags.map((t) => ({ productId: created.id, tagId: t.tagId })) });
    }

    return created.id;
  });

  await audit({
    action: 'product.duplicate',
    entity: 'Product',
    entityId: newId,
    actorId: actor.id,
    actorType: 'STAFF',
    before: { sourceId: id },
    after: { newId, slug, sku },
  });

  revalidatePath('/admin/products');
  return { ok: true, data: { id: newId } };
}

// ─────────────────────────────────────────────────────────────
// List-page bulk actions
// ─────────────────────────────────────────────────────────────

type BulkResult = { ok: boolean; error?: string; message?: string };

async function bulkAudit(action: string, ids: string[], actorId: string, after?: Record<string, unknown>) {
  await audit({ action, entity: 'Product', actorId, actorType: 'STAFF', after: { ids, ...after } });
}

export async function bulkSetStatus(ids: string[], status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'): Promise<BulkResult> {
  const actor = await assertPermission(status === 'ARCHIVED' ? 'product.delete' : 'product.update');
  const data = status === 'ARCHIVED' ? { status, archivedAt: new Date() } : { status };
  const res = await db.product.updateMany({ where: { id: { in: ids } }, data });
  await bulkAudit('product.bulk-status', ids, actor.id, { status });
  revalidatePath('/admin/products');
  return { ok: true, message: `وضعیت ${res.count.toLocaleString('fa-IR')} محصول به‌روزرسانی شد.` };
}

export async function bulkSetFeatured(ids: string[], isFeatured: boolean): Promise<BulkResult> {
  const actor = await assertPermission('product.update');
  const res = await db.product.updateMany({ where: { id: { in: ids } }, data: { isFeatured } });
  await bulkAudit('product.bulk-feature', ids, actor.id, { isFeatured });
  revalidatePath('/admin/products');
  return { ok: true, message: `${res.count.toLocaleString('fa-IR')} محصول به‌روزرسانی شد.` };
}

export async function bulkSetCategory(ids: string[], categoryId: string): Promise<BulkResult> {
  const actor = await assertPermission('product.update');
  const category = await db.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!category) return { ok: false, error: 'دسته انتخاب‌شده معتبر نیست.' };
  const res = await db.product.updateMany({ where: { id: { in: ids } }, data: { categoryId } });
  await bulkAudit('product.bulk-category', ids, actor.id, { categoryId });
  revalidatePath('/admin/products');
  return { ok: true, message: `دسته ${res.count.toLocaleString('fa-IR')} محصول تغییر کرد.` };
}

export async function bulkSetBrand(ids: string[], brandId: string): Promise<BulkResult> {
  const actor = await assertPermission('product.update');
  const brand = await db.brand.findUnique({ where: { id: brandId }, select: { id: true } });
  if (!brand) return { ok: false, error: 'برند انتخاب‌شده معتبر نیست.' };
  const res = await db.product.updateMany({ where: { id: { in: ids } }, data: { brandId } });
  await bulkAudit('product.bulk-brand', ids, actor.id, { brandId });
  revalidatePath('/admin/products');
  return { ok: true, message: `برند ${res.count.toLocaleString('fa-IR')} محصول تغییر کرد.` };
}

export async function bulkDuplicate(ids: string[]): Promise<BulkResult> {
  await assertPermission('product.create');
  let count = 0;
  for (const id of ids) {
    const res = await duplicateProduct(id);
    if (res.ok) count++;
  }
  revalidatePath('/admin/products');
  return { ok: true, message: `${count.toLocaleString('fa-IR')} محصول کپی شد.` };
}

export async function bulkDelete(ids: string[]): Promise<BulkResult> {
  return bulkSetStatus(ids, 'ARCHIVED');
}

/**
 * Single entry point for the product list's bulk actions.
 *
 * `DataTable` is a Client Component, so it cannot receive per-action callbacks
 * from this Server Component — React refuses to serialise plain functions. It
 * receives this one Server Action instead and dispatches on `key`.
 */
export async function runProductBulkAction(
  key: string,
  ids: string[],
  value?: string,
): Promise<BulkResult> {
  switch (key) {
    case 'activate':
      return bulkSetStatus(ids, 'ACTIVE');
    case 'deactivate':
      return bulkSetStatus(ids, 'INACTIVE');
    case 'feature':
      return bulkSetFeatured(ids, true);
    case 'unfeature':
      return bulkSetFeatured(ids, false);
    case 'set-category':
      if (!value) return { ok: false, error: 'شناسه دسته وارد نشد.' };
      return bulkSetCategory(ids, value);
    case 'set-brand':
      if (!value) return { ok: false, error: 'شناسه برند وارد نشد.' };
      return bulkSetBrand(ids, value);
    case 'duplicate':
      return bulkDuplicate(ids);
    case 'archive':
      return bulkDelete(ids);
    default:
      return { ok: false, error: 'عملیات ناشناخته است.' };
  }
}
