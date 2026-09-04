import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader, Panel, Money, StatusPill, DemoBadge } from '@/components/admin/kit';
import { Badge, EmptyState } from '@/components/ui';
import { formatJalali, timeAgoFa, toPersianDigits } from '@/lib/persian';
import { formatToman } from '@/lib/money';
import { customerName } from '../_lib';
import { CustomerDetailClient, SessionsList } from './client';
import { MessageSquare, LifeBuoy } from 'lucide-react';

export const metadata = { title: 'جزئیات مشتری' };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('customer.view');
  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id },
    include: {
      customerGroup: true,
      addresses: true,
      referredBy: { select: { id: true, firstName: true, lastName: true } },
      referrals: { select: { id: true, firstName: true, lastName: true, createdAt: true }, take: 20, orderBy: { createdAt: 'desc' } },
      sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' } },
      orders: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, orderNumber: true, status: true, paymentStatus: true, totalToman: true, placedAt: true, isDemo: true } },
      reviews: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, productId: true, rating: true, bodyFa: true, status: true, createdAt: true } },
      tickets: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, number: true, subject: true, status: true, priority: true, createdAt: true } },
      walletTx: { orderBy: { createdAt: 'desc' }, take: 20 },
      loyaltyTx: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!user || user.isStaff) notFound();

  const [orderStats, notes] = await Promise.all([
    db.order.aggregate({ where: { userId: id, paymentStatus: 'PAID' }, _sum: { totalToman: true }, _count: { _all: true } }),
    db.auditLog.findMany({ where: { entity: 'User', entityId: id, action: 'customer.note' }, orderBy: { createdAt: 'desc' }, take: 30, include: { actor: { select: { firstName: true, lastName: true } } } }),
  ]);

  const perms = {
    canUpdate: staff.permissions.includes('customer.update'),
    canWallet: staff.permissions.includes('customer.wallet'),
  };

  return (
    <div>
      <PageHeader
        title={customerName(user)}
        description={`عضویت از ${formatJalali(user.createdAt)}`}
        actions={
          <>
            {user.isDemo && <DemoBadge />}
            <StatusPill status={user.status} />
          </>
        }
      />

      <CustomerDetailClient user={user} perms={perms} />

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="سفارش‌های اخیر" actions={<Link href={`/admin/orders?q=${encodeURIComponent(user.email ?? user.phone ?? '')}`} className="text-xs text-primary hover:underline">مشاهده همه</Link>}>
            {user.orders.length === 0 ? (
              <EmptyState title="سفارشی ثبت نشده است" className="py-6" />
            ) : (
              <ul className="divide-y divide-border-base">
                {user.orders.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <Link href={`/admin/orders/${o.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-fg hover:text-primary tnum" dir="ltr">
                      {o.orderNumber}
                    </Link>
                    {o.isDemo && <DemoBadge />}
                    <StatusPill status={o.status} />
                    <Money value={o.totalToman} className="w-24 shrink-0 text-end text-sm" />
                    <span className="w-24 shrink-0 text-end text-xs text-fg-muted">{formatJalali(o.placedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="کیف پول و امتیاز وفاداری" description={`موجودی فعلی: ${formatToman(user.walletBalance)} — امتیاز: ${toPersianDigits(user.loyaltyPoints)}`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-fg-muted">تراکنش‌های کیف پول</p>
                {user.walletTx.length === 0 ? (
                  <p className="text-xs text-fg-faint">تراکنشی ثبت نشده است.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {user.walletTx.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-fg-muted">{t.reason}</span>
                        <span className={t.type === 'CREDIT' ? 'text-accent' : 'text-danger'}>
                          {t.type === 'CREDIT' ? '+' : '-'}
                          {formatToman(t.amountToman)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-fg-muted">تراکنش‌های امتیاز</p>
                {user.loyaltyTx.length === 0 ? (
                  <p className="text-xs text-fg-faint">تراکنشی ثبت نشده است.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {user.loyaltyTx.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-fg-muted">{t.reason}</span>
                        <span className={t.points > 0 ? 'text-accent' : 'text-danger'} dir="ltr">
                          {t.points > 0 ? '+' : ''}
                          {toPersianDigits(t.points)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="دیدگاه‌ها">
            {user.reviews.length === 0 ? (
              <EmptyState icon={<MessageSquare className="size-6" aria-hidden />} title="دیدگاهی ثبت نشده است" className="py-6" />
            ) : (
              <ul className="space-y-2">
                {user.reviews.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border-base p-2.5 text-xs">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="tnum text-gold">{'★'.repeat(r.rating)}</span>
                      <StatusPill status={r.status} className="text-[10px]" />
                      <span className="text-fg-faint">{formatJalali(r.createdAt)}</span>
                    </div>
                    <p className="text-fg-muted">{r.bodyFa}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="تیکت‌ها">
            {user.tickets.length === 0 ? (
              <EmptyState icon={<LifeBuoy className="size-6" aria-hidden />} title="تیکتی ثبت نشده است" className="py-6" />
            ) : (
              <ul className="divide-y divide-border-base">
                {user.tickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0 text-sm">
                    <Link href={`/admin/tickets/${t.id}`} className="min-w-0 flex-1 truncate hover:text-primary">
                      {t.subject}
                    </Link>
                    <StatusPill status={t.status} />
                    <span className="text-xs text-fg-faint">{formatJalali(t.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="یادداشت‌های داخلی">
            {notes.length === 0 ? (
              <p className="py-2 text-xs text-fg-muted">یادداشتی ثبت نشده است.</p>
            ) : (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-surface-muted p-2.5 text-xs">
                    <p className="text-fg">{n.summary}</p>
                    <p className="mt-1 text-fg-faint">
                      {n.actor ? [n.actor.firstName, n.actor.lastName].filter(Boolean).join(' ') : 'سیستم'} — {formatJalali(n.createdAt, true)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="اطلاعات تماس">
            <dl className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-fg-muted">ایمیل</dt>
                <dd className="tnum" dir="ltr">{user.email ?? '—'} {user.emailVerifiedAt && <Badge tone="success" size="sm">تأیید‌شده</Badge>}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-fg-muted">موبایل</dt>
                <dd className="tnum" dir="ltr">{user.phone ?? '—'} {user.phoneVerifiedAt && <Badge tone="success" size="sm">تأیید‌شده</Badge>}</dd>
              </div>
              {user.customerGroup && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-fg-muted">گروه</dt>
                  <dd><Badge tone="primary" size="sm">{user.customerGroup.nameFa}</Badge></dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <dt className="text-fg-muted">تعداد سفارش پرداخت‌شده</dt>
                <dd className="tnum">{toPersianDigits(orderStats._count._all)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-fg-muted">مجموع خرید</dt>
                <dd><Money value={orderStats._sum.totalToman ?? 0} /></dd>
              </div>
            </dl>
          </Panel>

          <Panel title="نشست‌های فعال">
            {user.sessions.length === 0 ? (
              <p className="py-1 text-xs text-fg-muted">نشست فعالی وجود ندارد.</p>
            ) : (
              <SessionsList sessions={user.sessions} userId={user.id} canRevoke={perms.canUpdate} />
            )}
          </Panel>

          <Panel title="شبکه معرفی">
            <div className="space-y-2 text-xs">
              <p className="text-fg-muted">
                معرف: {user.referredBy ? <Link href={`/admin/customers/${user.referredBy.id}`} className="text-primary hover:underline">{customerName(user.referredBy)}</Link> : '—'}
              </p>
              <p className="text-fg-muted">کد معرفی: <span className="font-mono tnum" dir="ltr">{user.referralCode ?? '—'}</span></p>
              <div>
                <p className="mb-1 text-fg-muted">افراد معرفی‌شده ({toPersianDigits(user.referrals.length)})</p>
                {user.referrals.length === 0 ? (
                  <p className="text-fg-faint">—</p>
                ) : (
                  <ul className="space-y-1">
                    {user.referrals.map((r) => (
                      <li key={r.id}>
                        <Link href={`/admin/customers/${r.id}`} className="text-primary hover:underline">
                          {customerName(r)}
                        </Link>
                        <span className="ms-1 text-fg-faint">— {formatJalali(r.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
