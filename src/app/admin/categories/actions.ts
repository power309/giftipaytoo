'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { slugify } from '@/lib/persian';

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let slug = slugify(base) || `دسته-${Date.now()}`;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await db.category.findFirst({ where: { slug, NOT: ignoreId ? { id: ignoreId } : undefined } });
    if (!exists) return slug;
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
}

const createSchema = z.object({
  nameFa: z.string().trim().min(1, 'نام فارسی الزامی است.').max(120),
  nameEn: z.string().trim().max(120).optional().nullable(),
  parentId: z.string().trim().min(1).optional().nullable(),
});

export async function createCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await assertPermission('taxonomy.manage');
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.' };
  const { nameFa, nameEn, parentId } = parsed.data;

  if (parentId) {
    const parent = await db.category.findUnique({ where: { id: parentId }, select: { id: true } });
    if (!parent) return { ok: false, error: 'دسته والد یافت نشد.' };
  }

  const slug = await uniqueSlug(nameFa);
  const maxSort = await db.category.aggregate({
    where: { parentId: parentId ?? null },
    _max: { sortOrder: true },
  });

  const category = await db.category.create({
    data: {
      slug,
      nameFa,
      nameEn: nameEn || null,
      parentId: parentId ?? null,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  });

  await audit({
    action: 'category.create',
    entity: 'Category',
    entityId: category.id,
    actorId: actor.id,
    actorType: 'STAFF',
    after: { nameFa, nameEn: nameEn ?? null, parentId: parentId ?? null, slug },
  });

  revalidatePath('/admin/categories');
  return { ok: true, data: { id: category.id } };
}

const updateSchema = z.object({
  id: z.string().min(1),
  nameFa: z.string().trim().min(1).max(120).optional(),
  nameEn: z.string().trim().max(120).nullable().optional(),
  descriptionFa: z.string().trim().max(2000).nullable().optional(),
  iconKey: z.string().trim().max(500).nullable().optional(),
  posterKey: z.string().trim().max(500).nullable().optional(),
  bannerKey: z.string().trim().max(500).nullable().optional(),
  seoTitle: z.string().trim().max(200).nullable().optional(),
  seoDescription: z.string().trim().max(400).nullable().optional(),
  showInMegaMenu: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function updateCategory(input: unknown): Promise<ActionResult> {
  const actor = await assertPermission('taxonomy.manage');
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.' };
  const { id, ...rest } = parsed.data;

  const before = await db.category.findUnique({ where: { id } });
  if (!before) return { ok: false, error: 'دسته یافت نشد.' };

  const data: Record<string, unknown> = {};
  if (rest.nameFa !== undefined) data.nameFa = rest.nameFa;
  if (rest.nameEn !== undefined) data.nameEn = rest.nameEn;
  if (rest.descriptionFa !== undefined) data.descriptionFa = rest.descriptionFa;
  if (rest.iconKey !== undefined) data.iconKey = rest.iconKey;
  if (rest.posterKey !== undefined) data.posterKey = rest.posterKey;
  if (rest.bannerKey !== undefined) data.bannerKey = rest.bannerKey;
  if (rest.seoTitle !== undefined) data.seoTitle = rest.seoTitle;
  if (rest.seoDescription !== undefined) data.seoDescription = rest.seoDescription;
  if (rest.showInMegaMenu !== undefined) data.showInMegaMenu = rest.showInMegaMenu;
  if (rest.isActive !== undefined) data.isActive = rest.isActive;

  await db.category.update({ where: { id }, data });

  await audit({
    action: 'category.update',
    entity: 'Category',
    entityId: id,
    actorId: actor.id,
    actorType: 'STAFF',
    before,
    after: { ...before, ...data },
  });

  revalidatePath('/admin/categories');
  return { ok: true };
}

const reparentSchema = z.object({ id: z.string().min(1), parentId: z.string().min(1).nullable() });

export async function reparentCategory(input: unknown): Promise<ActionResult> {
  const actor = await assertPermission('taxonomy.manage');
  const parsed = reparentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ورودی نامعتبر است.' };
  const { id, parentId } = parsed.data;

  if (parentId === id) return { ok: false, error: 'یک دسته نمی‌تواند والد خودش باشد.' };

  if (parentId) {
    // Prevent creating a cycle: walk up from the target parent to the root.
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === id) return { ok: false, error: 'این عملیات یک حلقه در درخت دسته‌ها ایجاد می‌کند.' };
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const row: { parentId: string | null } | null = await db.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = row?.parentId ?? null;
    }
  }

  const before = await db.category.findUnique({ where: { id }, select: { parentId: true } });
  const maxSort = await db.category.aggregate({ where: { parentId: parentId ?? null }, _max: { sortOrder: true } });
  await db.category.update({
    where: { id },
    data: { parentId: parentId ?? null, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 },
  });

  await audit({
    action: 'category.reparent',
    entity: 'Category',
    entityId: id,
    actorId: actor.id,
    actorType: 'STAFF',
    before,
    after: { parentId: parentId ?? null },
  });

  revalidatePath('/admin/categories');
  return { ok: true };
}

