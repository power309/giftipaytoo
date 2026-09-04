import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader, StatCard, StatusPill } from '@/components/admin/kit';
import { DataTable, type Column } from '@/components/admin/data-table';
import { timeAgoFa, toPersianDigits } from '@/lib/persian';
import { parseListQuery, type SearchParams } from '@/lib/admin-query';
import { JobRowActions } from './row-actions';
import { ScheduledTasksPanel } from './scheduled-tasks-panel';
import { ListChecks, Loader2, CheckCircle2, XCircle, Skull } from 'lucide-react';

export const metadata = { title: 'صف کارها' };

async function loadStats() {
  try {
    const { queueStats } = await import('@/server/jobs/queue');
    return await queueStats();
  } catch {
    const grouped = await db.jobQueue.groupBy({ by: ['status'], _count: { _all: true } });
    const counts = { QUEUED: 0, RUNNING: 0, SUCCEEDED: 0, FAILED: 0, DEAD: 0 } as Record<string, number>;
    for (const g of grouped) counts[g.status] = g._count._all;
    return { queued: counts.QUEUED, running: counts.RUNNING, succeeded: counts.SUCCEEDED, failed: counts.FAILED, dead: counts.DEAD, oldestQueuedAt: null };
  }
}

async function loadJobs(sp: SearchParams) {
  const { page, perPage, q } = parseListQuery(sp, 20);
  const status = typeof sp.status === 'string' ? sp.status : undefined;
  const type = typeof sp.type === 'string' ? sp.type : undefined;
  const where = {
    ...(status ? { status: status as never } : {}),
    ...(type ? { type } : {}),
    ...(q ? { type: { contains: q, mode: 'insensitive' as const } } : {}),
  };
  const [rows, total, types] = await Promise.all([
    db.jobQueue.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * perPage, take: perPage }),
    db.jobQueue.count({ where }),
    db.jobQueue.findMany({ select: { type: true }, distinct: ['type'], take: 50 }),
  ]);
  return { rows, total, page, perPage, types: types.map((t) => t.type) };
}

type JobRow = Awaited<ReturnType<typeof loadJobs>>['rows'][number];

export default async function JobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission('job.manage');
  const sp = await searchParams;
  const [stats, { rows, total, page, perPage, types }] = await Promise.all([loadStats(), loadJobs(sp)]);

  const columns: Column<JobRow>[] = [
    { key: 'type', header: 'نوع', render: (j) => <span className="font-mono text-xs" dir="ltr">{j.type}</span> },
    { key: 'status', header: 'وضعیت', render: (j) => <StatusPill status={j.status} /> },
    { key: 'attempts', header: 'تلاش', align: 'center', secondary: true, render: (j) => `${toPersianDigits(j.attempts)} / ${toPersianDigits(j.maxAttempts)}` },
    { key: 'runAt', header: 'زمان اجرا', secondary: true, render: (j) => <span className="text-xs text-fg-muted">{timeAgoFa(j.runAt)}</span> },
    { key: 'lastError', header: 'خطای آخر', secondary: true, render: (j) => <span className="line-clamp-1 max-w-xs text-xs text-danger">{j.lastError ?? '—'}</span> },
    { key: 'actions', header: '', align: 'end', render: (j) => <JobRowActions jobId={j.id} status={j.status} /> },
  ];

  return (
    <div>
      <PageHeader title="صف کارها" description="نظارت بر صف کارهای پس‌زمینه و کارهای شکست‌خورده" />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="در صف" value={toPersianDigits(stats.queued)} icon={<ListChecks className="size-4" aria-hidden />} />
        <StatCard label="در حال اجرا" value={toPersianDigits(stats.running)} icon={<Loader2 className="size-4" aria-hidden />} />
        <StatCard label="موفق" value={toPersianDigits(stats.succeeded)} tone="success" icon={<CheckCircle2 className="size-4" aria-hidden />} />
        <StatCard label="ناموفق (در حال تلاش مجدد)" value={toPersianDigits(stats.failed)} tone="warn" icon={<XCircle className="size-4" aria-hidden />} />
        <StatCard label="شکست نهایی" value={toPersianDigits(stats.dead)} tone={stats.dead > 0 ? 'danger' : 'default'} icon={<Skull className="size-4" aria-hidden />} />
      </div>

      <div className="mb-5">
        <ScheduledTasksPanel />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        total={total}
        page={page}
        perPage={perPage}
        searchPlaceholder="جست‌وجوی نوع کار…"
        rowHref={(j) => `/admin/jobs/${j.id}`}
        emptyTitle="کاری در صف نیست"
        filters={[
          { key: 'status', label: 'وضعیت', options: [{ value: 'QUEUED', label: 'در صف' }, { value: 'RUNNING', label: 'در حال اجرا' }, { value: 'SUCCEEDED', label: 'موفق' }, { value: 'FAILED', label: 'ناموفق' }, { value: 'DEAD', label: 'شکست نهایی' }] },
          { key: 'type', label: 'نوع', options: types.map((t) => ({ value: t, label: t })) },
        ]}
      />
    </div>
  );
}
