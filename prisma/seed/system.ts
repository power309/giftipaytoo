/**
 * System data: permissions, roles, staff users, currencies, exchange rates,
 * regions, platforms, customer groups, pricing rules, settings, ticket
 * departments, notification templates.
 */

import { env } from '@/lib/env';
import { hashPassword } from '@/lib/crypto';
import { PERMISSIONS, SYSTEM_ROLES, resolveRolePermissions, type PermissionKey } from '@/lib/permissions';
import { db, count, step, ok } from './lib';

export async function seedPermissionsAndRoles() {
  step('دسترسی‌ها و نقش‌ها (permissions & roles)');

  const permissionRows = (Object.keys(PERMISSIONS) as PermissionKey[]).map((key) => ({
    key,
    group: PERMISSIONS[key].group,
    nameFa: PERMISSIONS[key].nameFa,
    description: null as string | null,
  }));
  await db.permission.createMany({ data: permissionRows, skipDuplicates: true });
  count('permissions', permissionRows.length);
  ok(`${permissionRows.length} دسترسی`);

  const permissions = await db.permission.findMany({ select: { id: true, key: true } });
  const permByKey = new Map(permissions.map((p) => [p.key, p.id]));

  const roleSlugs = Object.keys(SYSTEM_ROLES);
  await db.role.createMany({
    data: roleSlugs.map((slug) => ({
      slug,
      nameFa: SYSTEM_ROLES[slug].nameFa,
      description: SYSTEM_ROLES[slug].description,
      isSystem: true,
    })),
    skipDuplicates: true,
  });
  count('roles', roleSlugs.length);
  ok(`${roleSlugs.length} نقش سیستمی`);

  const roles = await db.role.findMany({ select: { id: true, slug: true } });
  const roleByslug = new Map(roles.map((r) => [r.slug, r.id]));

  for (const slug of roleSlugs) {
    const roleId = roleByslug.get(slug)!;
    const perms = resolveRolePermissions(slug);
    await db.rolePermission.createMany({
      data: perms
        .map((k) => permByKey.get(k))
        .filter((v): v is string => Boolean(v))
        .map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });
  }
  ok('انتساب دسترسی‌ها به نقش‌ها انجام شد');

  return { roleByslug };
}

export async function seedStaffUsers(roleByslug: Map<string, string>) {
  step('کاربران کارمند (staff users)');

  const staffPasswordHash = await hashPassword('Staff@12345');
  const adminPasswordHash = await hashPassword(env.seed.adminPassword);

  // Super admin — real credentials, not a demo account.
  const admin = await db.user.upsert({
    where: { email: env.seed.adminEmail },
    update: {},
    create: {
      email: env.seed.adminEmail,
      emailVerifiedAt: new Date(),
      firstName: 'مدیر',
      lastName: 'ارشد',
      isStaff: true,
      isDemo: false,
      status: 'ACTIVE',
      passwordHash: adminPasswordHash,
    },
  });
  await db.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: roleByslug.get('super-admin')! } },
    update: {},
    create: { userId: admin.id, roleId: roleByslug.get('super-admin')! },
  });
  ok(`مدیر ارشد: ${env.seed.adminEmail}`);
  count('users', 1);

  const staffPeople: { email: string; role: string; firstName: string; lastName: string }[] = [
    { email: 'catalog@giftipay.local', role: 'catalog-manager', firstName: 'سارا', lastName: 'کریمی' },
    { email: 'orders@giftipay.local', role: 'order-manager', firstName: 'امیر', lastName: 'رضایی' },
    { email: 'support@giftipay.local', role: 'support', firstName: 'نگار', lastName: 'احمدی' },
    { email: 'content@giftipay.local', role: 'content-editor', firstName: 'مریم', lastName: 'حسینی' },
    { email: 'finance@giftipay.local', role: 'accountant', firstName: 'رضا', lastName: 'موسوی' },
  ];

  for (const person of staffPeople) {
    const user = await db.user.upsert({
      where: { email: person.email },
      update: {},
      create: {
        email: person.email,
        emailVerifiedAt: new Date(),
        firstName: person.firstName,
        lastName: person.lastName,
        isStaff: true,
        isDemo: true,
        status: 'ACTIVE',
        passwordHash: staffPasswordHash,
      },
    });
    const roleId = roleByslug.get(person.role);
    if (roleId) {
      await db.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        update: {},
        create: { userId: user.id, roleId },
      });
    }
    count('users', 1);
  }
  ok(`${staffPeople.length} کاربر کارمند دمو (رمز: Staff@12345)`);

  return { adminId: admin.id };
}

