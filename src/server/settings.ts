import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { audit } from './audit';
import { logger } from '@/lib/logger';

// `assertPermission` (src/server/auth/guard.ts) transitively imports
// `next/navigation` / `next/headers`, which only work inside an actual
// Next.js request. Read paths here (`getSetting`, `getSettings`,
// `getPublicSettings`) are also called from the standalone worker process
// and job handlers, which must never load that chain — so it's imported
// lazily, only inside `setSetting`, which is only ever called from an
// admin server action running inside a real Next.js request.
async function assertSettingManagePermission() {
  const { assertPermission } = await import('./auth/guard');
  return assertPermission('setting.manage');
}

/**
 * Typed, cached access over the `Setting` table.
 *
 * Reads are served from a short-TTL in-process cache so hot paths (checkout,
 * storefront rendering) never hit Postgres per-request. Writes go through
 * `setSetting`, which is permission-checked and audited, then invalidate the
 * cache so the new value is visible immediately in this process.
 *
 * `SETTINGS_SCHEMA` is the single source of truth for every known key: its
 * group, value type, default and Persian label. The admin settings UI is
 * expected to render itself entirely from this map (grouped sections, typed
 * inputs, defaults) rather than hard-coding a form per key.
 */

export type SettingType = 'string' | 'number' | 'boolean' | 'json' | 'stringArray';

export type SettingGroup =
  | 'identity'
  | 'contact'
  | 'social'
  | 'checkout'
  | 'risk'
  | 'pricing'
  | 'payments'
  | 'notifications'
  | 'seo'
  | 'analytics'
  | 'system';

export interface SettingDef {
  group: SettingGroup;
  type: SettingType;
  default: unknown;
  labelFa: string;
  descriptionFa?: string;
  /** Never exposed via getPublicSettings, regardless of the stored row. */
  secret?: boolean;
  /** For string/stringArray settings restricted to a fixed set of choices. */
  options?: string[];
}

export const SETTING_GROUP_LABELS: Record<SettingGroup, string> = {
  identity: 'هویت فروشگاه',
  contact: 'اطلاعات تماس',
  social: 'شبکه‌های اجتماعی',
  checkout: 'تسویه حساب',
  risk: 'ریسک و بررسی سفارش',
  pricing: 'قیمت‌گذاری',
  payments: 'درگاه‌های پرداخت',
  notifications: 'اطلاع‌رسانی',
  seo: 'سئو',
  analytics: 'آمار و تحلیل',
  system: 'سیستم',
};

