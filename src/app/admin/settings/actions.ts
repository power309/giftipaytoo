'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertPermission } from '@/server/auth/guard';
import { clientIp } from '@/server/auth/session';
import { logger } from '@/lib/logger';
import type { ActionResult } from '@/app/admin/orders/_lib';

function fail(error: string): ActionResult {
  return { ok: false, error };
}
function ok(message?: string): ActionResult {
  return { ok: true, message };
}

const setSchema = z.object({ key: z.string().min(1), value: z.unknown() });

export async function saveSetting(input: z.infer<typeof setSchema>): Promise<ActionResult> {
  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');

  try {
    const { setSetting } = await import('@/server/settings');
    const ip = await clientIp().catch(() => null);
    await setSetting(parsed.data.key, parsed.data.value, { ip });
  } catch (err) {
    if (err instanceof Error && /دسترسی|مجاز/.test(err.message)) return fail(err.message);
    logger.error('saveSetting failed', { key: parsed.data.key, err: err instanceof Error ? err.message : String(err) });
    return fail(err instanceof Error ? err.message : 'ذخیره تنظیم با خطا مواجه شد.');
  }
  revalidatePath('/admin/settings');
  return ok('تنظیم ذخیره شد.');
}

const cannedSchema = z.object({ items: z.array(z.object({ label: z.string().min(1).max(80), body: z.string().min(1).max(2000) })).max(50) });

/** Canned ticket responses live under a Setting key not declared in SETTINGS_SCHEMA (support content, not a system config toggle) — written directly via `db`, permission-checked and audited here, same as `setSetting()` would. */
export async function saveCannedResponses(input: z.infer<typeof cannedSchema>): Promise<ActionResult> {
  const parsed = cannedSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('setting.manage');

  const { db } = await import('@/server/db');
  const { audit } = await import('@/server/audit');
  const before = await db.setting.findUnique({ where: { key: 'support.cannedResponses' } });
  await db.setting.upsert({
    where: { key: 'support.cannedResponses' },
    create: { key: 'support.cannedResponses', value: parsed.data.items, group: 'system', description: 'پاسخ‌های آماده پشتیبانی' },
    update: { value: parsed.data.items },
  });
  await audit({ action: 'setting.update', entity: 'Setting', entityId: 'support.cannedResponses', actorId: user.id, actorType: 'STAFF', before: before ? { value: before.value } : null, after: { value: parsed.data.items } });

  revalidatePath('/admin/settings');
  return ok('پاسخ‌های آماده ذخیره شد.');
}

const testEmailSchema = z.object({ to: z.string().email('ایمیل معتبر نیست.') });

export async function sendTestEmail(input: z.infer<typeof testEmailSchema>): Promise<ActionResult> {
  const parsed = testEmailSchema.safeParse(input);
  if (!parsed.success) return fail('ایمیل معتبر نیست.');
  await assertPermission('setting.manage');

  try {
    const { emailAdapter } = await import('@/server/notifications/email');
    if (!emailAdapter.isConfigured()) return fail('سرویس ایمیل پیکربندی نشده است.');
    const result = await emailAdapter.send({ subject: 'ایمیل آزمایشی گیفتی‌پی', bodyText: 'این یک پیام آزمایشی از پنل مدیریت گیفتی‌پی است.', to: parsed.data.to });
    if (!result.ok) return fail(result.error ?? 'ارسال ایمیل ناموفق بود.');
    return ok('ایمیل آزمایشی با موفقیت ارسال شد.');
  } catch (err) {
    logger.error('sendTestEmail: module unavailable', { err: err instanceof Error ? err.message : String(err) });
    return fail('ماژول ایمیل هنوز آماده نیست.');
  }
}

const testSmsSchema = z.object({ to: z.string().min(10, 'شماره موبایل معتبر نیست.').max(15) });

export async function sendTestSms(input: z.infer<typeof testSmsSchema>): Promise<ActionResult> {
  const parsed = testSmsSchema.safeParse(input);
  if (!parsed.success) return fail('شماره موبایل معتبر نیست.');
  await assertPermission('setting.manage');

  try {
    const { smsAdapter } = await import('@/server/notifications/sms');
    if (!smsAdapter.isConfigured()) return fail('سرویس پیامک پیکربندی نشده است.');
    const result = await smsAdapter.send({ bodyText: 'این یک پیام آزمایشی از پنل مدیریت گیفتی‌پی است.', to: parsed.data.to });
    if (!result.ok) return fail(result.error ?? 'ارسال پیامک ناموفق بود.');
    return ok('پیامک آزمایشی با موفقیت ارسال شد.');
  } catch (err) {
    logger.error('sendTestSms: module unavailable', { err: err instanceof Error ? err.message : String(err) });
    return fail('ماژول پیامک هنوز آماده نیست.');
  }
}
