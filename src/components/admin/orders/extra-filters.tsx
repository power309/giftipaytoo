'use client';

import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Extra list filters the generic `DataTable` doesn't natively support: a
 * date range and an amount range. Renders as a small popover-like panel
 * toggled from the toolbar, syncing straight to the URL query string like
 * every other DataTable filter does.
 */
export function OrderExtraFilters({ couponEnabled = true }: { couponEnabled?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(false);

  const [from, setFrom] = React.useState(params.get('from') ?? '');
  const [to, setTo] = React.useState(params.get('to') ?? '');
  const [minAmount, setMinAmount] = React.useState(params.get('minAmount') ?? '');
  const [maxAmount, setMaxAmount] = React.useState(params.get('maxAmount') ?? '');
  const [coupon, setCoupon] = React.useState(params.get('coupon') ?? '');

  const activeCount = [from, to, minAmount, maxAmount, coupon].filter(Boolean).length;

  function apply() {
    const next = new URLSearchParams(params.toString());
    const set = (k: string, v: string) => (v ? next.set(k, v) : next.delete(k));
    set('from', from);
    set('to', to);
    set('minAmount', minAmount);
    set('maxAmount', maxAmount);
    set('coupon', coupon);
    next.delete('page');
    router.push(`${pathname}?${next.toString()}`);
    setOpen(false);
  }

  function clear() {
    setFrom('');
    setTo('');
    setMinAmount('');
    setMaxAmount('');
    setCoupon('');
    const next = new URLSearchParams(params.toString());
    for (const k of ['from', 'to', 'minAmount', 'maxAmount', 'coupon']) next.delete(k);
    next.delete('page');
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="relative">
      <Button
        type="button"
        size="sm"
        variant={activeCount ? 'primary' : 'secondary'}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        بازه و مبلغ
        {activeCount > 0 && ` (${activeCount.toLocaleString('fa-IR')})`}
      </Button>
      {open && (
        <div
          className={cn(
            'absolute z-20 mt-2 w-[min(22rem,90vw)] rounded-xl border border-border-base bg-surface p-3 shadow-lg',
            'end-0 space-y-3',
          )}
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="of-from" className="mb-1 block text-xs text-fg-muted">
                از تاریخ
              </label>
              <Input id="of-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 text-xs" />
            </div>
            <div>
              <label htmlFor="of-to" className="mb-1 block text-xs text-fg-muted">
                تا تاریخ
              </label>
              <Input id="of-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 text-xs" />
            </div>
            <div>
              <label htmlFor="of-min" className="mb-1 block text-xs text-fg-muted">
                حداقل مبلغ (تومان)
              </label>
              <Input id="of-min" type="number" min={0} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className="h-9 text-xs" />
            </div>
            <div>
              <label htmlFor="of-max" className="mb-1 block text-xs text-fg-muted">
                حداکثر مبلغ (تومان)
              </label>
              <Input id="of-max" type="number" min={0} value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="h-9 text-xs" />
            </div>
            {couponEnabled && (
              <div className="col-span-2">
                <label htmlFor="of-coupon" className="mb-1 block text-xs text-fg-muted">
                  کد تخفیف
                </label>
                <Input id="of-coupon" value={coupon} onChange={(e) => setCoupon(e.target.value)} className="h-9 text-xs" placeholder="مثلاً SUMMER20" />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="xs" variant="ghost" onClick={clear}>
              پاک کردن
            </Button>
            <Button type="button" size="xs" onClick={apply}>
              اعمال فیلتر
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
