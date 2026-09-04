'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { logger } from '@/lib/logger';
import type { ActionResult } from '@/app/admin/orders/_lib';

function fail(error: string): ActionResult {
  return { ok: false, error };
}
function ok(message?: string): ActionResult {
  return { ok: true, message };
}

/** Writes a raw Setting row not declared in SETTINGS_SCHEMA (OG defaults, robots.txt) — same table, permission and audit trail as the schema-driven settings writer, just without the schema-validated `setSetting()` wrapper since these keys aren't part of that catalog. */
async function writeRawSetting(key: string, value: unknown, group: string, actorId: string) {
  const before = await db.setting.findUnique({ where: { key } });
  await db.setting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, group },
    update: { value: value as Prisma.InputJsonValue },
  });
  await audit({ action: 'setting.update', entity: 'Setting', entityId: key, actorId, actorType: 'STAFF', before: before ? { value: before.value } : null, after: { value } });
}

const metaSchema = z.object({ defaultTitle: z.string().min(1).max(200), defaultDescription: z.string().min(1).max(400) });

export async function saveSeoDefaults(input: z.infer<typeof metaSchema>): Promise<ActionResult> {
  const parsed = metaSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('seo.manage');

  try {
    const { setSetting } = await import('@/server/settings');
    await setSetting('seo.defaultTitle', parsed.data.defaultTitle);
    await setSetting('seo.defaultDescription', parsed.data.defaultDescription);
  } catch (err) {
    logger.error('saveSeoDefaults: settings module unavailable', { err: err instanceof Error ? err.message : String(err) });
    return fail('ماژول تنظیمات هنوز آماده نیست.');
  }
  revalidatePath('/admin/seo');
  return ok('قالب‌های پیش‌فرض سئو ذخیره شد.');
}

const ogSchema = z.object({ title: z.string().max(200).optional(), description: z.string().max(400).optional(), image: z.string().max(300).optional() });

export async function saveOgDefaults(input: z.infer<typeof ogSchema>): Promise<ActionResult> {
  const parsed = ogSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('seo.manage');

  await writeRawSetting('seo.ogDefaults', { title: parsed.data.title ?? '', description: parsed.data.description ?? '', image: parsed.data.image ?? '' }, 'seo', user.id);
  revalidatePath('/admin/seo');
  return ok('پیش‌فرض‌های Open Graph ذخیره شد.');
}

const robotsSchema = z.object({ content: z.string().max(5000) });

export async function saveRobotsTxt(input: z.infer<typeof robotsSchema>): Promise<ActionResult> {
  const parsed = robotsSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('seo.manage');

  await writeRawSetting('seo.robotsTxt', parsed.data.content, 'seo', user.id);
  revalidatePath('/admin/seo');
  return ok('محتوای robots.txt ذخیره شد.');
}

// ── Redirects ────────────────────────────────────────────────────

const redirectSchema = z.object({
  id: z.string().optional(),
  fromPath: z.string().min(1, 'مسیر مبدأ الزامی است.').max(400),
  toPath: z.string().min(1, 'مسیر مقصد الزامی است.').max(400),
  statusCode: z.coerce.number().int().refine((v) => [301, 302, 307, 308].includes(v), 'کد وضعیت نامعتبر است.'),
  isActive: z.coerce.boolean(),
});

async function detectsLoop(fromPath: string, toPath: string, excludeId?: string): Promise<boolean> {
  let current = toPath;
  const visited = new Set<string>();
  for (let i = 0; i < 10; i++) {
    if (current === fromPath) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    const next = await db.redirect.findFirst({ where: { fromPath: current, isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (!next) return false;
    current = next.toPath;
  }
  return true; // exceeded hop limit — treat as a loop for safety
}

export async function saveRedirect(input: z.infer<typeof redirectSchema>): Promise<ActionResult> {
  const parsed = redirectSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const user = await assertPermission('seo.manage');
  const d = parsed.data;

  const fromPath = d.fromPath.startsWith('/') ? d.fromPath : `/${d.fromPath}`;
  let toPath = d.toPath;

  if (toPath.startsWith('http')) {
    try {
      const { env } = await import('@/lib/env');
      const target = new URL(toPath);
      const own = new URL(env.appUrl);
      if (target.hostname !== own.hostname) return fail('ریدایرکت به دامنه دیگر (Open Redirect) مجاز نیست.');
      toPath = target.pathname + target.search;
    } catch {
      return fail('آدرس مقصد نامعتبر است.');
    }
  } else if (!toPath.startsWith('/')) {
    toPath = `/${toPath}`;
  }

  if (fromPath === toPath) return fail('مسیر مبدأ و مقصد نمی‌توانند یکسان باشند.');
  if (await detectsLoop(fromPath, toPath, d.id)) return fail('این ریدایرکت باعث ایجاد حلقه (Redirect Loop) می‌شود.');

  try {
    if (d.id) {
      const before = await db.redirect.findUnique({ where: { id: d.id } });
      if (!before) return fail('ریدایرکت یافت نشد.');
      await db.redirect.update({ where: { id: d.id }, data: { fromPath, toPath, statusCode: d.statusCode, isActive: d.isActive } });
      await audit({ action: 'redirect.update', entity: 'Redirect', entityId: d.id, actorId: user.id, actorType: 'STAFF', before, after: { fromPath, toPath, statusCode: d.statusCode } });
    } else {
      const created = await db.redirect.create({ data: { fromPath, toPath, statusCode: d.statusCode, isActive: d.isActive } });
      await audit({ action: 'redirect.create', entity: 'Redirect', entityId: created.id, actorId: user.id, actorType: 'STAFF', after: { fromPath, toPath, statusCode: d.statusCode } });
    }
  } catch (err) {
    if (err instanceof Error && /Unique constraint/i.test(err.message)) return fail('ریدایرکتی برای این مسیر مبدأ قبلاً ثبت شده است.');
    throw err;
  }

  revalidatePath('/admin/seo');
  return ok(d.id ? 'ریدایرکت به‌روزرسانی شد.' : 'ریدایرکت ایجاد شد.');
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteRedirect(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('seo.manage');

  await db.redirect.delete({ where: { id: parsed.data.id } });
  await audit({ action: 'redirect.delete', entity: 'Redirect', entityId: parsed.data.id, actorId: user.id, actorType: 'STAFF' });
  revalidatePath('/admin/seo');
  return ok('ریدایرکت حذف شد.');
}
