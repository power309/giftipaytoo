'use server';

import path from 'node:path';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

function assertSafeMediaPath(p: string): void {
  if (!p.startsWith('/media/') || p.includes('..') || p.includes('\0')) {
    throw new Error('مسیر فایل نامعتبر است.');
  }
}

/**
 * Points every reference to `oldPath` at `newPath`, then deletes the old
 * file from disk. Used by the "جایگزینی تصویر" action in the media library.
 */
const replaceSchema = z.object({ oldPath: z.string().min(1), newPath: z.string().min(1) });

export async function replaceMediaFile(input: unknown): Promise<ActionResult<{ updated: number }>> {
  const actor = await assertPermission('media.manage');
  const parsed = replaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ورودی نامعتبر است.' };
  const { oldPath, newPath } = parsed.data;

  try {
    assertSafeMediaPath(oldPath);
    assertSafeMediaPath(newPath);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'مسیر نامعتبر است.' };
  }

  const [mediaCount, catCount, brandCount] = await Promise.all([
    db.productMedia.updateMany({ where: { path: oldPath }, data: { path: newPath } }),
    db.category.updateMany({ where: { iconKey: oldPath }, data: { iconKey: newPath } }),
    db.brand.updateMany({ where: { logoKey: oldPath }, data: { logoKey: newPath } }),
  ]);
  await db.category.updateMany({ where: { posterKey: oldPath }, data: { posterKey: newPath } });
  await db.category.updateMany({ where: { bannerKey: oldPath }, data: { bannerKey: newPath } });
  await db.brand.updateMany({ where: { bannerKey: oldPath }, data: { bannerKey: newPath } });

  const publicDir = path.join(process.cwd(), 'public');
  const absOld = path.join(publicDir, oldPath);
  if (absOld.startsWith(path.join(publicDir, 'media'))) {
    try {
      await fs.unlink(absOld);
    } catch {
      // Old file already gone — not fatal, references were still repointed.
    }
  }

  const updated = mediaCount.count + catCount.count + brandCount.count;
  await audit({
    action: 'media.replace',
    entity: 'ProductMedia',
    actorId: actor.id,
    actorType: 'STAFF',
    summary: `جایگزینی ${oldPath} با ${newPath} (${updated} ارجاع به‌روزرسانی شد)`,
    before: { oldPath },
    after: { newPath, updated },
  });

  revalidatePath('/admin/media');
  return { ok: true, data: { updated } };
}
