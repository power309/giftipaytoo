import type { Metadata } from 'next';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeading } from '@/components/account/page-heading';
import { NotificationsList, type NotificationRow } from './notifications-list';

export const metadata: Metadata = { title: 'اعلان‌ها' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await requireUser('/account/notifications');

  const rows = await db.notification.findMany({
    where: { userId: user.id, channel: 'IN_APP' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true },
  });

  const notifications: NotificationRow[] = rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    href: n.href,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-5">
      <PageHeading title="اعلان‌ها" subtitle={`${notifications.length.toLocaleString('fa-IR')} اعلان`} />
      <NotificationsList notifications={notifications} />
    </div>
  );
}