// ── Currencies + exchange rates ────────────────────────────────
// Demo Toman/unit rates. These are illustrative, editable seed values — NOT
// live market rates. An admin with `pricing.rate` can update them from
// /admin/pricing/rates at any time; ExchangeRate.source stays MANUAL here.
export const CURRENCIES: {
  code: string;
  nameFa: string;
  symbol: string;
  minorUnits: number;
  tomanPerUnit: number;
  sortOrder: number;
}[] = [
  { code: 'USD', nameFa: 'دلار آمریکا', symbol: '$', minorUnits: 2, tomanPerUnit: 89000, sortOrder: 0 },
  { code: 'USDT', nameFa: 'تتر', symbol: '₮', minorUnits: 2, tomanPerUnit: 90500, sortOrder: 1 },
  { code: 'EUR', nameFa: 'یورو', symbol: '€', minorUnits: 2, tomanPerUnit: 96000, sortOrder: 2 },
  { code: 'GBP', nameFa: 'پوند انگلیس', symbol: '£', minorUnits: 2, tomanPerUnit: 113000, sortOrder: 3 },
  { code: 'TRY', nameFa: 'لیر ترکیه', symbol: '₺', minorUnits: 2, tomanPerUnit: 2600, sortOrder: 4 },
  { code: 'AED', nameFa: 'درهم امارات', symbol: 'د.إ', minorUnits: 2, tomanPerUnit: 24300, sortOrder: 5 },
  { code: 'CAD', nameFa: 'دلار کانادا', symbol: 'C$', minorUnits: 2, tomanPerUnit: 65500, sortOrder: 6 },
  { code: 'AUD', nameFa: 'دلار استرالیا', symbol: 'A$', minorUnits: 2, tomanPerUnit: 59500, sortOrder: 7 },
  { code: 'JPY', nameFa: 'ین ژاپن', symbol: '¥', minorUnits: 0, tomanPerUnit: 593, sortOrder: 8 },
  { code: 'BRL', nameFa: 'رئال برزیل', symbol: 'R$', minorUnits: 2, tomanPerUnit: 16800, sortOrder: 9 },
  { code: 'INR', nameFa: 'روپیه هند', symbol: '₹', minorUnits: 2, tomanPerUnit: 1070, sortOrder: 10 },
  { code: 'RUB', nameFa: 'روبل روسیه', symbol: '₽', minorUnits: 2, tomanPerUnit: 937, sortOrder: 11 },
  { code: 'PLN', nameFa: 'زلوتی لهستان', symbol: 'zł', minorUnits: 2, tomanPerUnit: 22250, sortOrder: 12 },
  { code: 'SAR', nameFa: 'ریال سعودی', symbol: 'ر.س', minorUnits: 2, tomanPerUnit: 23730, sortOrder: 13 },
  { code: 'QAR', nameFa: 'ریال قطر', symbol: 'ر.ق', minorUnits: 2, tomanPerUnit: 24450, sortOrder: 14 },
];

