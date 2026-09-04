import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader, Money, StatusPill, DemoBadge } from '@/components/admin/kit';
import { DataTable, type Column } from '@/components/admin/data-table';
import { OrderExtraFilters } from '@/components/admin/orders/extra-filters';
import { formatJalali, toPersianDigits } from '@/lib/persian';
import { parseListQuery, type SearchParams } from '@/lib/admin-query';
import {
  ORDER_STATUS_OPTIONS, PAYMENT_STATUS_OPTIONS, FULFILLMENT_STATUS_OPTIONS,
  orderCustomerLabel, buildOrdersWhere, ORDER_LIST_SELECT,
} from './_lib';

export const metadata = { title: 'سفارش‌ها' };

type OrderRow = Awaited<ReturnType<typeof loadOrders>>['rows'][number];

const SORTABLE: Record<string, string> = {
  placedAt: 'placedAt',
  totalToman: 'totalToman',
  orderNumber: 'orderNumber',
};

async function loadOrders(sp: SearchParams) {
  const { page, perPage, sort, dir } = parseListQuery(sp, 20);
  const where = buildOrdersWhere(sp);
  const orderBy = { [SORTABLE[sort ?? ''] ?? 'placedAt']: dir };

  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      select: ORDER_LIST_SELECT,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.order.count({ where }),
  ]);

  return { rows, total, page, perPage };
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission('order.view');
  const sp = await searchParams;
  const { rows, total, page, perPage } = await loadOrders(sp);

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && v) qs.set(k, v);
  }

  const columns: Column<OrderRow>[] = [
    {
      key: 'orderNumber',
      header: 'شماره سفارش',
      sortable: true,
      render: (o) => (
        <span className="flex items-center gap-1.5 tnum" dir="ltr">
          {o.orderNumber}
          {o.needsReview && <AlertTriangle className="size-3.5 text-warn" aria-label="نیازمند بررسی" />}
          {o.isDemo && <DemoBadge />}
        </span>
      ),
    },
    { key: 'customer', header: 'مشتری', render: (o) => <span className="truncate">{orderCustomerLabel(o)}</span> },
    {
      key: 'placedAt',
      header: 'تاریخ',
      sortable: true,
      secondary: true,
      render: (o) => <span className="text-xs text-fg-muted">{formatJalali(o.placedAt)}</span>,
    },
    { key: 'items', header: 'اقلام', align: 'center', secondary: true, render: (o) => toPersianDigits(o._count.items) },
    { key: 'totalToman', header: 'مبلغ', sortable: true, align: 'end', render: (o) => <Money value={o.totalToman} /> },
    { key: 'paymentStatus', header: 'پرداخت', render: (o) => <StatusPill status={o.paymentStatus} /> },
    { key: 'fulfillmentStatus', header: 'تحویل', secondary: true, render: (o) => <StatusPill status={o.fulfillmentStatus} /> },
    { key: 'status', header: 'وضعیت', render: (o) => <StatusPill status={o.status} /> },
  ];

  return (
    <div>
      <PageHeader title="سفارش‌ها" description="مدیریت، پیگیری و تحویل سفارش‌های فروشگاه" />
      <DataTable
        rows={rows}
        columns={columns}
        total={total}
        page={page}
        perPage={perPage}
        searchPlaceholder="جست‌وجوی شماره سفارش، ایمیل یا موبایل مشتری…"
        rowHref={(o) => `/admin/orders/${o.id}`}
        exportHref={`/api/admin/orders/export?${qs.toString()}`}
        emptyTitle="سفارشی یافت نشد"
        emptyDescription="با تغییر فیلترها یا عبارت جست‌وجو دوباره تلاش کنید."
        filters={[
          { key: 'status', label: 'وضعیت سفارش', options: ORDER_STATUS_OPTIONS },
          { key: 'paymentStatus', label: 'وضعیت پرداخت', options: PAYMENT_STATUS_OPTIONS },
          { key: 'fulfillmentStatus', label: 'وضعیت تحویل', options: FULFILLMENT_STATUS_OPTIONS },
          { key: 'needsReview', label: 'نیازمند بررسی', options: [{ value: '1', label: 'بله' }] },
          { key: 'demo', label: 'داده نمونه', options: [{ value: '1', label: 'بله' }] },
          {
            key: 'gateway',
            label: 'درگاه پرداخت',
            options: [
              { value: 'zarinpal', label: 'زرین‌پال' },
              { value: 'wallet', label: 'کیف پول' },
              { value: 'manual', label: 'واریز دستی' },
            ],
          },
        ]}
        toolbar={
          <>
            <OrderExtraFilters />
            <a
              href={`/api/admin/orders/export?${qs.toString()}${qs.toString() ? '&' : ''}format=xlsx`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-base bg-surface-muted px-3 text-xs font-medium text-fg hover:bg-border-base"
            >
              خروجی اکسل
            </a>
            <Link
              href="/admin/reviews-queue"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-warn/30 bg-warn-soft px-3 text-xs font-medium text-warn hover:brightness-95"
            >
              <AlertTriangle className="size-3.5" aria-hidden />
              صف بررسی ریسک
            </Link>
          </>
        }
      />
    </div>
  );
}
