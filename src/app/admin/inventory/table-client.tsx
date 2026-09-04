'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Ban, ShieldAlert } from 'lucide-react';
import { DataTable, type Column } from '@/components/admin/data-table';
import { StatusPill, Money, DemoBadge } from '@/components/admin/kit';
import { Button } from '@/components/ui';
import { formatJalali } from '@/lib/persian';
import { RevealModal } from '@/components/admin/inventory/reveal-modal';
import { ReasonModal } from '@/components/admin/inventory/reason-modal';
import { invalidateInventoryItem, quarantineInventoryItem } from './actions';

export type InventoryRow = {
  id: string;
  variantId: string;
  variantName: string;
  productName: string;
  sku: string;
  codeMask: string;
  status: string;
  costToman: number;
  supplierName: string | null;
  batchFileName: string | null;
  expiresAt: string | null;
  isDemo: boolean;
  createdAt: string;
};

export function InventoryTableClient({
  rows,
  total,
  page,
  perPage,
  filters,
}: {
  rows: InventoryRow[];
  total: number;
  page: number;
  perPage: number;
  filters: {
    variants: { value: string; label: string }[];
    products: { value: string; label: string }[];
    suppliers: { value: string; label: string }[];
    batches: { value: string; label: string }[];
  };
}) {
  const router = useRouter();
  const [revealTarget, setRevealTarget] = React.useState<InventoryRow | null>(null);
  const [reasonTarget, setReasonTarget] = React.useState<{ row: InventoryRow; kind: 'invalidate' | 'quarantine' } | null>(null);

  const columns: Column<InventoryRow>[] = [
    {
      key: 'product',
      header: 'محصول / تنوع',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{r.productName}</p>
          <p className="truncate text-xs text-fg-faint">{r.variantName}</p>
        </div>
      ),
    },
    { key: 'code', header: 'کد (پوشیده)', render: (r) => <span dir="ltr" className="font-mono text-xs">{r.codeMask}</span> },
    { key: 'status', header: 'وضعیت', render: (r) => <StatusPill status={r.status} /> },
    { key: 'cost', header: 'قیمت تمام‌شده', align: 'end', secondary: true, render: (r) => <Money value={r.costToman} /> },
    { key: 'supplier', header: 'تأمین‌کننده', secondary: true, render: (r) => r.supplierName ?? '—' },
    { key: 'batch', header: 'دسته ورود', secondary: true, render: (r) => r.batchFileName ?? '—' },
    {
      key: 'expires',
      header: 'انقضا',
      secondary: true,
      render: (r) => (r.expiresAt ? <span className="tnum">{formatJalali(r.expiresAt)}</span> : '—'),
    },
    { key: 'created', header: 'تاریخ ثبت', secondary: true, render: (r) => <span className="tnum">{formatJalali(r.createdAt)}</span> },
    { key: 'demo', header: '', render: (r) => (r.isDemo ? <DemoBadge /> : null) },
    {
      key: 'actions',
      header: 'عملیات',
      align: 'end',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button type="button" size="xs" variant="secondary" onClick={() => setRevealTarget(r)}>
            <KeyRound className="size-3.5" aria-hidden /> نمایش کد
          </Button>
          {r.status !== 'INVALID' && (
            <Button type="button" size="xs" variant="ghost" title="باطل کردن" onClick={() => setReasonTarget({ row: r, kind: 'invalidate' })}>
              <Ban className="size-3.5" aria-hidden />
            </Button>
          )}
          {r.status !== 'QUARANTINED' && (
            <Button type="button" size="xs" variant="ghost" title="قرنطینه" onClick={() => setReasonTarget({ row: r, kind: 'quarantine' })}>
              <ShieldAlert className="size-3.5" aria-hidden />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        total={total}
        page={page}
        perPage={perPage}
        searchPlaceholder="جست‌وجو بر اساس محصول، SKU یا انتهای کد…"
        emptyTitle="کدی یافت نشد"
        emptyDescription="فیلترها را تغییر دهید یا از دکمه «افزودن کد» استفاده کنید."
        filters={[
          { key: 'variant', label: 'تنوع', options: filters.variants },
          { key: 'product', label: 'محصول', options: filters.products },
          {
            key: 'status',
            label: 'وضعیت',
            options: [
              { value: 'AVAILABLE', label: 'موجود' },
              { value: 'RESERVED', label: 'رزرو' },
              { value: 'SOLD', label: 'فروخته‌شده' },
              { value: 'INVALID', label: 'نامعتبر' },
              { value: 'QUARANTINED', label: 'قرنطینه' },
              { value: 'REFUNDED', label: 'بازپرداخت‌شده' },
            ],
          },
          { key: 'supplier', label: 'تأمین‌کننده', options: filters.suppliers },
          { key: 'batch', label: 'دسته ورود', options: filters.batches },
          { key: 'demo', label: 'نمونه', options: [{ value: '1', label: 'داده نمونه' }, { value: '0', label: 'واقعی' }] },
        ]}
      />

      <RevealModal
        open={!!revealTarget}
        itemId={revealTarget?.id ?? null}
        title={revealTarget ? `${revealTarget.productName} — ${revealTarget.variantName}` : ''}
        onClose={() => setRevealTarget(null)}
      />

      <ReasonModal
        open={!!reasonTarget}
        title={reasonTarget?.kind === 'invalidate' ? 'باطل کردن کد' : 'قرنطینه کد'}
        confirmLabel={reasonTarget?.kind === 'invalidate' ? 'باطل کردن' : 'قرنطینه کردن'}
        tone="danger"
        onClose={() => setReasonTarget(null)}
        onConfirm={async (reason) => {
          if (!reasonTarget) return { ok: false, error: 'موردی انتخاب نشده.' };
          const fn = reasonTarget.kind === 'invalidate' ? invalidateInventoryItem : quarantineInventoryItem;
          const res = await fn({ itemId: reasonTarget.row.id, reason });
          if (res.ok) router.refresh();
          return res;
        }}
      />
    </>
  );
}