const reorderSchema = z.object({
  parentId: z.string().min(1).nullable(),
  orderedIds: z.array(z.string().min(1)).min(1),
});

export async function reorderCategories(input: unknown): Promise<ActionResult> {
  const actor = await assertPermission('taxonomy.manage');
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ورودی نامعتبر است.' };
  const { orderedIds } = parsed.data;

  await db.$transaction(
    orderedIds.map((id, index) => db.category.update({ where: { id }, data: { sortOrder: index } })),
  );

  await audit({
    action: 'category.reorder',
    entity: 'Category',
    actorId: actor.id,
    actorType: 'STAFF',
    after: { orderedIds },
  });

  revalidatePath('/admin/categories');
  return { ok: true };
}

const deleteSchema = z.object({ id: z.string().min(1), reassignToId: z.string().min(1).nullable().optional() });

export async function deleteCategory(input: unknown): Promise<ActionResult> {
  const actor = await assertPermission('taxonomy.manage');
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ورودی نامعتبر است.' };
  const { id, reassignToId } = parsed.data;

  const category = await db.category.findUnique({
    where: { id },
    select: { id: true, nameFa: true, children: { select: { id: true } }, _count: { select: { products: true } } },
  });
  if (!category) return { ok: false, error: 'دسته یافت نشد.' };

  if (category.children.length > 0) {
    return { ok: false, error: 'این دسته زیردسته دارد؛ ابتدا زیردسته‌ها را جابه‌جا یا حذف کنید.' };
  }

  if (category._count.products > 0) {
    if (!reassignToId) {
      return {
        ok: false,
        error: `این دسته دارای ${category._count.products.toLocaleString('fa-IR')} محصول است و قابل حذف نیست. یک دسته جایگزین برای انتقال محصولات انتخاب کنید.`,
      };
    }
    if (reassignToId === id) return { ok: false, error: 'دسته جایگزین نمی‌تواند همان دسته حذف‌شونده باشد.' };
    const target = await db.category.findUnique({ where: { id: reassignToId }, select: { id: true } });
    if (!target) return { ok: false, error: 'دسته جایگزین یافت نشد.' };
    await db.product.updateMany({ where: { categoryId: id }, data: { categoryId: reassignToId } });
  }

  await db.category.delete({ where: { id } });

  await audit({
    action: 'category.delete',
    entity: 'Category',
    entityId: id,
    actorId: actor.id,
    actorType: 'STAFF',
    before: { nameFa: category.nameFa, productCount: category._count.products },
    summary: reassignToId ? `محصولات به دسته ${reassignToId} منتقل شدند` : undefined,
  });

  revalidatePath('/admin/categories');
  return { ok: true };
}

// ── Tags ─────────────────────────────────────────────────────

const tagSchema = z.object({ nameFa: z.string().trim().min(1).max(60) });

export async function createTag(input: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await assertPermission('taxonomy.manage');
  const parsed = tagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'نام برچسب نامعتبر است.' };
  const slug = await (async () => {
    let s = slugify(parsed.data.nameFa) || `tag-${Date.now()}`;
    let n = 1;
    while (await db.tag.findUnique({ where: { slug: s } })) {
      n += 1;
      s = `${slugify(parsed.data.nameFa)}-${n}`;
    }
    return s;
  })();
  const tag = await db.tag.create({ data: { slug, nameFa: parsed.data.nameFa }, select: { id: true } });
  await audit({ action: 'tag.create', entity: 'Tag', entityId: tag.id, actorId: actor.id, actorType: 'STAFF', after: { nameFa: parsed.data.nameFa } });
  revalidatePath('/admin/categories');
  return { ok: true, data: { id: tag.id } };
}

export async function deleteTag(id: string): Promise<ActionResult> {
  const actor = await assertPermission('taxonomy.manage');
  const usage = await db.productTag.count({ where: { tagId: id } });
  if (usage > 0) {
    return { ok: false, error: `این برچسب روی ${usage.toLocaleString('fa-IR')} محصول استفاده شده و قابل حذف نیست.` };
  }
  const tag = await db.tag.findUnique({ where: { id } });
  if (!tag) return { ok: false, error: 'برچسب یافت نشد.' };
  await db.tag.delete({ where: { id } });
  await audit({ action: 'tag.delete', entity: 'Tag', entityId: id, actorId: actor.id, actorType: 'STAFF', before: tag });
  revalidatePath('/admin/categories');
  return { ok: true };
}
