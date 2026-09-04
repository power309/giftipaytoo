/**
 * Permission catalog. Every protected server action must check one of these.
 * Keys are stable identifiers stored in the `permissions` table.
 */

export const PERMISSIONS = {
  // Dashboard & reports
  'dashboard.view': { group: 'داشبورد', nameFa: 'مشاهده داشبورد' },
  'report.view': { group: 'داشبورد', nameFa: 'مشاهده گزارش‌ها' },
  'report.export': { group: 'داشبورد', nameFa: 'خروجی گرفتن از گزارش‌ها' },

  // Catalog
  'product.view': { group: 'کاتالوگ', nameFa: 'مشاهده محصولات' },
  'product.create': { group: 'کاتالوگ', nameFa: 'ایجاد محصول' },
  'product.update': { group: 'کاتالوگ', nameFa: 'ویرایش محصول' },
  'product.delete': { group: 'کاتالوگ', nameFa: 'حذف/آرشیو محصول' },
  'product.import': { group: 'کاتالوگ', nameFa: 'ورود گروهی محصولات' },
  'product.export': { group: 'کاتالوگ', nameFa: 'خروجی محصولات' },
  'taxonomy.manage': { group: 'کاتالوگ', nameFa: 'مدیریت دسته‌ها، برندها و برچسب‌ها' },
  'media.manage': { group: 'کاتالوگ', nameFa: 'مدیریت تصاویر و رسانه' },

  // Pricing
  'pricing.view': { group: 'قیمت‌گذاری', nameFa: 'مشاهده قیمت‌ها' },
  'pricing.update': { group: 'قیمت‌گذاری', nameFa: 'تغییر قیمت و سود' },
  'pricing.rate': { group: 'قیمت‌گذاری', nameFa: 'مدیریت نرخ ارز' },
  'pricing.approve': { group: 'قیمت‌گذاری', nameFa: 'تأیید تغییرات بزرگ قیمت' },
  'coupon.manage': { group: 'قیمت‌گذاری', nameFa: 'مدیریت کد تخفیف و کمپین' },

  // Inventory
  'inventory.view': { group: 'انبار', nameFa: 'مشاهده موجودی' },
  'inventory.import': { group: 'انبار', nameFa: 'ورود کدها' },
  'inventory.update': { group: 'انبار', nameFa: 'تغییر وضعیت کدها' },
  'inventory.reveal': { group: 'انبار', nameFa: 'مشاهده کد کامل (حساس)' },
  'supplier.manage': { group: 'انبار', nameFa: 'مدیریت تأمین‌کنندگان' },

  // Orders
  'order.view': { group: 'سفارش‌ها', nameFa: 'مشاهده سفارش‌ها' },
  'order.update': { group: 'سفارش‌ها', nameFa: 'تغییر وضعیت سفارش' },
  'order.fulfill': { group: 'سفارش‌ها', nameFa: 'تحویل دستی سفارش' },
  'order.refund': { group: 'سفارش‌ها', nameFa: 'بازپرداخت' },
  'order.review': { group: 'سفارش‌ها', nameFa: 'بررسی سفارش‌های پرریسک' },

  // Customers
  'customer.view': { group: 'مشتریان', nameFa: 'مشاهده مشتریان' },
  'customer.update': { group: 'مشتریان', nameFa: 'ویرایش مشتری' },
  'customer.wallet': { group: 'مشتریان', nameFa: 'مدیریت کیف پول و امتیاز' },

  // Content
  'content.manage': { group: 'محتوا', nameFa: 'مدیریت صفحات، بلاگ و بنر' },
  'review.moderate': { group: 'محتوا', nameFa: 'تأیید دیدگاه‌ها' },
  'seo.manage': { group: 'محتوا', nameFa: 'مدیریت سئو و ریدایرکت' },

  // Support
  'ticket.view': { group: 'پشتیبانی', nameFa: 'مشاهده تیکت‌ها' },
  'ticket.reply': { group: 'پشتیبانی', nameFa: 'پاسخ به تیکت' },
  'ticket.assign': { group: 'پشتیبانی', nameFa: 'ارجاع تیکت' },

  // System
  'setting.manage': { group: 'سیستم', nameFa: 'تنظیمات سیستم' },
  'staff.manage': { group: 'سیستم', nameFa: 'مدیریت کارکنان و نقش‌ها' },
  'audit.view': { group: 'سیستم', nameFa: 'مشاهده لاگ ممیزی' },
  'job.manage': { group: 'سیستم', nameFa: 'مدیریت صف کارها' },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

/** Built-in roles seeded into the database. */
export const SYSTEM_ROLES: Record<
  string,
  { nameFa: string; description: string; permissions: PermissionKey[] | '*' }
> = {
  'super-admin': {
    nameFa: 'مدیر ارشد',
    description: 'دسترسی کامل به تمام بخش‌ها',
    permissions: '*',
  },
  'catalog-manager': {
    nameFa: 'مدیر کاتالوگ',
    description: 'مدیریت محصولات، دسته‌ها، قیمت‌ها و موجودی',
    permissions: [
      'dashboard.view', 'report.view',
      'product.view', 'product.create', 'product.update', 'product.delete',
      'product.import', 'product.export', 'taxonomy.manage', 'media.manage',
      'pricing.view', 'pricing.update', 'coupon.manage',
      'inventory.view', 'inventory.import', 'inventory.update',
    ],
  },
  'order-manager': {
    nameFa: 'مدیر سفارش‌ها',
    description: 'رسیدگی به سفارش‌ها، تحویل و بازپرداخت',
    permissions: [
      'dashboard.view', 'report.view',
      'order.view', 'order.update', 'order.fulfill', 'order.refund', 'order.review',
      'inventory.view', 'inventory.reveal',
      'customer.view', 'ticket.view', 'ticket.reply',
    ],
  },
  support: {
    nameFa: 'کارشناس پشتیبانی',
    description: 'پاسخ به تیکت‌ها و مشاهده سفارش مشتری',
    permissions: [
      'dashboard.view', 'order.view', 'customer.view',
      'ticket.view', 'ticket.reply', 'review.moderate',
    ],
  },
  'content-editor': {
    nameFa: 'ویراستار محتوا',
    description: 'مدیریت بلاگ، صفحات، سئو و دیدگاه‌ها',
    permissions: ['dashboard.view', 'content.manage', 'review.moderate', 'seo.manage', 'product.view'],
  },
  accountant: {
    nameFa: 'حسابدار',
    description: 'گزارش مالی، پرداخت‌ها و کیف پول',
    permissions: [
      'dashboard.view', 'report.view', 'report.export',
      'order.view', 'order.refund', 'customer.view', 'customer.wallet', 'pricing.view',
    ],
  },
};

export function resolveRolePermissions(slug: string): PermissionKey[] {
  const role = SYSTEM_ROLES[slug];
  if (!role) return [];
  return role.permissions === '*' ? ALL_PERMISSIONS : role.permissions;
}