export async function seedCurrencies() {
  step('ارزها و نرخ تبدیل (currencies & exchange rates)');

  await db.currency.createMany({
    data: CURRENCIES.map((c) => ({
      code: c.code,
      nameFa: c.nameFa,
      symbol: c.symbol,
      minorUnits: c.minorUnits,
      sortOrder: c.sortOrder,
    })),
    skipDuplicates: true,
  });
  count('currencies', CURRENCIES.length);

  for (const c of CURRENCIES) {
    const existing = await db.exchangeRate.findFirst({
      where: { currencyCode: c.code, isActive: true },
      orderBy: { effectiveAt: 'desc' },
    });
    if (existing && existing.tomanPerUnit === c.tomanPerUnit) continue;
    if (existing) await db.exchangeRate.update({ where: { id: existing.id }, data: { isActive: false } });
    await db.exchangeRate.create({
      data: {
        currencyCode: c.code,
        tomanPerUnit: c.tomanPerUnit,
        source: 'MANUAL',
        note: 'نرخ نمونه محیط دمو — قابل ویرایش از پنل مدیریت، نه نرخ لحظه‌ای بازار.',
        isActive: true,
      },
    });
    count('exchangeRates', 1);
  }
  ok(`${CURRENCIES.length} ارز + نرخ تبدیل`);

  return new Map(CURRENCIES.map((c) => [c.code, c.tomanPerUnit]));
}

// ── Regions ───────────────────────────────────────────────────
const REGIONS: { code: string; nameFa: string; nameEn: string; flag: string; currencyCode: string | null; sortOrder: number; notesFa?: string }[] = [
  { code: 'GLOBAL', nameFa: 'جهانی', nameEn: 'Global', flag: '🌐', currencyCode: 'USD', sortOrder: 0, notesFa: 'بدون محدودیت ریجن؛ روی اکثر حساب‌ها قابل استفاده است.' },
  { code: 'US', nameFa: 'آمریکا', nameEn: 'United States', flag: '🇺🇸', currencyCode: 'USD', sortOrder: 1, notesFa: 'مخصوص حساب‌های ریجن آمریکا.' },
  { code: 'UK', nameFa: 'بریتانیا', nameEn: 'United Kingdom', flag: '🇬🇧', currencyCode: 'GBP', sortOrder: 2 },
  { code: 'EU', nameFa: 'اتحادیه اروپا', nameEn: 'European Union', flag: '🇪🇺', currencyCode: 'EUR', sortOrder: 3 },
  { code: 'TR', nameFa: 'ترکیه', nameEn: 'Turkey', flag: '🇹🇷', currencyCode: 'TRY', sortOrder: 4, notesFa: 'برای فعال‌سازی معمولاً به VPN با IP ترکیه نیاز است.' },
  { code: 'CA', nameFa: 'کانادا', nameEn: 'Canada', flag: '🇨🇦', currencyCode: 'CAD', sortOrder: 5 },
  { code: 'AU', nameFa: 'استرالیا', nameEn: 'Australia', flag: '🇦🇺', currencyCode: 'AUD', sortOrder: 6 },
  { code: 'JP', nameFa: 'ژاپن', nameEn: 'Japan', flag: '🇯🇵', currencyCode: 'JPY', sortOrder: 7 },
  { code: 'BR', nameFa: 'برزیل', nameEn: 'Brazil', flag: '🇧🇷', currencyCode: 'BRL', sortOrder: 8 },
  { code: 'IN', nameFa: 'هند', nameEn: 'India', flag: '🇮🇳', currencyCode: 'INR', sortOrder: 9 },
  { code: 'AE', nameFa: 'امارات', nameEn: 'United Arab Emirates', flag: '🇦🇪', currencyCode: 'AED', sortOrder: 10 },
  { code: 'SA', nameFa: 'عربستان', nameEn: 'Saudi Arabia', flag: '🇸🇦', currencyCode: 'SAR', sortOrder: 11 },
  { code: 'RU', nameFa: 'روسیه', nameEn: 'Russia', flag: '🇷🇺', currencyCode: 'RUB', sortOrder: 12 },
  { code: 'PL', nameFa: 'لهستان', nameEn: 'Poland', flag: '🇵🇱', currencyCode: 'PLN', sortOrder: 13 },
  { code: 'DE', nameFa: 'آلمان', nameEn: 'Germany', flag: '🇩🇪', currencyCode: 'EUR', sortOrder: 14 },
  { code: 'FR', nameFa: 'فرانسه', nameEn: 'France', flag: '🇫🇷', currencyCode: 'EUR', sortOrder: 15 },
  { code: 'IR', nameFa: 'ایران', nameEn: 'Iran', flag: '🇮🇷', currencyCode: null, sortOrder: 16, notesFa: 'شارژ مستقیم اپراتور داخلی — بدون نیاز به تبدیل ارز.' },
];

