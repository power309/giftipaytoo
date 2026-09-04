import {
  LayoutDashboard, Package, KeyRound, Wallet, Receipt, Heart, Star,
  LifeBuoy, Bell, User, ShieldCheck, Lock, type LucideIcon,
} from 'lucide-react';

export type AccountNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown as a small badge (e.g. unread notification count). */
  badgeKey?: 'notifications' | 'tickets';
};

export const ACCOUNT_NAV: AccountNavItem[] = [
  { href: '/account', label: 'داشبورد', icon: LayoutDashboard },
  { href: '/account/orders', label: 'سفارش‌ها', icon: Package },
  { href: '/account/codes', label: 'کدهای دیجیتال', icon: KeyRound },
  { href: '/account/wallet', label: 'کیف پول', icon: Wallet },
  { href: '/account/invoices', label: 'فاکتورها', icon: Receipt },
  { href: '/account/wishlist', label: 'علاقه‌مندی‌ها', icon: Heart },
  { href: '/account/reviews', label: 'دیدگاه‌های من', icon: Star },
  { href: '/account/tickets', label: 'پشتیبانی', icon: LifeBuoy, badgeKey: 'tickets' },
  { href: '/account/notifications', label: 'اعلان‌ها', icon: Bell, badgeKey: 'notifications' },
  { href: '/account/profile', label: 'اطلاعات حساب', icon: User },
  { href: '/account/security', label: 'امنیت', icon: ShieldCheck },
  { href: '/account/privacy', label: 'حریم خصوصی', icon: Lock },
];

/** Primary items pinned to the mobile bottom tab bar; the rest sit behind "بیشتر". */
export const MOBILE_PRIMARY_HREFS = ['/account', '/account/orders', '/account/codes', '/account/wallet'];
