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

const postSchema = z.object({
  id: z.string().optional(),
  slug: z.string().min(2, 'نشانی الزامی است.').max(160),
  titleFa: z.string().min(2, 'عنوان الزامی است.').max(220),
  excerptFa: z.string().min(1, 'خلاصه الزامی است.').max(400),
  contentFa: z.string().min(1, 'محتوا نمی‌تواند خالی باشد.'),
  coverPath: z.string().max(300).optional(),
  coverAlt: z.string().max(200).optional(),
  categoryFa: z.string().max(80).optional(),
  tags: z.string().max(300).optional(),
  readingMinutes: z.coerce.number().int().min(1).max(120),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(400).optional(),
  publishedAt: z.string().optional(),
});

export async function saveBlogPost(input: z.infer<typeof postSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const user = await assertPermission('content.manage');
  const d = parsed.data;
  const slug = slugify(d.slug) || slugify(d.titleFa);

  const data = {
    slug, titleFa: d.titleFa, excerptFa: d.excerptFa, contentFa: d.contentFa,
    coverPath: d.coverPath || null, coverAlt: d.coverAlt || null, categoryFa: d.categoryFa || null,
    tags: d.tags || null, readingMinutes: d.readingMinutes, status: d.status,
    seoTitle: d.seoTitle || null, seoDescription: d.seoDescription || null,
    publishedAt: d.publishedAt ? new Date(d.publishedAt) : d.status === 'PUBLISHED' ? new Date() : null,
    authorId: user.id,
  };

  try {
    if (d.id) {
      const before = await db.blogPost.findUnique({ where: { id: d.id } });
      if (!before) return fail('نوشته یافت نشد.');
      await db.blogPost.update({ where: { id: d.id }, data });
      await audit({ action: 'blog.update', entity: 'BlogPost', entityId: d.id, actorId: user.id, actorType: 'STAFF', before, after: data });
      revalidatePath('/admin/blog');
      return { ok: true, data: { id: d.id } };
    }
    const created = await db.blogPost.create({ data });
    await audit({ action: 'blog.create', entity: 'BlogPost', entityId: created.id, actorId: user.id, actorType: 'STAFF', after: data });
    revalidatePath('/admin/blog');
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    if (err instanceof Error && /Unique constraint/i.test(err.message)) return fail('این نشانی قبلاً استفاده شده است.');
    throw err;
  }
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteBlogPost(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('content.manage');

  await db.blogPost.delete({ where: { id: parsed.data.id } });
  await audit({ action: 'blog.delete', entity: 'BlogPost', entityId: parsed.data.id, actorId: user.id, actorType: 'STAFF' });
  revalidatePath('/admin/blog');
  return { ok: true };
}