export async function seedRegions() {
  step('ریجن‌ها (regions)');
  await db.region.createMany({
    data: REGIONS.map((r) => ({
      code: r.code,
      nameFa: r.nameFa,
      nameEn: r.nameEn,
      flagEmoji: r.flag,
      currencyCode: r.currencyCode,
      notesFa: r.notesFa ?? null,
      sortOrder: r.sortOrder,
    })),
    skipDuplicates: true,
  });
  count('regions', REGIONS.length);
  ok(`${REGIONS.length} ریجن`);
}

// ── Platforms ─────────────────────────────────────────────────
const PLATFORMS: { slug: string; nameFa: string; nameEn: string; sortOrder: number }[] = [
  { slug: 'playstation', nameFa: 'پلی‌استیشن', nameEn: 'PlayStation', sortOrder: 0 },
  { slug: 'xbox', nameFa: 'ایکس‌باکس', nameEn: 'Xbox', sortOrder: 1 },
  { slug: 'pc-steam', nameFa: 'کامپیوتر / استیم', nameEn: 'PC / Steam', sortOrder: 2 },
  { slug: 'nintendo', nameFa: 'نینتندو', nameEn: 'Nintendo', sortOrder: 3 },
  { slug: 'mobile-ios', nameFa: 'موبایل (iOS)', nameEn: 'Mobile (iOS)', sortOrder: 4 },
  { slug: 'mobile-android', nameFa: 'موبایل (اندروید)', nameEn: 'Mobile (Android)', sortOrder: 5 },
  { slug: 'web', nameFa: 'وب / آنلاین', nameEn: 'Web', sortOrder: 6 },
  { slug: 'multi-platform', nameFa: 'چندسکویی', nameEn: 'Multi-platform', sortOrder: 7 },
];

export async function seedPlatforms() {
  step('پلتفرم‌ها (platforms)');
  await db.platform.createMany({
    data: PLATFORMS.map((p) => ({ slug: p.slug, nameFa: p.nameFa, nameEn: p.nameEn, sortOrder: p.sortOrder })),
    skipDuplicates: true,
  });
  count('platforms', PLATFORMS.length);
  ok(`${PLATFORMS.length} پلتفرم`);
}

// ── Customer groups ───────────────────────────────────────────
const CUSTOMER_GROUPS: { slug: string; nameFa: string; description: string; discountPercent: number; isReseller: boolean; minSpendToman: number; priority: number }[] = [
  { slug: 'regular', nameFa: 'عادی', description: 'گروه پیش‌فرض همه مشتریان تازه‌وارد.', discountPercent: 0, isReseller: false, minSpendToman: 0, priority: 0 },
  { slug: 'silver', nameFa: 'نقره‌ای', description: 'مشتریانی با حداقل خرید تجمعی مشخص.', discountPercent: 2, isReseller: false, minSpendToman: 5_000_000, priority: 1 },
  { slug: 'gold', nameFa: 'طلایی', description: 'مشتریان پرتراکنش با تخفیف بیشتر.', discountPercent: 4, isReseller: false, minSpendToman: 20_000_000, priority: 2 },
  { slug: 'reseller', nameFa: 'همکار / ریسلر', description: 'همکاران فروش عمده با نرخ ویژه.', discountPercent: 8, isReseller: true, minSpendToman: 0, priority: 3 },
];

