import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader, StatusPill, DemoBadge } from '@/components/admin/kit';
import { Badge } from '@/components/ui';
import { DataTable, type Column } from '@/components/admin/data-table';
import { timeAgoFa } from '@/lib/persian';
import { parseListQuery, type SearchParams } from '@/lib/admin-query';
import { buildTicketsWhere, isTicketStale, TICKET_PRIORITY_OPTIONS, TICKET_STATUS_OPTIONS } from './_lib';
import { customerName } from '../customers/_lib';
import { AlertTriangle } from 'lucide-react';

export const metadata = { title: 'تیکت‌ها' };

async function loadTickets(sp: SearchParams) {
  const { page, perPage, sort, dir } = parseListQuery(sp, 20);
  const where = buildTicketsWhere(sp);
  const sortable: Record<string, string> = { lastReplyAt: 'lastReplyAt', createdAt: 'createdAt' };
  const orderBy = { [sortable[sort ?? ''] ?? 'lastReplyAt']: dir };

  const [rows, total, departments, staff] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, number: true, subject: true, status: true, priority: true, lastReplyAt: true, createdAt: true, isDemo: true,
        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
        department: { select: { nameFa: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    }),
    db.ticket.count({ where }),
    db.ticketDepartment.findMany({ select: { id: true, nameFa: true }, orderBy: { sortOrder: 'asc' } }),
    db.user.findMany({ where: { isStaff: true, status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } }),
  ]);

  return { rows, total, page, perPage, departments, staff };
}

type TicketRow = Awaited<ReturnType<typeof loadTickets>>['rows'][number];

export default async function TicketsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission('ticket.view');
  const sp = await searchParams;
  const { rows, total, page, perPage, departments, staff } = await loadTickets(sp);

  const columns: Column<TicketRow>[] = [
    {
      key: 'number',
      header: 'شماره',
      render: (t) => (
        <span className="flex items-center gap-1.5 tnum" dir="ltr">
          {t.number}
          {isTicketStale(t.priority, t.lastReplyAt, t.status) && <AlertTriangle className="size-3.5 text-danger" aria-label="خارج از مهلت SLA" />}
          {t.isDemo && <DemoBadge />}
        </span>
      ),
    },
    { key: 'subject', header: 'موضوع', render: (t) => <span className="line-clamp-1">{t.subject}</span> },
    { key: 'customer', header: 'مشتری', secondary: true, render: (t) => customerName(t.user) },
    { key: 'department', header: 'دپارتمان', secondary: true, render: (t) => t.department?.nameFa ?? '—' },
    {
      key: 'assignedTo',
      header: 'ارجاع به',
      secondary: true,
      render: (t) => (t.assignedTo ? [t.assignedTo.firstName, t.assignedTo.lastName].filter(Boolean).join(' ') : <span className="text-fg-faint">تخصیص‌نیافته</span>),
    },
    {
      key: 'priority',
      header: 'اولویت',
      render: (t) => (
        <Badge tone={t.priority === 'URGENT' ? 'danger' : t.priority === 'HIGH' ? 'warn' : 'neutral'} size="sm">
          {TICKET_PRIORITY_OPTIONS.find((o) => o.value === t.priority)?.label ?? t.priority}
        </Badge>
      ),
    },
    { key: 'status', header: 'وضعیت', render: (t) => <StatusPill status={t.status} /> },
    { key: 'age', header: 'آخرین پاسخ', sortable: true, secondary: true, render: (t) => <span className="text-xs text-fg-muted">{timeAgoFa(t.lastReplyAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="تیکت‌های پشتیبانی" description="مدیریت و پاسخ‌گویی به درخواست‌های پشتیبانی مشتریان" />
      <DataTable
        rows={rows}
        columns={columns}
        total={total}
        page={page}
        perPage={perPage}
        searchPlaceholder="جست‌وجوی شماره تیکت، موضوع یا مشتری…"
        rowHref={(t) => `/admin/tickets/${t.id}`}
        emptyTitle="تیکتی یافت نشد"
        filters={[
          { key: 'status', label: 'وضعیت', options: TICKET_STATUS_OPTIONS },
          { key: 'priority', label: 'اولویت', options: TICKET_PRIORITY_OPTIONS },
          { key: 'departmentId', label: 'دپارتمان', options: departments.map((d) => ({ value: d.id, label: d.nameFa })) },
          {
            key: 'assignedToId',
            label: 'ارجاع به',
            options: [{ value: 'unassigned', label: 'تخصیص‌نیافته' }, ...staff.map((s) => ({ value: s.id, label: [s.firstName, s.lastName].filter(Boolean).join(' ') }))],
          },
        ]}
      />
    </div>
  );
}
