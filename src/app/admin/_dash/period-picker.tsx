'use client';

import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button, Input } from '@/components/ui';

const PRESETS: { key: string; label: string }[] = [
  { key: 'today', label: 'امروز' },
  { key: '7d', label: '۷ روز اخیر' },
  { key: '30d', label: '۳۰ روز اخیر' },
  { key: 'month', label: 'این ماه' },
  { key: 'custom', label: 'بازه دلخواه' },
];

export function PeriodPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get('period') ?? 'today';
  const [from, setFrom] = React.useState(params.get('from') ?? '');
  const [to, setTo] = React.useState(params.get('to') ?? '');
  const [showCustom, setShowCustom] = React.useState(active === 'custom');

  function setPeriod(key: string, extra?: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    next.set('period', key);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) next.set(k, v);
    } else {
      next.delete('from');
      next.delete('to');
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-xl border border-border-base bg-surface p-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              if (p.key === 'custom') {
                setShowCustom(true);
              } else {
                setShowCustom(false);
                setPeriod(p.key);
              }
            }}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              active === p.key ? 'bg-primary text-primary-contrast' : 'text-fg-muted hover:bg-surface-muted',
            )}
            aria-pressed={active === p.key}
          >
            {p.label}
          </button>
        ))}
      </div>
      {showCustom && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) setPeriod('custom', { from, to });
          }}
        >
          <label htmlFor="dash-from" className="sr-only">
            از تاریخ
          </label>
          <Input id="dash-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40 text-xs" />
          <span className="text-xs text-fg-faint">تا</span>
          <label htmlFor="dash-to" className="sr-only">
            تا تاریخ
          </label>
          <Input id="dash-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40 text-xs" />
          <Button type="submit" size="sm" variant="secondary">
            اعمال
          </Button>
        </form>
      )}
    </div>
  );
}
