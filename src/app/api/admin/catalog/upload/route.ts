import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { assertPermission, ForbiddenError, UnauthorizedError } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { logger } from '@/lib/logger';

/**
 * Secure image upload for the catalog admin (posters, gallery, banners,
 * category/brand icons, OG images, media library replacements).
 *
 * Security properties (do not weaken any of these):
 *  - `assertPermission('media.manage')` — staff-only, permission-gated.
 *  - The client-supplied `Content-Type` and file extension are NEVER
 *    trusted. The body is capped and only decoded/re-encoded through
 *    `sharp`, which reads actual image bytes/magic numbers — an upload
 *    that isn't really an image throws in `sharp.metadata()` and is
 *    rejected.
 *  - The stored filename is always server-generated (random hex); the
 *    client's original filename is used only for the audit trail and is
 *    never interpolated into a path.
 *  - Output is always re-encoded to WebP, which strips EXIF/ICC/XMP
 *    metadata as a side effect of re-encoding (no `withMetadata()` call).
 *  - The size cap is enforced against `Content-Length` before the body is
 *    read, and again against the actual buffered length, so an attacker
 *    cannot bypass a forged header.
 */

export const runtime = 'nodejs';

const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const MAX_DIMENSION = 6000; // guard against decompression-bomb style huge canvases

function todayFolder(): { yyyy: string; mm: string } {
  const d = new Date();
  return { yyyy: String(d.getFullYear()), mm: String(d.getMonth() + 1).padStart(2, '0') };
}

export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await assertPermission('media.manage');
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ ok: false, error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    throw err;
  }

  // Reject oversized bodies before buffering anything, using the declared
  // Content-Length. This is a defence-in-depth check — the real limit is
  // enforced below against the bytes actually read.
  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `حجم فایل بیش از حد مجاز (${MAX_BYTES / 1024 / 1024} مگابایت) است.` }, { status: 413 });
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return NextResponse.json({ ok: false, error: 'درخواست باید از نوع multipart/form-data باشد.' }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'خواندن فایل ناموفق بود.' }, { status: 400 });
  }

  const file = form.get('file');
  const folderRaw = String(form.get('folder') ?? 'uploads');
  const altRaw = String(form.get('alt') ?? '');

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'فایلی ارسال نشده است.' }, { status: 400 });
  }

  // The client Content-Type is advisory only — never trusted for the
  // security decision — but we still reject obviously-wrong declarations
  // early to save work, before the real sharp-based check below.
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ ok: false, error: 'نوع فایل باید تصویر (JPEG، PNG، WebP، GIF یا AVIF) باشد.' }, { status: 415 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `حجم فایل بیش از حد مجاز (${MAX_BYTES / 1024 / 1024} مگابایت) است.` }, { status: 413 });
  }

  // Whitelist the logical folder name; never let client input become a
  // path segment directly. Path traversal ("..", "/", "\") is rejected.
  const ALLOWED_FOLDERS = new Set(['uploads', 'posters', 'gallery', 'banners', 'categories', 'brands', 'og']);
  const folder = ALLOWED_FOLDERS.has(folderRaw) ? folderRaw : 'uploads';

  const arrayBuffer = await file.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  if (inputBuffer.length === 0) {
    return NextResponse.json({ ok: false, error: 'فایل خالی است.' }, { status: 400 });
  }
  if (inputBuffer.length > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `حجم فایل بیش از حد مجاز (${MAX_BYTES / 1024 / 1024} مگابایت) است.` }, { status: 413 });
  }

  // The ONLY trustworthy content check: ask sharp to read the actual image
  // bytes. A renamed .exe/.php or a corrupt file throws here.
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(inputBuffer, { failOn: 'error' }).metadata();
  } catch {
    return NextResponse.json({ ok: false, error: 'فایل ارسالی یک تصویر معتبر نیست.' }, { status: 415 });
  }

  if (!metadata.width || !metadata.height) {
    return NextResponse.json({ ok: false, error: 'ابعاد تصویر قابل تشخیص نیست.' }, { status: 415 });
  }
  if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    return NextResponse.json({ ok: false, error: `ابعاد تصویر نباید بیشتر از ${MAX_DIMENSION}px باشد.` }, { status: 415 });
  }
  const knownFormats = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'svg']);
  if (!metadata.format || !knownFormats.has(metadata.format) || metadata.format === 'svg') {
    return NextResponse.json({ ok: false, error: 'قالب تصویر پشتیبانی نمی‌شود.' }, { status: 415 });
  }

  // Re-encode to WebP. This both normalizes the format and strips all
  // EXIF/ICC/XMP metadata (we deliberately never call withMetadata()).
  let outputBuffer: Buffer;
  let outWidth: number;
  let outHeight: number;
  try {
    const pipeline = sharp(inputBuffer, { failOn: 'error' }).rotate(); // auto-orient, then metadata is stripped on encode
    const resized =
      metadata.width > 2400 || metadata.height > 2400
        ? pipeline.resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        : pipeline;
    outputBuffer = await resized.webp({ quality: 86 }).toBuffer();
    const outMeta = await sharp(outputBuffer).metadata();
    outWidth = outMeta.width ?? metadata.width;
    outHeight = outMeta.height ?? metadata.height;
  } catch {
    return NextResponse.json({ ok: false, error: 'پردازش تصویر ناموفق بود.' }, { status: 500 });
  }

  // Server-generated random filename — the client's filename is never
  // used for the path, only kept (truncated) for the audit trail. Every
  // upload physically lands under public/media/uploads/YYYY/MM/ regardless
  // of its logical `folder` tag (that tag is metadata only, used by the
  // media library's filter — it never becomes a path segment).
  const { yyyy, mm } = todayFolder();
  const randomName = crypto.randomBytes(16).toString('hex');
  const relDir = path.posix.join('media', 'uploads', yyyy, mm);
  const relPath = path.posix.join(relDir, `${randomName}.webp`);
  const publicPath = `/${relPath}`;

  // Defence in depth against path traversal even though every segment
  // above is either a whitelisted literal or a hex string we generated.
  const publicDir = path.join(process.cwd(), 'public');
  const absDir = path.join(publicDir, relDir);
  const absPath = path.join(publicDir, relPath);
  if (!absPath.startsWith(publicDir) || !absDir.startsWith(publicDir)) {
    logger.error('upload: path traversal guard tripped', { relPath });
    return NextResponse.json({ ok: false, error: 'مسیر فایل نامعتبر است.' }, { status: 400 });
  }

  try {
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(absPath, outputBuffer, { flag: 'wx' }); // fail if it somehow already exists
  } catch (err) {
    logger.error('upload: write failed', { err });
    return NextResponse.json({ ok: false, error: 'ذخیره فایل ناموفق بود.' }, { status: 500 });
  }

  await audit({
    action: 'media.upload',
    entity: 'ProductMedia',
    actorId: actor.id,
    actorType: 'STAFF',
    summary: `بارگذاری تصویر در ${publicPath}`,
    after: {
      path: publicPath,
      folder,
      width: outWidth,
      height: outHeight,
      bytes: outputBuffer.length,
      originalName: file.name?.slice(0, 200) ?? null,
      originalMime: file.type || null,
      alt: altRaw.slice(0, 300),
    },
  });

  return NextResponse.json({
    ok: true,
    path: publicPath,
    width: outWidth,
    height: outHeight,
    bytes: outputBuffer.length,
    format: 'webp',
  });
}

