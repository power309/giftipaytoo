'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatTomanLatin } from '@/lib/money';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Button } from '@/components/ui';

/** Page header used by every admin screen. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-fg sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** KPI tile. `delta` is a percentage change vs. the previous period. */
export function StatCard({
  label,
  value,
  unit,
  delta,
  hint,
  tone = 'default',
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number | null;
  hint?: string;
  tone?: 'default' | 'success' | 'warn' | 'danger';
  icon?: React.ReactNode;
}) {
  const Trend = delta == null ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const trendClass =
    delta == null || delta === 0 ? 'text-fg-faint' : delta > 0 ? 'text-accent' : 'text-danger';

  return (
    <div
      className={cn(
        'rounded-xl border bg-surface p-4',
        tone === 'success' && 'border-accent/30',
        tone === 'warn' && 'border-warn/30',
        tone === 'danger' && 'border-danger/30',
        tone === 'default' && 'border-border-base',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-fg-muted">{label}</p>
        {icon && <span className="text-fg-faint">{icon}</span>}
      </div>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-xl font-bold text-fg tnum sm:text-2xl">
          {typeof value === 'number' ? value.toLocaleString('fa-IR') : value}
        </span>
        {unit && <span className="text-xs text-fg-muted">{unit}</span>}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {delta != null && (
          <span className={cn('flex items-center gap-1 text-xs tnum', trendClass)}>
            <Trend className="size-3.5" aria-hidden />
            {Math.abs(delta).toLocaleString('fa-IR')}٪
          </span>
        )}
        {hint && <span className="text-[11px] text-fg-faint">{hint}</span>}
      </div>
    </div>
  );
}

/** Money display for admin tables — Latin digits for scannability. */
export function Money({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('tnum whitespace-nowrap', className)} dir="ltr">
      {formatTomanLatin(value)}
    </span>
  );
}

/** A card section with an optional description and footer. */
export function Panel({
  title,
  description,
  actions,
  footer,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border-base bg-surface', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-base px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-bold text-fg">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
      {footer && <div className="border-t border-border-base px-4 py-3">{footer}</div>}
    </section>
  );
}

/** Tabbed form sections used by the product editor and settings. */
export function FormTabs({
  tabs,
  active,
  onChange,
  errorsByTab,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (k: string) => void;
  errorsByTab?: Record<string, number>;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto no-scrollbar border-b border-border-base">
      {tabs.map((t) => {
        const errs = errorsByTab?.[t.key] ?? 0;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={active === t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              active === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
            {errs > 0 && (
              <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white tnum">
                {errs.toLocaleString('fa-IR')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Sticky save bar for long forms, with autosave status. */
export function SaveBar({
  dirty,
  saving,
  autosaveAt,
  onSave,
  onDiscard,
  extra,
}: {
  dirty: boolean;
  saving: boolean;
  autosaveAt?: Date | null;
  onSave: () => void;
  onDiscard?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-border-base bg-[var(--header-bg)] px-4 py-3 backdrop-blur-lg sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-fg-muted" role="status" aria-live="polite">
          {saving
            ? 'در حال ذخیره…'
            : dirty
              ? 'تغییرات ذخیره‌نشده دارید'
              : autosaveAt
                ? `آخرین ذخیره خودکار: ${autosaveAt.toLocaleTimeString('fa-IR')}`
                : 'همه تغییرات ذخیره شده است'}
        </span>
        {extra}
        <div className="ms-auto flex gap-2">
          {onDiscard && dirty && (
            <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
              بازگردانی
            </Button>
          )}
          <Button type="button" size="sm" loading={saving} disabled={!dirty} onClick={onSave}>
            ذخیره
          </Button>
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  // Product
  DRAFT: { label: 'پیش‌نویس', cls: 'bg-surface-muted text-fg-muted' },
  ACTIVE: { label: 'فعال', cls: 'bg-accent-soft text-accent' },
  INACTIVE: { label: 'غیرفعال', cls: 'bg-surface-muted text-fg-muted' },
  SCHEDULED: { label: 'زمان‌بندی‌شده', cls: 'bg-primary-soft text-primary' },
  ARCHIVED: { label: 'بایگانی', cls: 'bg-surface-muted text-fg-faint' },
  // Orders
  PENDING: { label: 'در انتظار', cls: 'bg-warn-soft text-warn' },
  AWAITING_PAYMENT: { label: 'در انتظار پرداخت', cls: 'bg-warn-soft text-warn' },
  PROCESSING: { label: 'در حال پردازش', cls: 'bg-primary-soft text-primary' },
  PAID: { label: 'پرداخت‌شده', cls: 'bg-accent-soft text-accent' },
  UNDER_REVIEW: { label: 'بررسی دستی', cls: 'bg-warn-soft text-warn' },
  COMPLETED: { label: 'تکمیل‌شده', cls: 'bg-accent-soft text-accent' },
  PARTIALLY_FULFILLED: { label: 'تحویل جزئی', cls: 'bg-warn-soft text-warn' },
  CANCELED: { label: 'لغو شده', cls: 'bg-surface-muted text-fg-muted' },
  EXPIRED: { label: 'منقضی', cls: 'bg-surface-muted text-fg-muted' },
  REFUNDED: { label: 'بازپرداخت‌شده', cls: 'bg-danger-soft text-danger' },
  PARTIALLY_REFUNDED: { label: 'بازپرداخت جزئی', cls: 'bg-danger-soft text-danger' },
  FAILED: { label: 'ناموفق', cls: 'bg-danger-soft text-danger' },
  VERIFICATION_FAILED: { label: 'تأیید ناموفق', cls: 'bg-danger-soft text-danger' },
  // Fulfilment
  UNFULFILLED: { label: 'تحویل‌نشده', cls: 'bg-surface-muted text-fg-muted' },
  RESERVED: { label: 'رزرو شده', cls: 'bg-primary-soft text-primary' },
  FULFILLED: { label: 'تحویل‌شده', cls: 'bg-accent-soft text-accent' },
  MANUAL_REVIEW: { label: 'نیازمند بررسی', cls: 'bg-warn-soft text-warn' },
  // Inventory
  AVAILABLE: { label: 'موجود', cls: 'bg-accent-soft text-accent' },
  SOLD: { label: 'فروخته‌شده', cls: 'bg-surface-muted text-fg-muted' },
  INVALID: { label: 'نامعتبر', cls: 'bg-danger-soft text-danger' },
  QUARANTINED: { label: 'قرنطینه', cls: 'bg-warn-soft text-warn' },
  // Tickets / content
  OPEN: { label: 'باز', cls: 'bg-primary-soft text-primary' },
  PENDING_CUSTOMER: { label: 'در انتظار مشتری', cls: 'bg-warn-soft text-warn' },
  PENDING_STAFF: { label: 'در انتظار پشتیبان', cls: 'bg-warn-soft text-warn' },
  RESOLVED: { label: 'حل‌شده', cls: 'bg-accent-soft text-accent' },
  CLOSED: { label: 'بسته', cls: 'bg-surface-muted text-fg-muted' },
  PUBLISHED: { label: 'منتشرشده', cls: 'bg-accent-soft text-accent' },
  APPROVED: { label: 'تأییدشده', cls: 'bg-accent-soft text-accent' },
  REJECTED: { label: 'ردشده', cls: 'bg-danger-soft text-danger' },
  REQUESTED: { label: 'درخواست‌شده', cls: 'bg-warn-soft text-warn' },
  AUTO_APPLIED: { label: 'خودکار اعمال شد', cls: 'bg-accent-soft text-accent' },
  // Jobs
  QUEUED: { label: 'در صف', cls: 'bg-surface-muted text-fg-muted' },
  RUNNING: { label: 'در حال اجرا', cls: 'bg-primary-soft text-primary' },
  SUCCEEDED: { label: 'موفق', cls: 'bg-accent-soft text-accent' },
  DEAD: { label: 'ناموفق نهایی', cls: 'bg-danger-soft text-danger' },
  SENT: { label: 'ارسال‌شده', cls: 'bg-accent-soft text-accent' },
  SUPPRESSED: { label: 'ارسال‌نشده', cls: 'bg-warn-soft text-warn' },
};

/** Consistent Persian status pill across every admin screen. */
export function StatusPill({ status, className }: { status: string; className?: string }) {
  const s = STATUS_STYLES[status] ?? { label: status, cls: 'bg-surface-muted text-fg-muted' };
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium',
        s.cls,
        className,
      )}
    >
      {s.label}
    </span>
  );
}

export function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 text-[10px] font-medium text-warn">
      داده نمونه
    </span>
  );
}
