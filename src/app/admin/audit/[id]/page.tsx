import { notFound } from 'next/navigation';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader, Panel } from '@/components/admin/kit';
import { formatJalali } from '@/lib/persian';
import { cn } from '@/lib/utils';

export const metadata = { title: 'جزئیات رویداد ممیزی' };

type DiffRow = { key: string; before: unknown; after: unknown; kind: 'added' | 'removed' | 'changed' };

function buildDiff(before: unknown, after: unknown): DiffRow[] {
  const b = before && typeof before === 'object' ? (before as Record<string, unknown>) : {};
  const a = after && typeof after === 'object' ? (after as Record<string, unknown>) : {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
  const rows: DiffRow[] = [];
  for (const key of keys) {
    const bv = b[key];
    const av = a[key];
    if (JSON.stringify(bv) === JSON.stringify(av)) continue;
    const kind = !(key in b) ? 'added' : !(key in a) ? 'removed' : 'changed';
    rows.push({ key, before: bv, after: av, kind });
  }
  return rows;
}

function fmt(v: unknown): string {
  if (v === undefined) return '—';
  if (v === null) return 'null';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default async function AuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('audit.view');
  const { id } = await params;

  const log = await db.auditLog.findUnique({ where: { id }, include: { actor: { select: { firstName: true, lastName: true, email: true } } } });
  if (!log) notFound();

  const diff = buildDiff(log.before, log.after);
  const hasStructured = log.before || log.after;

  return (
    <div>
      <PageHeader title={log.action} description={`${log.entity}${log.entityId ? ` — ${log.entityId}` : ''} — ${formatJalali(log.createdAt, true)}`} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="تفاوت پیش/پس از تغییر (Diff)">
            {!hasStructured ? (
              <p className="text-sm text-fg-muted">داده ساختاریافته‌ای برای این رویداد ثبت نشده است.</p>
            ) : diff.length === 0 ? (
              <p className="text-sm text-fg-muted">تغییری در فیلدها ثبت نشده است.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-base text-fg-muted">
                      <th className="p-2 text-start font-medium">فیلد</th>
                      <th className="p-2 text-start font-medium">قبل</th>
                      <th className="p-2 text-start font-medium">بعد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.map((d) => (
                      <tr key={d.key} className="border-b border-border-base last:border-0">
                        <td className="p-2 font-mono" dir="ltr">{d.key}</td>
                        <td className={cn('p-2 tnum', d.kind !== 'added' && 'bg-danger-soft text-danger')} dir="ltr">{fmt(d.before)}</td>
                        <td className={cn('p-2 tnum', d.kind !== 'removed' && 'bg-accent-soft text-accent')} dir="ltr">{fmt(d.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {log.before !== null && (
            <Panel title="داده کامل پیش از تغییر (Before)">
              <pre className="overflow-x-auto rounded-lg bg-surface-muted p-3 text-xs" dir="ltr">{JSON.stringify(log.before, null, 2)}</pre>
            </Panel>
          )}
          {log.after !== null && (
            <Panel title="داده کامل پس از تغییر (After)">
              <pre className="overflow-x-auto rounded-lg bg-surface-muted p-3 text-xs" dir="ltr">{JSON.stringify(log.after, null, 2)}</pre>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="اطلاعات رویداد">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-fg-muted">عامل</dt><dd>{log.actor ? [log.actor.firstName, log.actor.lastName].filter(Boolean).join(' ') : log.actorType}</dd></div>
              <div className="flex justify-between"><dt className="text-fg-muted">نوع عامل</dt><dd>{log.actorType}</dd></div>
              <div className="flex justify-between"><dt className="text-fg-muted">موجودیت</dt><dd>{log.entity}</dd></div>
              {log.entityId && <div className="flex justify-between gap-2"><dt className="shrink-0 text-fg-muted">شناسه</dt><dd className="truncate tnum" dir="ltr">{log.entityId}</dd></div>}
              {log.ip && <div className="flex justify-between"><dt className="text-fg-muted">IP</dt><dd className="tnum" dir="ltr">{log.ip}</dd></div>}
              {log.summary && <div><dt className="mb-1 text-fg-muted">توضیح</dt><dd>{log.summary}</dd></div>}
              {log.userAgent && <div><dt className="mb-1 text-fg-muted">User Agent</dt><dd className="break-all text-xs text-fg-faint" dir="ltr">{log.userAgent}</dd></div>}
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
