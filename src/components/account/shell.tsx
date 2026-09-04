'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, LogOut, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatToman } from '@/lib/money';
import { toPersianDigits } from '@/lib/persian';
import { ThemeToggle } from '@/components/theme-toggle';
import { Modal } from '@/components/ui';
import { ACCOUNT_NAV, MOBILE_PRIMARY_HREFS } from './nav-items';

export type AccountShellUser = {
  displayName: string;
  email: string | null;
  walletBalance: number;
  loyaltyPoints: number;
  unreadNotifications: number;
  openTickets: number;
};

function isActive(pathname: string, href: string) {
  if (href === '/account') return pathname === '/account';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function badgeCount(item: { badgeKey?: 'notifications' | 'tickets' }, user: AccountShellUser): number {
  if (item.badgeKey === 'notifications') return user.unreadNotifications;
  if (item.badgeKey === 'tickets') return user.openTickets;
  return 0;
}

export function AccountShell({
  user,
  logoutAction,
  children,
}: {
  user: AccountShellUser;
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);

  const primaryItems = ACCOUNT_NAV.filter((i) => MOBILE_PRIMARY_HREFS.includes(i.href));
  const restItems = ACCOUNT_NAV.filter((i) => !MOBILE_PRIMARY_HREFS.includes(i.href));

  return (
    <div className="min-h-dvh bg-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border-base bg-[var(--header-bg)] backdrop-blur-lg">
        <div className="container-page flex h-16 items-center gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Image src="/favicon.svg" alt="" width={32} height={32} className="size-8 rounded-lg" />
            <span className="hidden text-sm font-bold text-fg sm:block">گیفتی‌پی</span>
          </Link>

          <div className="mx-1 hidden h-6 w-px bg-border-base sm:block" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{user.displayName}</p>
            {user.email && <p className="truncate text-xs text-fg-muted">{user.email}</p>}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent tnum">
                {formatToman(user.walletBalance)}
              </span>
              <span className="rounded-full bg-gold-soft px-3 py-1.5 text-xs font-semibold text-gold tnum">
                {toPersianDigits(user.loyaltyPoints)} امتیاز
              </span>
            </div>
            <ThemeToggle compact />
            <form action={logoutAction}>
              <button
                type="submit"
                className="grid size-10 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
                aria-label="خروج از حساب"
              >
                <LogOut className="size-5" aria-hidden />
              </button>
            </form>
          </div>
        </div>
        {/* Wallet/points strip on mobile */}
        <div className="container-page flex gap-2 pb-3 sm:hidden">
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent tnum">
            {formatToman(user.walletBalance)}
          </span>
          <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-gold tnum">
            {toPersianDigits(user.loyaltyPoints)} امتیاز
          </span>
        </div>
      </header>

      <div className="container-page grid grid-cols-1 gap-6 py-6 lg:grid-cols-[15rem_1fr] lg:items-start">
        {/* Desktop sidebar */}
        <nav aria-label="ناوبری حساب کاربری" className="hidden lg:sticky lg:top-[5.5rem] lg:block">
          <ul className="space-y-1">
            {ACCOUNT_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              const count = badgeCount(item, user);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors',
                      active ? 'bg-primary text-primary-contrast' : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                    )}
                  >
                    <item.icon className="size-4.5 shrink-0" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 text-[11px] font-bold tnum',
                          active ? 'bg-white/20' : 'bg-danger text-white',
                        )}
                      >
                        {toPersianDigits(count > 99 ? '99+' : count)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Main content */}
        <main className="min-w-0 pb-24 lg:pb-6">{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="ناوبری حساب کاربری"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border-base bg-[var(--header-bg)] backdrop-blur-lg lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {primaryItems.map((item) => {
            const active = isActive(pathname, item.href);
            const count = badgeCount(item, user);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                    active ? 'text-primary' : 'text-fg-muted',
                  )}
                >
                  <item.icon className="size-5" aria-hidden />
                  {item.label}
                  {count > 0 && (
                    <span className="absolute end-[calc(50%-1.4rem)] top-1.5 grid min-w-[16px] place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white tnum">
                      {toPersianDigits(count > 9 ? '9+' : count)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-fg-muted"
            >
              <Menu className="size-5" aria-hidden />
              بیشتر
            </button>
          </li>
        </ul>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="منوی حساب کاربری" size="sm">
        <ul className="space-y-1">
          {restItems.map((item) => {
            const active = isActive(pathname, item.href);
            const count = badgeCount(item, user);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors',
                    active ? 'bg-primary-soft text-primary' : 'text-fg hover:bg-surface-muted',
                  )}
                >
                  <item.icon className="size-4.5 shrink-0" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white tnum">
                      {toPersianDigits(count)}
                    </span>
                  )}
                  <ChevronLeft className="size-4 text-fg-faint" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}
