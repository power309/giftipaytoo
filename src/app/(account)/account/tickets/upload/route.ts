import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { getSessionUser } from '@/server/auth/session';
import { assertCsrf, CsrfError } from '@/server/csrf';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { clientIp } from '@/server/auth/session';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * Ticket attachment upload for customers. Deliberately scoped to images
 * only (no PDFs/archives) so the security posture matches the admin catalog
 * uploader: the client's declared type/extension is never trusted — every
 * upload is re-decoded and re-encoded through `sharp`, which also strips
 * EXIF/ICC/XMP metadata, and the stored filename is always server-random.
 */

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB — stated to the user in the ticket form
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DIMENSION = 4000;

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'برای پیوست فایل ابتدا وارد حساب کاربری خود شوید.' }, { status: 401 });

  try {
    await assertCsrf();
    await enforceRateLimit('api.generic', user.id);
  } catch (err) {
    if (err instanceof CsrfError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    if (err instanceof RateLimitError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 429, headers: { 'Retry-After': String(err.retryAfterSec) } });
    }
    throw err;
  }

  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `حجم فایل نباید بیشتر از ${MAX_BYTES / 1024 / 1024} مگابایت باشد.` }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'خواندن فایل ناموفق بود.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'فایلی ارسال نشده است.' }, { status: 400 });
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ ok: false, error: 'فقط تصویر JPG، PNG یا WebP قابل پیوست است.' }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `حجم فایل نباید بیشتر از ${MAX_BYTES / 1024 / 1024} مگابایت باشد.` }, { status: 413 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  if (inputBuffer.length === 0 || inputBuffer.length > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'فایل نامعتبر است.' }, { status: 400 });
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(inputBuffer, { failOn: 'error' }).metadata();
  } catch {
    return NextResponse.json({ ok: false, error: 'فایل ارسالی یک تصویر معتبر نیست.' }, { status: 415 });
  }
  if (!metadata.width || !metadata.height || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    return NextResponse.json({ ok: false, error: 'ابعاد تصویر پشتیبانی نمی‌شود.' }, { status: 415 });
  }
  const known = new Set(['jpeg', 'png', 'webp']);
  if (!metadata.format || !known.has(metadata.format)) {
    return NextResponse.json({ ok: false, error: 'قالب تصویر پشتیبانی نمی‌شود.' }, { status: 415 });
  }

  let outputBuffer: Buffer;
  try {
    outputBuffer = await sharp(inputBuffer, { failOn: 'error' })
      .rotate()
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return NextResponse.json({ ok: false, error: 'پردازش تصویر ناموفق بود.' }, { status: 500 });
  }

  const randomName = crypto.randomBytes(16).toString('hex');
  const relDir = path.posix.join('uploads', 'tickets', user.id);
  const relPath = path.posix.join(relDir, `${randomName}.webp`);
  const publicDir = path.join(process.cwd(), 'public');
  const absDir = path.join(publicDir, relDir);
  const absPath = path.join(publicDir, relPath);
  if (!absPath.startsWith(publicDir) || !absDir.startsWith(publicDir)) {
    logger.error('ticket upload: path traversal guard tripped', { relPath });
    return NextResponse.json({ ok: false, error: 'مسیر فایل نامعتبر است.' }, { status: 400 });
  }

  try {
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(absPath, outputBuffer, { flag: 'wx' });
  } catch (err) {
    logger.error('ticket upload: write failed', { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, error: 'ذخیره فایل ناموفق بود.' }, { status: 500 });
  }

  logger.info('ticket attachment uploaded', { userId: user.id, ip: await clientIp(), bytes: outputBuffer.length });

  return NextResponse.json({
    ok: true,
    path: `/${relPath}`,
    name: file.name?.slice(0, 120) ?? 'attachment.webp',
    size: outputBuffer.length,
    mime: 'image/webp',
  });
}
