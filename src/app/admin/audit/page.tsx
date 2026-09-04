import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader } from '@/components/admin/kit';
import { DataTable, type Column } from '@/components/admin/data-table';
import { formatJalali } from '@/lib/persian';
import { parseListQuery, type SearchParams } from '@/lib/admin-query';
import { buildAuditWhere } from './_lib';
import { AuditDateFilter } from './date-range-filter';

export const metadata = { title: 'لاگ ممیزی' };

async function loadLogs(sp: SearchParams) {
  const { page, perPage } = parseListQuery(sp, 50);
  const where = buildAuditWhere(sp);

  const [rows, total, actors, actions, entities] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { actor: { select: { firstName: true, lastName: true, email: true } } },
    }),
    db.auditLog.count({ where }),
    db.user.findMany({ where: { isStaff: true }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } }),
    db.auditLog.findMany({ select: { action: true }, distinct: ['action'], take: 200, orderBy: { action: 'asc' } }),
    db.auditLog.findMany({ select: { entity: true }, distinct: ['entity'], take: 100, orderBy: { entity: 'asc' } }),
  ]);

  return { rows, total, page, perPage, actors, actions: actions.map((a) => a.action), entities: entities.map((e) => e.entity) };
}

type LogRow = Awaited<ReturnType<typeof loadLogs>>['rows'][number];

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission('audit.view');
  const sp = await searchParams;
  const { rows, total, page, perPage, actors, actions, entities } = await loadLogs(sp);

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && v) qs.set(k, v);
  }

  const columns: Column<LogRow>[] = [
    { key: 'action', header: 'رویداد', render: (l) => <span className="font-mono text-xs" dir="ltr">{l.action}</span> },
    { key: 'entity', header: 'موجودیت', secondary: true, render: (l) => <span className="text-xs">{l.entity}{l.entityId ? ` #${l.entityId.slice(-6)}` : ''}</span> },
    {
      key: 'actor',
      header: 'عامل',
      render: (l) => (l.actor ? [l.actor.firstName, l.actor.lastName].filter(Boolean).join(' ') || l.actor.email : l.actorType === 'SYSTEM' ? 'سیستم' : l.actorType),
    },
    { key: 'summary', header: 'توضیح', secondary: true, render: (l) => <span className="line-clamp-1 max-w-sm text-xs text-fg-muted">{l.summary ?? '—'}</span> },
    { key: 'ip', header: 'IP', secondary: true, render: (l) => <span className="tnum text-xs text-fg-faint" dir="ltr">{l.ip ?? '—'}</span> },
    { key: 'createdAt', header: 'تاریخ', render: (l) => <span className="text-xs text-fg-muted">{formatJalali(l.createdAt, true)}</span> },
  ];

  return (
    <div>
      <PageHeader title="لاگ ممیزی" description="مشاهده کامل رویدادهای انجام‌شده در پنل مدیریت" />
      <DataTable
        rows={rows}
        columns={columns}
        total={total}
        page={page}
        perPage={perPage}
        searchPlaceholder="جست‌وجو در رویداد، موجودیت یا توضیح…"
        rowHref={(l) => `/admin/audit/${l.id}`}
        emptyTitle="رویدادی یافت نشد"
        exportHref={`/admin/audit/export?${qs.toString()}`}
        toolbar={<AuditDateFilter />}
        filters={[
          { key: 'actorId', label: 'عامل', options: actors.map((a) => ({ value: a.id, label: [a.firstName, a.lastName].filter(Boolean).join(' ') || 'کارمند' })) },
          { key: 'action', label: 'رویداد', options: actions.map((a) => ({ value: a, label: a })) },
          { key: 'entity', label: 'موجودیت', options: entities.map((e) => ({ value: e, label: e })) },
        ]}
      />
    </div>
  );
}
