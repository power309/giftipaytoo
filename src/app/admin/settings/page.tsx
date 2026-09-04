import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader } from '@/components/admin/kit';
import { SettingsClient, type FieldDef } from './client';
import { CannedResponsesPanel } from './canned-responses-client';

export const metadata = { title: 'تنظیمات' };

type SchemaShape = Record<
  string,
  { group: string; type: string; default: unknown; labelFa: string; descriptionFa?: string; secret?: boolean; options?: string[] }
>;

const FALLBACK_SCHEMA: SchemaShape = {
  'store.name': { group: 'store', type: 'string', default: 'گیفتی‌پی', labelFa: 'نام فروشگاه' },
  'store.tagline': { group: 'store', type: 'string', default: '', labelFa: 'شعار فروشگاه' },
  'checkout.guestCheckoutEnabled': { group: 'checkout', type: 'boolean', default: true, labelFa: 'امکان خرید بدون ثبت‌نام' },
  'payments.enabledGateways': { group: 'payments', type: 'stringArray', default: ['zarinpal', 'wallet'], labelFa: 'درگاه‌های پرداخت فعال', options: ['zarinpal', 'wallet', 'manual'] },
  'notifications.emailEnabled': { group: 'notifications', type: 'boolean', default: true, labelFa: 'ارسال اطلاعیه از طریق ایمیل' },
  'notifications.smsEnabled': { group: 'notifications', type: 'boolean', default: true, labelFa: 'ارسال اطلاعیه از طریق پیامک' },
  'seo.defaultTitle': { group: 'seo', type: 'string', default: 'گیفتی‌پی', labelFa: 'عنوان پیش‌فرض سئو' },
  'analytics.googleAnalyticsId': { group: 'analytics', type: 'string', default: '', labelFa: 'شناسه گوگل آنالیتیکس' },
  'system.maintenanceMode': { group: 'system', type: 'boolean', default: false, labelFa: 'حالت تعمیر و نگهداری' },
};

const GROUP_LABELS_FALLBACK: Record<string, string> = {
  identity: 'هویت فروشگاه', contact: 'اطلاعات تماس', social: 'شبکه‌های اجتماعی', checkout: 'تسویه حساب',
  risk: 'ریسک و بررسی سفارش', pricing: 'قیمت‌گذاری', payments: 'درگاه‌های پرداخت', notifications: 'اطلاع‌رسانی',
  seo: 'سئو', analytics: 'آمار و تحلیل', system: 'سیستم', store: 'فروشگاه',
};

/** Maps the schema's own groups onto the ten requested top-level tabs. */
const TAB_FOR_GROUP: Record<string, { key: string; label: string }> = {
  identity: { key: 'store', label: 'فروشگاه' },
  contact: { key: 'store', label: 'فروشگاه' },
  social: { key: 'store', label: 'فروشگاه' },
  store: { key: 'store', label: 'فروشگاه' },
  risk: { key: 'security', label: 'امنیت' },
  pricing: { key: 'store', label: 'فروشگاه' },
  checkout: { key: 'checkout', label: 'تسویه حساب' },
  payments: { key: 'payments', label: 'درگاه‌های پرداخت' },
  notifications: { key: 'notifications', label: 'اطلاع‌رسانی (ایمیل و پیامک)' },
  seo: { key: 'seo', label: 'سئو' },
  analytics: { key: 'analytics', label: 'آمار و تحلیل' },
  system: { key: 'maintenance', label: 'سیستم و نگهداری' },
};

async function loadSchema(): Promise<{ schema: SchemaShape; groupLabels: Record<string, string>; usedFallback: boolean }> {
  try {
    const mod = await import('@/server/settings');
    return { schema: mod.SETTINGS_SCHEMA as unknown as SchemaShape, groupLabels: mod.SETTING_GROUP_LABELS, usedFallback: false };
  } catch {
    return { schema: FALLBACK_SCHEMA, groupLabels: GROUP_LABELS_FALLBACK, usedFallback: true };
  }
}

async function loadCannedResponses(): Promise<{ label: string; body: string }[]> {
  try {
    const row = await db.setting.findUnique({ where: { key: 'support.cannedResponses' } });
    return (row?.value as { label: string; body: string }[] | undefined) ?? [];
  } catch {
    return [];
  }
}

export default async function SettingsPage() {
  await requirePermission('setting.manage');
  const { schema, usedFallback } = await loadSchema();
  const cannedResponses = await loadCannedResponses();

  const keys = Object.keys(schema);
  const rows = await db.setting.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const fields: FieldDef[] = keys.map((key) => {
    const def = schema[key];
    const row = byKey.get(key);
    const isSecret = !!def.secret;
    return {
      key,
      group: def.group,
      tabKey: TAB_FOR_GROUP[def.group]?.key ?? 'store',
      type: def.type as FieldDef['type'],
      labelFa: def.labelFa,
      descriptionFa: def.descriptionFa,
      options: def.options,
      secret: isSecret,
      secretConfigured: isSecret ? !!row && row.value !== '' && row.value !== null : undefined,
      value: isSecret ? null : (row ? row.value : def.default),
    };
  });

  const tabOrder = ['store', 'checkout', 'payments', 'notifications', 'security', 'seo', 'analytics', 'maintenance'];
  const tabLabels: Record<string, string> = {
    store: 'فروشگاه', checkout: 'تسویه حساب', payments: 'درگاه‌های پرداخت', notifications: 'اطلاع‌رسانی (ایمیل و پیامک)',
    security: 'امنیت', seo: 'سئو', analytics: 'آمار و تحلیل', maintenance: 'سیستم و نگهداری',
  };

  return (
    <div>
      <PageHeader title="تنظیمات" description="پیکربندی سراسری فروشگاه" />
      {usedFallback && (
        <p className="mb-4 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-xs text-warn">
          ماژول تنظیمات سراسری (SETTINGS_SCHEMA) هنوز در دسترس نیست؛ فرم فعلی از یک الگوی محدود موقت استفاده می‌کند.
        </p>
      )}
      <SettingsClient fields={fields} tabOrder={tabOrder} tabLabels={tabLabels} />
      <div className="mt-4">
        <CannedResponsesPanel initial={cannedResponses} />
      </div>
    </div>
  );
}