/** Deletes an uploaded file under public/media. Same path-safety guarantees as POST. */
export async function DELETE(req: NextRequest) {
  let actor;
  try {
    actor = await assertPermission('media.manage');
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ ok: false, error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'بدنه درخواست نامعتبر است.' }, { status: 400 });
  }
  const targetPath = typeof (body as { path?: unknown })?.path === 'string' ? (body as { path: string }).path : '';

  if (!targetPath.startsWith('/media/') || targetPath.includes('..') || targetPath.includes('\0')) {
    return NextResponse.json({ ok: false, error: 'مسیر فایل نامعتبر است.' }, { status: 400 });
  }

  const publicDir = path.join(process.cwd(), 'public');
  const absPath = path.join(publicDir, targetPath);
  if (!absPath.startsWith(path.join(publicDir, 'media'))) {
    return NextResponse.json({ ok: false, error: 'مسیر فایل نامعتبر است.' }, { status: 400 });
  }

  // Refuse deletion when the file is still referenced anywhere in the catalog.
  const { db } = await import('@/server/db');
  const [mediaRef, categoryRef, brandRef] = await Promise.all([
    db.productMedia.findFirst({ where: { path: targetPath }, select: { id: true } }),
    db.category.findFirst({
      where: { OR: [{ iconKey: targetPath }, { posterKey: targetPath }, { bannerKey: targetPath }] },
      select: { id: true },
    }),
    db.brand.findFirst({ where: { OR: [{ logoKey: targetPath }, { bannerKey: targetPath }] }, select: { id: true } }),
  ]);
  if (mediaRef || categoryRef || brandRef) {
    return NextResponse.json({ ok: false, error: 'این فایل هنوز در کاتالوگ استفاده می‌شود و قابل حذف نیست.' }, { status: 409 });
  }

  try {
    await fs.unlink(absPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return NextResponse.json({ ok: false, error: 'فایل یافت نشد.' }, { status: 404 });
    }
    logger.error('upload delete failed', { err });
    return NextResponse.json({ ok: false, error: 'حذف فایل ناموفق بود.' }, { status: 500 });
  }

  await audit({
    action: 'media.delete',
    entity: 'ProductMedia',
    actorId: actor.id,
    actorType: 'STAFF',
    summary: `حذف فایل ${targetPath}`,
    before: { path: targetPath },
  });

  return NextResponse.json({ ok: true });
}
