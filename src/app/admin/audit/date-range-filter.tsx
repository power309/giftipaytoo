'use client';

import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Input } from '@/components/ui';

export function AuditDateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [from, setFrom] = React.useState(params.get('from') ?? '');
  const [to, setTo] = React.useState(params.get('to') ?? '');

  function apply(next: { from?: string; to?: string }) {
    const q = new URLSearchParams(params.toString());
    const set = (k: string, v: string | undefined) => (v ? q.set(k, v) : q.delete(k));
    set('from', next.from ?? from);
    set('to', next.to ?? to);
    q.delete('page');
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="date"
        value={from}
        onChange={(e) => {
          setFrom(e.target.value);
          apply({ from: e.target.value });
        }}
        className="h-9 w-36 text-xs"
        aria-label="از تاریخ"
      />
      <span className="text-xs text-fg-faint">تا</span>
      <Input
        type="date"
        value={to}
        onChange={(e) => {
          setTo(e.target.value);
          apply({ to: e.target.value });
        }}
        className="h-9 w-36 text-xs"
        aria-label="تا تاریخ"
      />
    </div>
  );
}
