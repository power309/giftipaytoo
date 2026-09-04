'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Field, Input, Select, Button } from '@/components/ui';
import { orderStatusInfo } from '@/components/account/status-labels';

export function OrdersFilterBar({
  statusOptions,
  initial,
}: {
  statusOptions: string[];
  initial: { status?: string; from?: string; to?: string; q?: string };
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState(initial.status ?? '');
  const [from, setFrom] = React.useState(initial.from ?? '');
  const [to, setTo] = React.useState(initial.to ?? '');
  const [q, setQ] = React.useState(initial.q ?? '');

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (q.trim()) params.set('q', q.trim());
    router.push(`/account/orders${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const clear = () => {
    setStatus('');
    setFrom('');
    setTo('');
    setQ('');
    router.push('/account/orders');
  };

  const hasFilters = !!(status || from || to || q);

  return (
    <form onSubmit={apply} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
      <Field label="جستجوی شماره سفارش" htmlFor="q" className="lg:col-span-1">
        <div className="relative">
          <Input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مثال: GP-240904-8F3K2"
            className="ps-9"
          />
          <Search className="absolute inset-y-0 start-3 my-auto size-4 text-fg-faint" aria-hidden />
        </div>
      </Field>

      <Field label="وضعیت" htmlFor="status">
        <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">همه وضعیت‌ها</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {orderStatusInfo(s).label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="از تاریخ" htmlFor="from">
        <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </Field>

      <Field label="تا تاریخ" htmlFor="to">
        <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </Field>

      <div className="flex items-end gap-2 lg:col-span-1">
        <Button type="submit" size="md" fullWidth>
          اعمال فیلتر
        </Button>
      </div>
      {hasFilters && (
        <div className="flex items-end gap-2">
          <Button type="button" variant="ghost" size="md" onClick={clear}>
            <X className="size-4" aria-hidden />
            پاک کردن
          </Button>
        </div>
      )}
    </form>
  );
}
