'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/admin/inventory', label: 'موجودی کدها' },
  { href: '/admin/inventory/batches', label: 'دسته‌های ورود' },
  { href: '/admin/inventory/low-stock', label: 'موجودی کم' },
  { href: '/admin/inventory/expiring', label: 'در حال انقضا' },
  { href: '/admin/inventory/reconcile', label: 'بازبینی موجودی' },
  { href: '/admin/inventory/valuation', label: 'ارزش‌گذاری انبار' },
];

export function InventoryNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="زیرمنوی انبار" className="flex flex-wrap gap-1 border-b border-border-base">
      {LINKS.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
              active ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
