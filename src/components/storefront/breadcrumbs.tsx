import Link from 'next/link';
import { ChevronLeft, Home } from 'lucide-react';

export type Crumb = { label: string; href?: string };

/**
 * Breadcrumb trail. Server component; also emits BreadcrumbList JSON-LD is
 * left to the page (it knows the absolute URLs) — this only renders the UI.
 */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="مسیر صفحه" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
        <li className="flex items-center gap-1.5">
          <Link href="/" className="flex items-center gap-1 hover:text-primary" aria-label="صفحه اصلی">
            <Home className="size-3.5" aria-hidden />
          </Link>
          <ChevronLeft className="size-3.5 text-fg-faint" aria-hidden />
        </li>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5 min-w-0">
              {item.href && !isLast ? (
                <Link href={item.href} className="truncate hover:text-primary">
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? 'truncate font-medium text-fg' : 'truncate'} aria-current={isLast ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
              {!isLast && <ChevronLeft className="size-3.5 shrink-0 text-fg-faint" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