export const SETTINGS_SCHEMA = {
  // ── Store identity ──────────────────────────────────────────
  'store.name': {
    group: 'identity',
    type: 'string',
    default: 'گیفتی‌پی',
    labelFa: 'نام فروشگاه',
  },
  'store.tagline': {
    group: 'identity',
    type: 'string',
    default: 'مرجع خرید گیفت‌کارت',
    labelFa: 'شعار فروشگاه',
  },
  'store.logoUrl': {
    group: 'identity',
    type: 'string',
    default: '',
    labelFa: 'آدرس لوگو',
  },

  // ── Contact info ─────────────────────────────────────────────
  'contact.email': {
    group: 'contact',
    type: 'string',
    default: 'support@giftipay.local',
    labelFa: 'ایمیل پشتیبانی',
  },
  'contact.phone': {
    group: 'contact',
    type: 'string',
    default: '',
    labelFa: 'شماره تماس پشتیبانی',
  },
  'contact.address': {
    group: 'contact',
    type: 'string',
    default: '',
    labelFa: 'آدرس دفتر',
  },

  // ── Social links ─────────────────────────────────────────────
  'social.instagram': { group: 'social', type: 'string', default: '', labelFa: 'اینستاگرام' },
  'social.telegram': { group: 'social', type: 'string', default: '', labelFa: 'تلگرام' },
  'social.twitter': { group: 'social', type: 'string', default: '', labelFa: 'ایکس (توییتر)' },

  // ── Checkout ─────────────────────────────────────────────────
  'checkout.taxPercent': {
    group: 'checkout',
    type: 'number',
    default: 0,
    labelFa: 'درصد مالیات بر ارزش افزوده',
  },
  'checkout.feeToman': {
    group: 'checkout',
    type: 'number',
    default: 0,
    labelFa: 'کارمزد ثابت تسویه حساب (تومان)',
  },
  'checkout.guestCheckoutEnabled': {
    group: 'checkout',
    type: 'boolean',
    default: true,
    labelFa: 'امکان خرید بدون ثبت‌نام',
  },
  'checkout.walletEnabled': {
    group: 'checkout',
    type: 'boolean',
    default: true,
    labelFa: 'فعال بودن کیف پول',
  },
  'checkout.minOrderToman': {
    group: 'checkout',
    type: 'number',
    default: 0,
    labelFa: 'حداقل مبلغ سفارش (تومان)',
  },
  'checkout.maxOrderToman': {
    group: 'checkout',
    type: 'number',
    default: 0,
    labelFa: 'حداکثر مبلغ سفارش (تومان، صفر یعنی نامحدود)',
  },

  // ── Risk ─────────────────────────────────────────────────────
  'risk.manualReviewThresholdToman': {
    group: 'risk',
    type: 'number',
    default: 20_000_000,
    labelFa: 'آستانه بررسی دستی سفارش (تومان)',
  },
  'risk.velocityOrderCount': {
    group: 'risk',
    type: 'number',
    default: 5,
    labelFa: 'حداکثر تعداد سفارش در بازه ریسک',
  },
  'risk.velocityWindowMinutes': {
    group: 'risk',
    type: 'number',
    default: 60,
    labelFa: 'بازه زمانی بررسی ریسک (دقیقه)',
  },
  'risk.guestThresholdToman': {
    group: 'risk',
    type: 'number',
    default: 5_000_000,
    labelFa: 'سقف سفارش مهمان بدون تأیید (تومان)',
  },
  'risk.highDenomToman': {
    group: 'risk',
    type: 'number',
    default: 3_000_000,
    labelFa: 'آستانه «کالای گران‌قیمت» در هر ردیف (تومان)',
  },
  'risk.highDenomLineCount': {
    group: 'risk',
    type: 'number',
    default: 3,
    labelFa: 'تعداد ردیف گران‌قیمت که سفارش را پرریسک می‌کند',
  },
  'risk.failedPaymentThreshold': {
    group: 'risk',
    type: 'number',
    default: 3,
    labelFa: 'تعداد پرداخت ناموفق از یک IP',
  },
  'risk.failedPaymentWindowMinutes': {
    group: 'risk',
    type: 'number',
    default: 60,
    labelFa: 'بازه شمارش پرداخت‌های ناموفق (دقیقه)',
  },
  'risk.newAccountHours': {
    group: 'risk',
    type: 'number',
    default: 2,
    labelFa: 'سن حساب که «تازه‌ساخت» شمرده می‌شود (ساعت)',
  },
  'risk.sharedIpAccountThreshold': {
    group: 'risk',
    type: 'number',
    default: 3,
    labelFa: 'تعداد حساب مجاز از یک IP',
  },
  'risk.sharedIpWindowHours': {
    group: 'risk',
    type: 'number',
    default: 24,
    labelFa: 'بازه بررسی حساب‌های هم‌IP (ساعت)',
  },
  'risk.verificationScore': {
    group: 'risk',
    type: 'number',
    default: 30,
    labelFa: 'امتیاز ریسکی که تأیید هویت را الزامی می‌کند',
  },
  'risk.manualReviewScore': {
    group: 'risk',
    type: 'number',
    default: 60,
    labelFa: 'امتیاز ریسکی که سفارش را به بررسی دستی می‌فرستد',
  },

  // ── Security ─────────────────────────────────────────────────
  'security.require2faForStaff': {
    group: 'security',
    type: 'boolean',
    default: false,
    labelFa: 'الزام ورود دومرحله‌ای برای همه کارکنان',
  },

  // ── Pricing ──────────────────────────────────────────────────
  'pricing.staleHours': {
    group: 'pricing',
    type: 'number',
    default: 24,
    labelFa: 'مدت اعتبار قیمت پیش از نیاز به به‌روزرسانی (ساعت)',
  },
  'pricing.approvalThresholdPercent': {
    group: 'pricing',
    type: 'number',
    default: 15,
    labelFa: 'آستانه درصد تغییر قیمت نیازمند تأیید',
  },

  // ── Payments ─────────────────────────────────────────────────
  'payments.enabledGateways': {
    group: 'payments',
    type: 'stringArray',
    default: ['zarinpal', 'wallet'],
    labelFa: 'درگاه‌های پرداخت فعال',
    options: ['zarinpal', 'wallet', 'manual'],
  },

  // ── Notifications ────────────────────────────────────────────
  'notifications.emailEnabled': {
    group: 'notifications',
    type: 'boolean',
    default: true,
    labelFa: 'ارسال اطلاعیه از طریق ایمیل',
  },
  'notifications.smsEnabled': {
    group: 'notifications',
    type: 'boolean',
    default: true,
    labelFa: 'ارسال اطلاعیه از طریق پیامک',
  },

  // ── SEO ──────────────────────────────────────────────────────
  'seo.defaultTitle': {
    group: 'seo',
    type: 'string',
    default: 'گیفتی‌پی | خرید گیفت‌کارت',
    labelFa: 'عنوان پیش‌فرض سئو',
  },
  'seo.defaultDescription': {
    group: 'seo',
    type: 'string',
    default: 'خرید آنلاین و آنی گیفت‌کارت با تحویل فوری.',
    labelFa: 'توضیحات پیش‌فرض سئو',
  },

  // ── Analytics ────────────────────────────────────────────────
  'analytics.googleAnalyticsId': {
    group: 'analytics',
    type: 'string',
    default: '',
    labelFa: 'شناسه گوگل آنالیتیکس',
  },
  'analytics.metaPixelId': {
    group: 'analytics',
    type: 'string',
    default: '',
    labelFa: 'شناسه پیکسل متا',
  },

  // ── System ───────────────────────────────────────────────────
  'system.maintenanceMode': {
    group: 'system',
    type: 'boolean',
    default: false,
    labelFa: 'حالت تعمیر و نگهداری',
    descriptionFa: 'در صورت فعال بودن، فروشگاه برای مشتریان غیرقابل دسترس می‌شود.',
  },
} as const satisfies Record<string, SettingDef>;

