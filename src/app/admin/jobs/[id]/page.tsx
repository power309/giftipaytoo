import { notFound } from 'next/navigation';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { scrub } from '@/server/audit';
import { PageHeader, Panel, StatusPill } from '@/components/admin/kit';
import { formatJalali, toPersianDigits } from '@/lib/persian';
import { JobRowActions } from '../row-actions';

export const metadata = { title: 'جزئیات کار' };

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('job.manage');
  const { id } = await params;

  const job = await db.jobQueue.findUnique({ where: { id } });
  if (!job) notFound();

  const safePayload = scrub(job.payload as Record<string, unknown>);

  return (
    <div>
      <PageHeader title={job.type} description={`شناسه کار: ${job.id}`} actions={<StatusPill status={job.status} />} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="بار داده (Payload)" description="مقادیر حساس پیش از نمایش حذف شده‌اند.">
            <pre className="overflow-x-auto rounded-lg bg-surface-muted p-3 text-xs" dir="ltr">{JSON.stringify(safePayload, null, 2)}</pre>
          </Panel>
          {job.lastError && (
            <Panel title="آخرین خطا" className="border-danger/30">
              <p className="whitespace-pre-wrap text-xs text-danger">{job.lastError}</p>
            </Panel>
          )}
        </div>
        <div className="space-y-4">
          <Panel title="اطلاعات">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-fg-muted">تلاش‌ها</dt><dd className="tnum">{toPersianDigits(job.attempts)} / {toPersianDigits(job.maxAttempts)}</dd></div>
              <div className="flex justify-between"><dt className="text-fg-muted">زمان اجرا</dt><dd className="text-xs">{formatJalali(job.runAt, true)}</dd></div>
              <div className="flex justify-between"><dt className="text-fg-muted">ایجاد شده</dt><dd className="text-xs">{formatJalali(job.createdAt, true)}</dd></div>
              <div className="flex justify-between"><dt className="text-fg-muted">به‌روزرسانی</dt><dd className="text-xs">{formatJalali(job.updatedAt, true)}</dd></div>
              {job.lockedBy && <div className="flex justify-between"><dt className="text-fg-muted">قفل توسط</dt><dd className="tnum text-xs" dir="ltr">{job.lockedBy}</dd></div>}
              {job.idempotencyKey && <div className="flex justify-between gap-2"><dt className="shrink-0 text-fg-muted">کلید یکتایی</dt><dd className="truncate text-xs tnum" dir="ltr">{job.idempotencyKey}</dd></div>}
            </dl>
          </Panel>
          <div className="flex justify-end">
            <JobRowActions jobId={job.id} status={job.status} />
          </div>
        </div>
      </div>
    </div>
  );
}
