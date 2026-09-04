'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';
import { ADMIN_NAV, type AdminNavGroup } from './nav';

export type AdminUser = {
  displayName: string;
  roles: string[];
  permissions: string[];
};

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return C ? <C className={className} /> : <Icons.Circle className={className} />;
}

/**
 * Admin shell: permission-filtered sidebar, sticky topbar, mobile drawer.
 * Navigation is filtered client-side for display only — every page still
 * enforces its own permission on the server.
 */
export function AdminShell({
  user,
  alerts,
  children,
}: {
  user: AdminUser;
  alerts: { lowStock: number; manualReview: number; openTickets: number; pendingApprovals: number };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => setOpen(false), [pathname]);

  const groups: AdminNavGroup[] = React.useMemo(
    () =>
      ADMIN_NAV.map((g) => ({
        ...g,
        items: g.items.filter((i) => user.permissions.includes(i.permission)),
      })).filter((g) => g.items.length > 0),
    [user.permissions],
  );

  const badgeFor = (href: string) => {
    if (href === '/admin/inventory') return alerts.lowStock;
    if (href === '/admin/reviews-queue') return alerts.manualReview;
    if (href === '/admin/tickets') return alerts.openTickets;
    if (href === '/admin/approvals') return alerts.pendingApprovals;
    return 0;
  };

  const nav = (
    <nav className="space-y-6 p-3" aria-label="ناوبری مدیریت">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
            {g.label}
          </p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const badge = badgeFor(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors',
                      active
                        ? 'bg-primary text-primary-contrast font-medium'
                        : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                    )}
                  >
                    <Icon name={item.icon} className="size-[18px] shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge > 0 && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-bold tnum',
                          active ? 'bg-white/20 text-white' : 'bg-danger text-white',
                        )}
                      >
                        {badge > 99 ? '۹۹+' : badge.toLocaleString('fa-IR')}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-bg-sunken">
      <a href="#admin-main" className="skip-link">
        رفتن به محتوای اصلی
      </a>

      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 end-0 hidden w-64 flex-col border-s border-border-base bg-surface lg:flex">
        <Link href="/admin" className="flex items-center gap-2.5 border-b border-border-base px-4 py-4">
          <Image src="/favicon.svg" alt="" width={32} height={32} className="size-8 rounded-lg" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-fg">گیفتی‌پی</p>
            <p className="text-[11px] text-fg-faint">پنل مدیریت</p>
          </div>
        </Link>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="border-t border-border-base p-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
          >
            <Icons.ExternalLink className="size-[18px]" aria-hidden />
            مشاهده فروشگاه
          </Link>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/55 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="منوی مدیریت"
            className="absolute inset-y-0 end-0 flex w-72 flex-col bg-surface shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border-base px-4 py-4">
              <span className="text-sm font-bold text-fg">پنل مدیریت</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="بستن منو"
                className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted"
              >
                <Icons.X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="lg:me-64">
        <header className="sticky top-0 z-30 border-b border-border-base bg-[var(--header-bg)] backdrop-blur-lg">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="باز کردن منو"
              className="grid size-10 place-items-center rounded-xl text-fg transition-colors hover:bg-surface-muted lg:hidden"
            >
              <Icons.Menu className="size-5" aria-hidden />
            </button>

            <AdminBreadcrumb pathname={pathname} />

            <div className="ms-auto flex items-center gap-1">
              <ThemeToggle compact />
              <Link
                href="/admin/audit"
                className="hidden size-10 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg sm:grid"
                aria-label="لاگ ممیزی"
              >
                <Icons.ScrollText className="size-5" aria-hidden />
              </Link>
              <div className="flex items-center gap-2.5 rounded-xl border border-border-base bg-surface px-3 py-1.5">
                <span className="grid size-7 place-items-center rounded-lg bg-primary-soft text-xs font-bold text-primary">
                  {user.displayName.slice(0, 1)}
                </span>
                <div className="hidden text-start sm:block">
                  <p className="text-xs font-medium leading-4 text-fg">{user.displayName}</p>
                  <p className="text-[10px] leading-4 text-fg-faint">{user.roles.join('، ') || 'کارمند'}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main id="admin-main" className="p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

const CRUMB_LABELS: Record<string, string> = Object.fromEntries(
  ADMIN_NAV.flatMap((g) => g.items.map((i) => [i.href, i.label])),
);

function AdminBreadcrumb({ pathname }: { pathname: string }) {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: { href: string; label: string }[] = [];
  let acc = '';
  for (const seg of segments) {
    acc += `/${seg}`;
    crumbs.push({ href: acc, label: CRUMB_LABELS[acc] ?? decodeURIComponent(seg) });
  }
  return (
    <nav aria-label="مسیر صفحه" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-[13px]">
        {crumbs.map((c, i) => (
          <li key={c.href} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <Icons.ChevronLeft className="size-3.5 shrink-0 text-fg-faint" aria-hidden />}
            {i === crumbs.length - 1 ? (
              <span className="truncate font-medium text-fg">{c.label}</span>
            ) : (
              <Link href={c.href} className="truncate text-fg-muted hover:text-fg">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
