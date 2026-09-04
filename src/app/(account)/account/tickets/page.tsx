import type { Metadata } from 'next';
import Link from 'next/link';
import { LifeBuoy, Plus } from 'lucide-react';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { formatJalali } from '@/lib/persian';
import { Card, Badge, EmptyState, SectionHeading } from '@/components/ui';
import { ticketStatusInfo, ticketPriorityInfo } from '@/components/account/status-labels';

export const metadata: Metadata = { title: 'تیکت‌های پشتیبانی' };
export const dynamic = 'force-dynamic';

export default async function TicketsPage() {
  const user = await requireUser('/account/tickets');

  const tickets = await db.ticket.findMany({
    where: { userId: user.id },
    orderBy: { lastReplyAt: 'desc' },
    select: { id: true, number: true, subject: true, status: true, priority: true, lastReplyAt: true, createdAt: true },
  });

  return (
    <div className="space-y-5">
      <SectionHeading
        title="پشتیبانی"
        subtitle={`${tickets.length.toLocaleString('fa-IR')} تیکت`}
        action={
          <Link
            href="/account/tickets/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-contrast hover:bg-primary-hover"
          >
            <Plus className="size-3.5" aria-hidden />
            تیکت جدید
          </Link>
        }
      />

      {tickets.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={<LifeBuoy className="size-7" aria-hidden />}
            title="هنوز تیکتی ثبت نکرده‌اید"
            description="در صورت نیاز به کمک درباره سفارش‌ها، کدها یا حساب کاربری، تیکت جدید ثبت کنید."
            action={
              <Link href="/account/tickets/new" className="text-sm font-medium text-primary hover:underline">
                ثبت تیکت جدید
              </Link>
            }
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-border-base">
            {tickets.map((t) => {
              const status = ticketStatusInfo(t.status);
              const priority = ticketPriorityInfo(t.priority);
              return (
                <li key={t.id}>
                  <Link
                    href={`/account/tickets/${t.number}`}
                    className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">{t.subject}</p>
                      <p className="mt-0.5 text-xs text-fg-muted tnum">
                        {t.number} — آخرین بروزرسانی {formatJalali(t.lastReplyAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={priority.tone} size="sm">{priority.label}</Badge>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
