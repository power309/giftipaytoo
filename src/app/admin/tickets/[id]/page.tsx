import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader, Panel, StatusPill, DemoBadge } from '@/components/admin/kit';
import { customerName } from '../../customers/_lib';
import { TicketThreadClient } from './client';

export const metadata = { title: 'جزئیات تیکت' };

async function loadCannedResponses(): Promise<{ label: string; body: string }[]> {
  try {
    const { getSetting } = await import('@/server/settings');
    return await getSetting<{ label: string; body: string }[]>('support.cannedResponses', []);
  } catch {
    return [];
  }
}

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('ticket.view');
  const { id } = await params;

  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      department: true,
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      order: { select: { id: true, orderNumber: true } },
      messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!ticket) notFound();

  const [departments, staffList, customerOrders, cannedResponses] = await Promise.all([
    db.ticketDepartment.findMany({ select: { id: true, nameFa: true }, orderBy: { sortOrder: 'asc' } }),
    db.user.findMany({ where: { isStaff: true, status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } }),
    db.order.findMany({ where: { userId: ticket.userId }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, orderNumber: true, status: true, totalToman: true } }),
    loadCannedResponses(),
  ]);

  const perms = {
    canReply: staff.permissions.includes('ticket.reply'),
    canAssign: staff.permissions.includes('ticket.assign'),
  };

  return (
    <div>
      <PageHeader
        title={ticket.subject}
        description={`تیکت ${ticket.number} — ${customerName(ticket.user)}`}
        actions={
          <>
            {ticket.isDemo && <DemoBadge />}
            <StatusPill status={ticket.status} />
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TicketThreadClient
            ticket={{ id: ticket.id, status: ticket.status, priority: ticket.priority, departmentId: ticket.departmentId, assignedToId: ticket.assignedToId }}
            messages={ticket.messages}
            departments={departments}
            staffList={staffList}
            cannedResponses={cannedResponses}
            perms={perms}
          />
        </div>

        <div className="space-y-4">
          <Panel title="مشتری">
            <div className="space-y-1.5 text-sm">
              <Link href={`/admin/customers/${ticket.user.id}`} className="font-medium text-primary hover:underline">
                {customerName(ticket.user)}
              </Link>
              <p className="text-xs text-fg-muted" dir="ltr">{ticket.user.email ?? '—'}</p>
              <p className="text-xs text-fg-muted tnum" dir="ltr">{ticket.user.phone ?? '—'}</p>
            </div>
          </Panel>

          {ticket.order && (
            <Panel title="سفارش مرتبط">
              <Link href={`/admin/orders/${ticket.order.id}`} className="text-sm text-primary hover:underline tnum" dir="ltr">
                {ticket.order.orderNumber}
              </Link>
            </Panel>
          )}

          <Panel title="سفارش‌های اخیر مشتری">
            {customerOrders.length === 0 ? (
              <p className="text-xs text-fg-muted">سفارشی ثبت نشده است.</p>
            ) : (
              <ul className="space-y-1.5">
                {customerOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-xs">
                    <Link href={`/admin/orders/${o.id}`} className="tnum text-primary hover:underline" dir="ltr">
                      {o.orderNumber}
                    </Link>
                    <StatusPill status={o.status} className="text-[10px]" />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
