import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader, Money, StatusPill } from '@/components/admin/kit';
import { DataTable, type Column } from '@/components/admin/data-table';
import { RefundRowActions } from '@/components/admin/orders/refund-row-actions';
import { formatJalali } from '@/lib/persian';
import { parseListQuery, type SearchParams } from '@/lib/admin-query';
import Link from 'next/link';

export const metadata = { title: 'بازپرداخت‌ها' };

const METHOD_LABELS: Record<string, string> = { WALLET: 'کیف پول', GATEWAY: 'درگاه پرداخت', MANUAL: 'دستی' };

async function loadRefunds(sp: SearchParams) {
  const { page, perPage, q } = parseListQuery(sp, 20);
  const status = typeof sp.status === 'string' ? sp.status : undefined;
  const method = typeof sp.method === 'string' ? sp.method : undefined;

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(method ? { method } : {}),
    ...(q ? { order: { orderNumber: { contains: q, mode: 'insensitive' as const } } } : {}),
  };

  const [rows, total] = await Promise.all([
    db.refund.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        order: { select: { orderNumber: true } },
        requestedBy: { select: { firstName: true, lastName: true } },
      },
    }),
    db.refund.count({ where }),
  ]);
  return { rows, total, page, perPage };
}

type RefundRow = Awaited<ReturnType<typeof loadRefunds>>['rows'][number];

export default async function RefundsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission('order.refund');
  const sp = await searchParams;
  const { rows, total, page, perPage } = await loadRefunds(sp);

  const columns: Column<RefundRow>[] = [
    {
      key: 'order',
      header: 'سفارش',
      render: (r) => (
        <Link href={`/admin/orders/${r.orderId}`} className="tnum hover:text-primary" dir="ltr">
          {r.order.orderNumber}
        </Link>
      ),
    },
    { key: 'amount', header: 'مبلغ', align: 'end', render: (r) => <Money value={r.amountToman} /> },
    { key: 'method', header: 'روش', render: (r) => METHOD_LABELS[r.method] ?? r.method },
    { key: 'reason', header: 'دلیل', secondary: true, render: (r) => <span className="line-clamp-1 max-w-xs">{r.reason}</span> },
    {
      key: 'requestedBy',
      header: 'درخواست‌دهنده',
      secondary: true,
      render: (r) => (r.requestedBy ? [r.requestedBy.firstName, r.requestedBy.lastName].filter(Boolean).join(' ') : '—'),
    },
    { key: 'createdAt', header: 'تاریخ', secondary: true, render: (r) => <span className="text-xs text-fg-muted">{formatJalali(r.createdAt)}</span> },
    { key: 'status', header: 'وضعیت', render: (r) => <StatusPill status={r.status} /> },
    { key: 'actions', header: '', align: 'end', render: (r) => <RefundRowActions refundId={r.id} status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader title="بازپرداخت‌ها" description="بررسی، تأیید و پردازش درخواست‌های بازپرداخت" />
      <DataTable
        rows={rows}
        columns={columns}
        total={total}
        page={page}
        perPage={perPage}
        searchPlaceholder="جست‌وجوی شماره سفارش…"
        emptyTitle="درخواست بازپرداختی یافت نشد"
        filters={[
          {
            key: 'status',
            label: 'وضعیت',
            options: [
              { value: 'REQUESTED', label: 'درخواست‌شده' },
              { value: 'APPROVED', label: 'تأییدشده' },
              { value: 'REJECTED', label: 'ردشده' },
              { value: 'PROCESSED', label: 'پردازش‌شده' },
              { value: 'FAILED', label: 'ناموفق' },
            ],
          },
          {
            key: 'method',
            label: 'روش',
            options: [
              { value: 'WALLET', label: 'کیف پول' },
              { value: 'GATEWAY', label: 'درگاه پرداخت' },
              { value: 'MANUAL', label: 'دستی' },
            ],
          },
        ]}
      />
    </div>
  );
}
