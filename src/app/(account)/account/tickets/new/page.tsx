import type { Metadata } from 'next';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { SectionHeading, Card } from '@/components/ui';
import { listDepartments } from '../actions';
import { NewTicketForm } from './ticket-form';

export const metadata: Metadata = { title: 'تیکت جدید' };
export const dynamic = 'force-dynamic';

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const user = await requireUser('/account/tickets/new');
  const { orderId } = await searchParams;

  const [departments, orders] = await Promise.all([
    listDepartments(),
    db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, orderNumber: true },
    }),
  ]);

  // Only offer a pre-selected order if it genuinely belongs to this user.
  const defaultOrderId = orderId && orders.some((o) => o.id === orderId) ? orderId : undefined;

  return (
    <div className="space-y-5">
      <SectionHeading title="تیکت جدید" subtitle="شرح درخواست خود را بنویسید تا تیم پشتیبانی گیفتی‌پی بررسی کند." />
      <Card>
        <NewTicketForm departments={departments} orders={orders} defaultOrderId={defaultOrderId} />
      </Card>
    </div>
  );
}
