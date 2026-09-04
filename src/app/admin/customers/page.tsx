import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader, Money, StatusPill, DemoBadge } from '@/components/admin/kit';
import { Badge } from '@/components/ui';
import { DataTable, type Column } from '@/components/admin/data-table';
import { formatJalali, toPersianDigits } from '@/lib/persian';
import { parseListQuery, type SearchParams } from '@/lib/admin-query';
import { buildCustomersWhere, CUSTOMER_LIST_SELECT, customerName } from './_lib';

export const metadata = { title: 'مشتریان' };

async function loadCustomers(sp: SearchParams) {
  const { page, perPage, sort, dir } = parseListQuery(sp, 20);
  const where = buildCustomersWhere(sp);
  const sortable: Record<string, string> = { createdAt: 'createdAt', walletBalance: 'walletBalance' };
  const orderBy = { [sortable[sort ?? ''] ?? 'createdAt']: dir };

  const [rows, total, groups] = await Promise.all([
    db.user.findMany({ where, select: CUSTOMER_LIST_SELECT, orderBy, skip: (page - 1) * perPage, take: perPage }),
    db.user.count({ where }),
    db.customerGroup.findMany({ select: { id: true, nameFa: true }, orderBy: { priority: 'desc' } }),
  ]);

  const ids = rows.map((r) => r.id);
  const orderAgg = ids.length
    ? await db.order.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, paymentStatus: 'PAID' },
        _sum: { totalToman: true },
        _count: { _all: true },
      })
    : [];
  const statsByUser = new Map(orderAgg.map((a) => [a.userId, { spend: a._sum.totalToman ?? 0, count: a._count._all }]));

  return { rows, total, page, perPage, groups, statsByUser };
}

type CustomerRow = Awaited<ReturnType<typeof loadCustomers>>['rows'][number];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission('customer.view');
  const sp = await searchParams;
  const { rows, total, page, perPage, groups, statsByUser } = await loadCustomers(sp);

  const columns: Column<CustomerRow>[] = [
    {
      key: 'name',
      header: 'مشتری',
      render: (u) => (
        <span className="flex items-center gap-1.5">
          {customerName(u)}
          {u.isDemo && <DemoBadge />}
        </span>
      ),
    },
    { key: 'contact', header: 'تماس', secondary: true, render: (u) => <span className="text-xs text-fg-muted" dir="ltr">{u.email ?? u.phone ?? '—'}</span> },
    {
      key: 'group',
      header: 'گروه',
      render: (u) => (u.customerGroup ? <Badge tone="primary" size="sm">{u.customerGroup.nameFa}</Badge> : <span className="text-fg-faint">—</span>),
    },
    {
      key: 'orders',
      header: 'سفارش‌ها',
      align: 'center',
      render: (u) => toPersianDigits(statsByUser.get(u.id)?.count ?? 0),
    },
    {
      key: 'spend',
      header: 'مجموع خرید',
      align: 'end',
      render: (u) => <Money value={statsByUser.get(u.id)?.spend ?? 0} />,
    },
    { key: 'walletBalance', header: 'کیف پول', align: 'end', sortable: true, secondary: true, render: (u) => <Money value={u.walletBalance} /> },
    {
      key: 'verified',
      header: 'تأیید',
      secondary: true,
      render: (u) => (
        <span className="text-xs">
          {u.emailVerifiedAt ? '📧' : ''}
          {u.phoneVerifiedAt ? '📱' : ''}
          {!u.emailVerifiedAt && !u.phoneVerifiedAt && '—'}
        </span>
      ),
    },
    { key: 'status', header: 'وضعیت', render: (u) => <StatusPill status={u.status} /> },
    { key: 'createdAt', header: 'عضویت', secondary: true, sortable: true, render: (u) => <span className="text-xs text-fg-muted">{formatJalali(u.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="مشتریان" description="مدیریت حساب‌های مشتریان فروشگاه" />
      <DataTable
        rows={rows}
        columns={columns}
        total={total}
        page={page}
        perPage={perPage}
        searchPlaceholder="جست‌وجوی نام، ایمیل یا موبایل…"
        rowHref={(u) => `/admin/customers/${u.id}`}
        emptyTitle="مشتری‌ای یافت نشد"
        filters={[
          {
            key: 'status',
            label: 'وضعیت',
            options: [
              { value: 'ACTIVE', label: 'فعال' },
              { value: 'SUSPENDED', label: 'مسدود' },
              { value: 'PENDING_VERIFICATION', label: 'در انتظار تأیید' },
              { value: 'DELETED', label: 'حذف‌شده' },
            ],
          },
          { key: 'groupId', label: 'گروه', options: groups.map((g) => ({ value: g.id, label: g.nameFa })) },
          { key: 'verified', label: 'تأیید ایمیل', options: [{ value: '1', label: 'تأییدشده' }, { value: '0', label: 'تأییدنشده' }] },
          { key: 'demo', label: 'داده نمونه', options: [{ value: '1', label: 'بله' }] },
        ]}
      />
    </div>
  );
}
