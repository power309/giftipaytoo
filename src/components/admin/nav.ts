import type { PermissionKey } from '@/lib/permissions';

export type AdminNavItem = {
  href: string;
  label: string;
  permission: PermissionKey;
  icon: string; // lucide icon name
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

/**
 * The admin sidebar. Items are filtered by the signed-in staff member's
 * permissions, so a support agent never sees pricing or settings links.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'مرور کلی',
    items: [
      { href: '/admin', label: 'داشبورد', permission: 'dashboard.view', icon: 'LayoutDashboard' },
      { href: '/admin/reports', label: 'گزارش‌ها', permission: 'report.view', icon: 'ChartColumn' },
    ],
  },
  {
    label: 'کاتالوگ',
    items: [
      { href: '/admin/products', label: 'محصولات', permission: 'product.view', icon: 'Package' },
      { href: '/admin/categories', label: 'دسته‌بندی‌ها', permission: 'taxonomy.manage', icon: 'FolderTree' },
      { href: '/admin/brands', label: 'برندها', permission: 'taxonomy.manage', icon: 'Tag' },
      { href: '/admin/media', label: 'رسانه', permission: 'media.manage', icon: 'Image' },
      { href: '/admin/import', label: 'ورود و خروج داده', permission: 'product.import', icon: 'FileSpreadsheet' },
    ],
  },
  {
    label: 'قیمت و موجودی',
    items: [
      { href: '/admin/pricing', label: 'قیمت‌گذاری', permission: 'pricing.view', icon: 'Calculator' },
      { href: '/admin/rates', label: 'نرخ ارز', permission: 'pricing.rate', icon: 'ArrowLeftRight' },
      { href: '/admin/approvals', label: 'تأیید تغییر قیمت', permission: 'pricing.approve', icon: 'BadgeCheck' },
      { href: '/admin/inventory', label: 'انبار کدها', permission: 'inventory.view', icon: 'KeyRound' },
      { href: '/admin/suppliers', label: 'تأمین‌کنندگان', permission: 'supplier.manage', icon: 'Truck' },
    ],
  },
  {
    label: 'فروش',
    items: [
      { href: '/admin/orders', label: 'سفارش‌ها', permission: 'order.view', icon: 'ShoppingBag' },
      { href: '/admin/reviews-queue', label: 'بررسی دستی', permission: 'order.review', icon: 'ShieldAlert' },
      { href: '/admin/refunds', label: 'بازپرداخت‌ها', permission: 'order.refund', icon: 'Undo2' },
      { href: '/admin/coupons', label: 'کد تخفیف و کمپین', permission: 'coupon.manage', icon: 'Ticket' },
    ],
  },
  {
    label: 'مشتریان',
    items: [
      { href: '/admin/customers', label: 'مشتریان', permission: 'customer.view', icon: 'Users' },
      { href: '/admin/groups', label: 'گروه‌های مشتری', permission: 'customer.update', icon: 'UsersRound' },
      { href: '/admin/tickets', label: 'تیکت‌ها', permission: 'ticket.view', icon: 'LifeBuoy' },
      { href: '/admin/reviews', label: 'دیدگاه‌ها', permission: 'review.moderate', icon: 'MessageSquare' },
    ],
  },
  {
    label: 'محتوا',
    items: [
      { href: '/admin/pages', label: 'صفحات', permission: 'content.manage', icon: 'FileText' },
      { href: '/admin/blog', label: 'بلاگ', permission: 'content.manage', icon: 'Newspaper' },
      { href: '/admin/faqs', label: 'سؤالات متداول', permission: 'content.manage', icon: 'CircleHelp' },
      { href: '/admin/banners', label: 'بنرها', permission: 'content.manage', icon: 'GalleryHorizontalEnd' },
      { href: '/admin/menus', label: 'منوها', permission: 'content.manage', icon: 'Menu' },
      { href: '/admin/seo', label: 'سئو و ریدایرکت', permission: 'seo.manage', icon: 'Search' },
    ],
  },
  {
    label: 'سیستم',
    items: [
      { href: '/admin/settings', label: 'تنظیمات', permission: 'setting.manage', icon: 'Settings' },
      { href: '/admin/staff', label: 'کارکنان و نقش‌ها', permission: 'staff.manage', icon: 'ShieldCheck' },
      { href: '/admin/jobs', label: 'صف کارها', permission: 'job.manage', icon: 'ListChecks' },
      { href: '/admin/audit', label: 'لاگ ممیزی', permission: 'audit.view', icon: 'ScrollText' },
    ],
  },
];