export async function seedCustomerGroups() {
  step('گروه‌های مشتری (customer groups)');
  await db.customerGroup.createMany({
    data: CUSTOMER_GROUPS.map((g) => ({
      slug: g.slug,
      nameFa: g.nameFa,
      description: g.description,
      discountPercent: g.discountPercent,
      isReseller: g.isReseller,
      minSpendToman: g.minSpendToman,
      priority: g.priority,
    })),
    skipDuplicates: true,
  });
  count('customerGroups', CUSTOMER_GROUPS.length);
  ok(`${CUSTOMER_GROUPS.length} گروه مشتری`);
}

// ── Pricing rules ─────────────────────────────────────────────
// GLOBAL rule always exists; brand/category scoped rules override it for
// specific product families where margins genuinely differ in the market
// (mobile top-ups run on thin margins, subscriptions carry richer ones).
export async function seedPricingRules(opts: {
  mobileTopupCategoryId: string;
  streamingCategoryId: string;
  steamBrandId: string;
  playstationBrandId: string;
}) {
  step('قوانین قیمت‌گذاری (pricing rules)');

  const rules: {
    nameFa: string;
    scope: 'GLOBAL' | 'CATEGORY' | 'BRAND';
    targetId: string | null;
    marginType: 'PERCENT' | 'FIXED';
    marginValue: number;
    minProfitToman: number;
    roundingMode: 'NEAREST' | 'UP' | 'DOWN' | 'NONE';
    roundingStep: number;
    priority: number;
  }[] = [
    { nameFa: 'قانون عمومی سود', scope: 'GLOBAL', targetId: null, marginType: 'PERCENT', marginValue: 9, minProfitToman: 15_000, roundingMode: 'NEAREST', roundingStep: 1000, priority: 0 },
    { nameFa: 'شارژ سیم‌کارت (حاشیه سود کم)', scope: 'CATEGORY', targetId: opts.mobileTopupCategoryId, marginType: 'PERCENT', marginValue: 3, minProfitToman: 1000, roundingMode: 'NEAREST', roundingStep: 500, priority: 5 },
    { nameFa: 'اشتراک‌های استریم', scope: 'CATEGORY', targetId: opts.streamingCategoryId, marginType: 'PERCENT', marginValue: 12, minProfitToman: 12_000, roundingMode: 'NEAREST', roundingStep: 1000, priority: 5 },
    { nameFa: 'استیم (بازار رقابتی)', scope: 'BRAND', targetId: opts.steamBrandId, marginType: 'PERCENT', marginValue: 7, minProfitToman: 10_000, roundingMode: 'NEAREST', roundingStep: 1000, priority: 10 },
    { nameFa: 'پلی‌استیشن', scope: 'BRAND', targetId: opts.playstationBrandId, marginType: 'PERCENT', marginValue: 10, minProfitToman: 20_000, roundingMode: 'NEAREST', roundingStep: 1000, priority: 10 },
  ];

  for (const r of rules) {
    const existing = await db.pricingRule.findFirst({ where: { nameFa: r.nameFa, scope: r.scope, targetId: r.targetId } });
    if (existing) continue;
    await db.pricingRule.create({ data: r });
    count('pricingRules', 1);
  }
  ok(`${rules.length} قانون قیمت‌گذاری`);
}

