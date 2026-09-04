import { notFound } from 'next/navigation';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader, Panel, DemoBadge, StatusPill } from '@/components/admin/kit';
import { formatJalali } from '@/lib/persian';

export const metadata = { title: 'فعالیت کارمند' };

export default async function StaffActivityPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('staff.manage');
  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, firstName: true, lastName: true, email: true, status: true, isStaff: true, isDemo: true, roles: { select: { role: { select: { nameFa: true } } } } },
  });
  if (!user || !user.isStaff) notFound();

  const logs = await db.auditLog.findMany({ where: { actorId: id }, orderBy: { createdAt: 'desc' }, take: 200 });

  return (
    <div>
      <PageHeader
        title={[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'کارمند'}
        description={`نقش‌ها: ${user.roles.map((r) => r.role.nameFa).join('، ') || 'بدون نقش'}`}
        actions={
          <>
            {user.isDemo && <DemoBadge />}
            <StatusPill status={user.status} />
          </>
        }
      />
      <Panel title="فعالیت‌های اخیر (لاگ ممیزی)">
        {logs.length === 0 ? (
          <p className="py-4 text-sm text-fg-muted">فعالیتی ثبت نشده است.</p>
        ) : (
          <ul className="max-h-[36rem] space-y-2 overflow-y-auto">
            {logs.map((l) => (
              <li key={l.id} className="rounded-lg border border-border-base p-2.5 text-xs">
                <p className="font-mono text-fg" dir="ltr">{l.action}</p>
                <p className="mt-0.5 text-fg-muted">{l.entity}{l.entityId ? ` — ${l.entityId}` : ''}{l.summary ? ` — ${l.summary}` : ''}</p>
                <p className="mt-0.5 text-fg-faint">{formatJalali(l.createdAt, true)}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