export type SettingKey = keyof typeof SETTINGS_SCHEMA;

// ── Cache ────────────────────────────────────────────────────────

const TTL_MS = 15_000;
type CacheEntry = { value: unknown; expiresAt: number };
const cache = new Map<string, CacheEntry>();

/** Clears the settings cache — one key, or everything when omitted. */
export function invalidateSettings(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

function cacheGet(key: string): { hit: boolean; value: unknown } {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return { hit: true, value: entry.value };
  return { hit: false, value: undefined };
}

function cacheSet(key: string, value: unknown): void {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

// ── Validation ───────────────────────────────────────────────────

function schemaFor(key: string): SettingDef | undefined {
  return (SETTINGS_SCHEMA as Record<string, SettingDef>)[key];
}

function validateValue(def: SettingDef, value: unknown): unknown {
  switch (def.type) {
    case 'string': {
      const v = z.string().max(2000).parse(value);
      if (def.options && !def.options.includes(v)) {
        throw new Error(`مقدار «${v}» برای این تنظیم مجاز نیست.`);
      }
      return v;
    }
    case 'number':
      return z.number().finite().parse(value);
    case 'boolean':
      return z.boolean().parse(value);
    case 'stringArray': {
      const arr = z.array(z.string()).parse(value);
      if (def.options) {
        for (const v of arr) {
          if (!def.options.includes(v)) throw new Error(`مقدار «${v}» برای این تنظیم مجاز نیست.`);
        }
      }
      return arr;
    }
    case 'json':
    default:
      return value;
  }
}

/** True when a key is declared secret in the schema — never sent to the client. */
export function isSecretSetting(key: string): boolean {
  return schemaFor(key)?.secret === true;
}

// ── Reads ────────────────────────────────────────────────────────

/**
 * Reads a single setting, cached with a short TTL. Falls back to `fallback`
 * (or the schema default, when no fallback is given and the key is known)
 * when the row is missing or the read fails — settings must never crash a
 * request path.
 */
export async function getSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  const cached = cacheGet(key);
  if (cached.hit) return cached.value as T;

  try {
    const row = await db.setting.findUnique({ where: { key } });
    const value = (row ? row.value : fallback) as T;
    cacheSet(key, value);
    return value;
  } catch (err) {
    logger.error('settings: read failed', { key, err });
    return fallback;
  }
}

/** Reads every known setting in a group, filling in schema defaults for unset keys. */
export async function getSettings(group: SettingGroup): Promise<Record<string, unknown>> {
  const keys = (Object.keys(SETTINGS_SCHEMA) as SettingKey[]).filter(
    (k) => SETTINGS_SCHEMA[k].group === group,
  );
  const out: Record<string, unknown> = {};

  try {
    const rows = await db.setting.findMany({ where: { group } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    for (const key of keys) {
      const value = byKey.has(key) ? byKey.get(key) : SETTINGS_SCHEMA[key].default;
      out[key] = value;
      cacheSet(key, value);
    }
  } catch (err) {
    logger.error('settings: group read failed', { group, err });
    for (const key of keys) out[key] = SETTINGS_SCHEMA[key].default;
  }

  return out;
}

/**
 * Every non-secret setting, flattened, with schema defaults filled in for
 * unset keys. Safe to send to the client as-is (e.g. to hydrate a storefront
 * layout or an admin settings form's public preview).
 */
export async function getPublicSettings(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const allKeys = Object.keys(SETTINGS_SCHEMA) as SettingKey[];

  try {
    const rows = await db.setting.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    for (const key of allKeys) {
      if (isSecretSetting(key)) continue;
      const row = byKey.get(key);
      if (row?.isSecret) continue; // defensive: DB-level override also honored
      out[key] = row ? row.value : SETTINGS_SCHEMA[key].default;
    }
  } catch (err) {
    logger.error('settings: public read failed', { err });
    for (const key of allKeys) {
      if (!isSecretSetting(key)) out[key] = SETTINGS_SCHEMA[key].default;
    }
  }

  return out;
}

// ── Writes ───────────────────────────────────────────────────────

export interface SetSettingOptions {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Writes a setting. Requires `setting.manage`. Validates the value against
 * the key's declared type, records an audit entry, and invalidates the
 * cache for that key so the new value is visible on the next read.
 */
export async function setSetting(
  key: string,
  value: unknown,
  opts: SetSettingOptions = {},
): Promise<{ key: string; value: unknown; group: string }> {
  const user = await assertSettingManagePermission();

  const def = schemaFor(key);
  if (!def) {
    throw new Error(`تنظیم «${key}» در سامانه تعریف نشده است.`);
  }
  const validated = validateValue(def, value);

  const before = await db.setting.findUnique({ where: { key } });
  const row = await db.setting.upsert({
    where: { key },
    create: {
      key,
      value: validated as Prisma.InputJsonValue,
      group: def.group,
      isSecret: !!def.secret,
      description: def.labelFa,
    },
    update: {
      value: validated as Prisma.InputJsonValue,
      isSecret: !!def.secret,
    },
  });

  invalidateSettings(key);

  await audit({
    action: 'setting.update',
    entity: 'Setting',
    entityId: key,
    actorId: user.id,
    actorType: 'STAFF',
    summary: `تغییر تنظیم ${key}`,
    before: before ? { value: before.value } : null,
    after: { value: row.value },
    ip: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
  });

  return { key: row.key, value: row.value, group: row.group };
}