// ── Settings ──────────────────────────────────────────────────
export async function seedSettings() {
  step('تنظیمات سیستم (settings)');

  const settings: { key: string; value: unknown; group: string; description: string }[] = [
    {
      key: 'store.info',
      group: 'store',
      description: 'اطلاعات پایه فروشگاه',
      value: {
        nameFa: env.appName,
        nameEn: 'GiftiPay',
        supportEmail: 'support@giftipay.local',
        supportPhone: '02100000000',
        addressFa: 'ایران — فروشگاه صرفاً آنلاین است و آدرس فیزیکی برای مراجعه حضوری ندارد.',
      },
    },
    {
      key: 'tax.percent',
      group: 'store',
      description: 'درصد مالیات بر ارزش افزوده. صفر است چون کالای دیجیتال (کد گیفت‌کارت) طبق رویه فعلی مشمول این مالیات نمی‌شود؛ در صورت تغییر قوانین باید بازبینی شود.',
      value: { percent: 0 },
    },
    {
      key: 'checkout.fees',
      group: 'checkout',
      description: 'کارمزد ثابت/درصدی درگاه پرداخت به تفکیک روش',
      value: { gatewayFeeToman: 0, gatewayFeePercent: 0, walletFeeToman: 0 },
    },
    {
      key: 'risk.rules',
      group: 'risk',
      description: 'آستانه‌های تشخیص سفارش پرریسک برای بررسی دستی',
      value: {
        maxOrderToTomanAutoApprove: 15_000_000,
        newAccountHours: 2,
        maxOrdersPerDayPerUser: 6,
        highRiskScore: 60,
      },
    },
    {
      key: 'seo.defaults',
      group: 'seo',
      description: 'عنوان و توضیحات پیش‌فرض سئو',
      value: {
        titleSuffix: ' | گیفتی‌پی',
        defaultDescription: 'خرید آنلاین انواع گیفت‌کارت، اشتراک و ارز بازی با تحویل آنی و پشتیبانی فارسی.',
      },
    },
    {
      key: 'features.flags',
      group: 'features',
      description: 'سوییچ‌های فعال/غیرفعال‌سازی قابلیت‌ها',
      value: { guestCheckout: true, wallet: true, loyaltyPoints: true, reviews: true, resellerPricing: true },
    },
    {
      key: 'pricing.staleness',
      group: 'pricing',
      description: 'حداکثر عمر مجاز نرخ ارز قبل از قفل‌شدن قیمت‌گذاری خودکار',
      value: { maxAgeHours: env.limits.priceStaleBlockHours, approvalThresholdPercent: env.limits.priceApprovalThresholdPercent },
    },
  ];

  for (const s of settings) {
    await db.setting.upsert({
      where: { key: s.key },
      update: { value: s.value as never, group: s.group, description: s.description },
      create: { key: s.key, value: s.value as never, group: s.group, description: s.description },
    });
    count('settings', 1);
  }
  ok(`${settings.length} تنظیم`);
}

// ── Ticket departments ────────────────────────────────────────
const TICKET_DEPARTMENTS = [
  { slug: 'sales', nameFa: 'فروش', sortOrder: 0 },
  { slug: 'technical-support', nameFa: 'پشتیبانی فنی', sortOrder: 1 },
  { slug: 'finance-refunds', nameFa: 'مالی و بازپرداخت', sortOrder: 2 },
  { slug: 'partnerships', nameFa: 'همکاری', sortOrder: 3 },
];

export async function seedTicketDepartments() {
  step('دپارتمان‌های تیکت (ticket departments)');
  await db.ticketDepartment.createMany({ data: TICKET_DEPARTMENTS, skipDuplicates: true });
  count('ticketDepartments', TICKET_DEPARTMENTS.length);
  ok(`${TICKET_DEPARTMENTS.length} دپارتمان`);
}

// ── Notification templates ───────────────────────────────────
type TplRow = { key: string; channel: 'EMAIL' | 'SMS'; subject: string | null; body: string };

