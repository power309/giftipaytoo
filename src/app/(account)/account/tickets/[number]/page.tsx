import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Headphones, User as UserIcon } from 'lucide-react';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { formatJalali } from '@/lib/persian';
import { Card, Badge, SectionHeading } from '@/components/ui';
import { ticketStatusInfo, ticketPriorityInfo } from '@/components/account/status-labels';
import { ReplyForm } from './reply-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ number: string }>;
}): Promise<Metadata> {
  const { number } = await params;
  return { title: `تیکت ${number}` };
}

type Attachment = { path: string; name: string; size: number; mime: string };

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const user = await requireUser('/account/tickets');
  const { number } = await params;

  // IDOR-safe: WHERE includes userId, so another customer's ticket 404s.
  const ticket = await db.ticket.findFirst({
    where: { number, userId: user.id },
    include: {
      department: { select: { nameFa: true } },
      order: { select: { orderNumber: true } },
      messages: { orderBy: { createdAt: 'asc' }, select: { id: true, isStaff: true, bodyFa: true, attachments: true, createdAt: true } },
    },
  });
  if (!ticket) notFound();

  const status = ticketStatusInfo(ticket.status);
  const priority = ticketPriorityInfo(ticket.priority);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-fg">{ticket.subject}</h1>
          <p className="mt-1 text-xs text-fg-muted tnum">
            {ticket.number} — ثبت‌شده در {formatJalali(ticket.createdAt, true)}
            {ticket.department && ` — ${ticket.department.nameFa}`}
            {ticket.order && (
              <>
                {' — '}
                <Link href={`/account/orders/${ticket.order.orderNumber}`} className="text-primary hover:underline">
                  سفارش {ticket.order.orderNumber}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={priority.tone} size="sm">{priority.label}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>

      <Card>
        <SectionHeading title="گفتگو" />
        <ul className="space-y-4">
          {ticket.messages.map((m) => {
            const attachments = (m.attachments as Attachment[] | null) ?? [];
            return (
              <li key={m.id} className={`flex gap-3 ${m.isStaff ? '' : 'flex-row-reverse'}`}>
                <span
                  className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${
                    m.isStaff ? 'bg-primary-soft text-primary' : 'bg-surface-muted text-fg-muted'
                  }`}
                >
                  {m.isStaff ? <Headphones className="size-4" aria-hidden /> : <UserIcon className="size-4" aria-hidden />}
                </span>
                <div className={`min-w-0 max-w-[85%] rounded-2xl p-3.5 ${m.isStaff ? 'bg-primary-soft' : 'bg-surface-muted'}`}>
                  <p className="text-xs font-semibold text-fg-muted">{m.isStaff ? 'پشتیبانی گیفتی‌پی' : 'شما'}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-fg">{m.bodyFa}</p>
                  {attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {attachments.map((a) => (
                        <a
                          key={a.path}
                          href={a.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative block size-16 overflow-hidden rounded-lg border border-border-base"
                        >
                          <Image src={a.path} alt={a.name} fill className="object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="mt-1.5 text-[11px] text-fg-faint tnum">{formatJalali(m.createdAt, true)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <ReplyForm number={ticket.number} closed={ticket.status === 'CLOSED'} />
      </Card>
    </div>
  );
}
