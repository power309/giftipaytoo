'use client';

import * as React from 'react';
import { Clock, Wallet } from 'lucide-react';
import { formatToman } from '@/lib/money';
import { toPersianDigits } from '@/lib/persian';
import { Alert, Switch } from '@/components/ui';
import type { CartTotalsDTO, CouponStateDTO } from '@/app/(shop)/_lib/types';

function MoneyRow({
  label,
  value,
  tone,
  strong,
}: {
  label: React.ReactNode;
  value: number;
  tone?: 'danger' | 'accent';
  strong?: boolean;
}) {
  if (value === 0 && !strong) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className={strong ? 'font-bold text-fg' : 'text-fg-muted'}>{label}</span>
      <span
        className={
          strong
            ? 'text-base font-extrabold tnum text-fg'
            : `tnum font-medium ${tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent' : 'text-fg'}`
        }
      >
        {tone === 'danger' ? '−' : ''}
        {formatToman(Math.abs(value))}
      </span>
    </div>
  );
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const t = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tehran' }).format(d);
  return toPersianDigits(t);
}

export function QuoteExpiryNote({ quoteExpiresAt, isStale }: { quoteExpiresAt: string | null; isStale: boolean }) {
  if (!quoteExpiresAt) return null;
  if (isStale) {
    return (
      <Alert tone="danger" title="قیمت‌های سبد خرید شما منقضی شده است">
        برای مشاهده و پرداخت با قیمت به‌روز، صفحه را تازه‌سازی کنید.
      </Alert>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-xs text-fg-muted">
      <Clock className="size-3.5 shrink-0" aria-hidden />
      قیمت‌ها تا ساعت {formatClock(quoteExpiresAt)} معتبر است.
    </p>
  );
}

export function OrderSummary({
  totals,
  coupon,
  quoteExpiresAt,
  isStale,
  walletEligible,
  onToggleWallet,
  blockingIssues,
  footer,
  title = 'خلاصه سفارش',
}: {
  totals: CartTotalsDTO;
  coupon: CouponStateDTO;
  quoteExpiresAt: string | null;
  isStale: boolean;
  walletEligible?: boolean;
  onToggleWallet?: (value: boolean) => void;
  blockingIssues?: string[];
  footer?: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="card p-5 space-y-4" aria-labelledby="order-summary-heading">
      <h2 id="order-summary-heading" className="text-base font-bold text-fg">
        {title}
      </h2>

      <div aria-live="polite" aria-atomic="true" className="space-y-2.5">
        <MoneyRow label="جمع سبد خرید" value={totals.subtotalToman} />
        {coupon.applied && (
          <MoneyRow label={`تخفیف کد «${coupon.code}»`} value={totals.discountToman} tone="danger" />
        )}
        <MoneyRow label="مالیات بر ارزش افزوده" value={totals.taxToman} />
        <MoneyRow label="کارمزد" value={totals.feeToman} />
        {totals.walletApplied && totals.walletAppliedToman > 0 && (
          <MoneyRow label="اعمال از کیف پول" value={totals.walletAppliedToman} tone="danger" />
        )}
        <div className="border-t border-dashed border-border-base pt-2.5">
          <MoneyRow label="مبلغ قابل پرداخت" value={totals.payableToman} strong />
        </div>
      </div>

      {typeof walletEligible === 'boolean' && onToggleWallet && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted p-3">
          <div className="flex items-center gap-2 text-sm text-fg">
            <Wallet className="size-4 text-primary" aria-hidden />
            <span>
              موجودی کیف پول: <strong className="tnum">{formatToman(totals.walletBalanceToman)}</strong>
            </span>
          </div>
          <Switch
            checked={totals.walletApplied}
            onChange={onToggleWallet}
            disabled={!walletEligible || totals.walletBalanceToman <= 0}
            label="استفاده از کیف پول"
          />
        </div>
      )}

      <QuoteExpiryNote quoteExpiresAt={quoteExpiresAt} isStale={isStale} />

      {blockingIssues && blockingIssues.length > 0 && (
        <div className="space-y-2">
          {blockingIssues.map((issue) => (
            <Alert key={issue} tone="warn">
              {issue}
            </Alert>
          ))}
        </div>
      )}

      {footer}
    </div>
  );
}