const NOTIFICATION_TEMPLATES: TplRow[] = [
  { key: 'welcome', channel: 'EMAIL', subject: 'به گیفتی‌پی خوش آمدید', body: 'سلام {{firstName}} عزیز،\nثبت‌نام شما در گیفتی‌پی با موفقیت انجام شد. از این پس می‌توانید گیفت‌کارت، اشتراک و ارز بازی مورد نظرتان را با تحویل آنی خریداری کنید.' },
  { key: 'welcome', channel: 'SMS', subject: null, body: 'گیفتی‌پی: {{firstName}} عزیز، ثبت‌نام شما با موفقیت انجام شد. خوش آمدید!' },
  { key: 'verify-email', channel: 'EMAIL', subject: 'تأیید ایمیل شما', body: 'برای تأیید ایمیل خود روی لینک زیر کلیک کنید:\n{{verifyUrl}}\nاین لینک تا {{expiresInMinutes}} دقیقه دیگر معتبر است.' },
  { key: 'verify-phone', channel: 'SMS', subject: null, body: 'گیفتی‌پی: کد تأیید شما {{code}} است. این کد تا {{expiresInMinutes}} دقیقه معتبر است.' },
  { key: 'password-reset', channel: 'EMAIL', subject: 'بازیابی گذرواژه', body: 'درخواست بازنشانی گذرواژه برای حساب شما ثبت شد. برای ادامه روی لینک زیر بزنید:\n{{resetUrl}}\nاگر این درخواست از طرف شما نبوده، این پیام را نادیده بگیرید.' },
  { key: 'order-paid', channel: 'EMAIL', subject: 'پرداخت سفارش {{orderNumber}} تأیید شد', body: 'سفارش {{orderNumber}} به مبلغ {{totalToman}} تومان با موفقیت پرداخت شد و در حال آماده‌سازی برای تحویل است.' },
  { key: 'order-paid', channel: 'SMS', subject: null, body: 'گیفتی‌پی: پرداخت سفارش {{orderNumber}} تأیید شد. کد شما به‌زودی ارسال می‌شود.' },
  { key: 'order-delivered', channel: 'EMAIL', subject: 'کد سفارش {{orderNumber}} آماده است', body: 'کد یا کدهای سفارش {{orderNumber}} صادر شد. برای مشاهده و راهنمای فعال‌سازی به حساب کاربری خود مراجعه کنید:\n{{orderUrl}}' },
  { key: 'order-delivered', channel: 'SMS', subject: null, body: 'گیفتی‌پی: کد سفارش {{orderNumber}} آماده است. از پنل کاربری مشاهده کنید.' },
  { key: 'order-failed', channel: 'EMAIL', subject: 'مشکلی در سفارش {{orderNumber}} پیش آمد', body: 'متأسفانه در پردازش سفارش {{orderNumber}} مشکلی رخ داد. تیم پشتیبانی در حال بررسی است و در صورت نیاز مبلغ بازگشت داده می‌شود.' },
  { key: 'refund-processed', channel: 'EMAIL', subject: 'بازپرداخت سفارش {{orderNumber}} انجام شد', body: 'مبلغ {{amountToman}} تومان بابت سفارش {{orderNumber}} به {{method}} شما بازگردانده شد.' },
  { key: 'refund-processed', channel: 'SMS', subject: null, body: 'گیفتی‌پی: مبلغ {{amountToman}} تومان بازپرداخت سفارش {{orderNumber}} واریز شد.' },
  { key: 'ticket-reply', channel: 'EMAIL', subject: 'پاسخ جدید برای تیکت {{ticketNumber}}', body: 'کارشناسان ما به تیکت شما با موضوع «{{subject}}» پاسخ دادند. برای مشاهده به پنل کاربری مراجعه کنید:\n{{ticketUrl}}' },
  { key: 'low-stock-admin', channel: 'EMAIL', subject: 'هشدار موجودی کم: {{variantName}}', body: 'موجودی «{{variantName}}» به {{remaining}} عدد رسیده که کمتر از آستانه {{threshold}} است. لطفاً موجودی را تأمین کنید.' },
  { key: 'manual-review-admin', channel: 'EMAIL', subject: 'سفارش {{orderNumber}} نیاز به بررسی دارد', body: 'سفارش {{orderNumber}} با امتیاز ریسک {{riskScore}} برای بررسی دستی علامت‌گذاری شد. دلایل: {{riskFlags}}' },
];

export async function seedNotificationTemplates() {
  step('قالب‌های اعلان (notification templates)');
  for (const t of NOTIFICATION_TEMPLATES) {
    await db.notificationTemplate.upsert({
      where: { key_channel: { key: t.key, channel: t.channel } },
      update: { subject: t.subject, body: t.body },
      create: t,
    });
    count('notificationTemplates', 1);
  }
  ok(`${NOTIFICATION_TEMPLATES.length} قالب اعلان`);
}
