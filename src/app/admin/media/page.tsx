import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader } from '@/components/admin/kit';
import { MediaBrowser, type MediaFile } from './browser';

export const metadata = { title: 'رسانه' };
export const dynamic = 'force-dynamic';

async function walk(dir: string, base: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(abs, base)));
    } else if (/\.(webp|jpe?g|png|gif|avif|svg)$/i.test(entry.name)) {
      files.push(path.relative(base, abs).split(path.sep).join('/'));
    }
  }
  return files;
}

export default async function MediaPage() {
  await requirePermission('media.manage');

  const publicDir = path.join(process.cwd(), 'public');
  const mediaDir = path.join(publicDir, 'media');
  const relPaths = await walk(mediaDir, publicDir);

  const [referencedInProducts, categories, brands] = await Promise.all([
    db.productMedia.findMany({ select: { path: true } }),
    db.category.findMany({ select: { iconKey: true, posterKey: true, bannerKey: true } }),
    db.brand.findMany({ select: { logoKey: true, bannerKey: true } }),
  ]);

  const referenced = new Set<string>();
  for (const m of referencedInProducts) referenced.add(m.path);
  for (const c of categories) {
    if (c.iconKey) referenced.add(c.iconKey);
    if (c.posterKey) referenced.add(c.posterKey);
    if (c.bannerKey) referenced.add(c.bannerKey);
  }
  for (const b of brands) {
    if (b.logoKey) referenced.add(b.logoKey);
    if (b.bannerKey) referenced.add(b.bannerKey);
  }

  const files: MediaFile[] = await Promise.all(
    relPaths.map(async (rel): Promise<MediaFile> => {
      const publicPath = `/${rel}`;
      const abs = path.join(publicDir, rel);
      let width: number | null = null;
      let height: number | null = null;
      let bytes = 0;
      let mtime = 0;
      try {
        const stat = await fs.stat(abs);
        bytes = stat.size;
        mtime = stat.mtimeMs;
      } catch {
        /* file listed but stat failed — leave defaults */
      }
      try {
        const meta = await sharp(abs).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
      } catch {
        /* not a decodable raster image (e.g. svg) — dims stay null */
      }
      const folder = rel.split('/')[1] ?? rel.split('/')[0];
      return {
        path: publicPath,
        folder,
        width,
        height,
        bytes,
        mtime,
        referenced: referenced.has(publicPath),
      };
    }),
  );

  files.sort((a, b) => b.mtime - a.mtime);

  return (
    <div className="space-y-6">
      <PageHeader title="کتابخانه رسانه" description="همه فایل‌های تصویری زیر public/media — فیلتر، جایگزینی و حذف امن." />
      <MediaBrowser files={files} />
    </div>
  );
}
