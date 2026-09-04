import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader, Money, StatusPill, DemoBadge } from '@/components/admin/kit';
import { EmptyState } from '@/components/ui';
import { ShieldCheck } from 'lucide-react';
import { formatJalali, toPersianDigits } from '@/lib/persian';
import { orderCustomerLabel, explainRiskFlags } from '../orders/_lib';
import { ReviewQueueActions } from '@/components/admin/orders/review-queue-actions';

export const metadata = { title: 'صف بررسی دستی' };

export default async function ReviewsQueuePage() {
  await requirePermission('order.review');

  const orders = await db.order.findMany({
    where: { needsReview: true, status: { notIn: ['CANCELED', 'REFUNDED'] } },
    orderBy: { riskScore: 'desc' },
    take: 100,
    select: {
      id: true, orderNumber: true, totalToman: true, riskScore: true, riskFlags: true,
      status: true, paymentStatus: true, placedAt: true, isDemo: true,
      user: { select: { firstName: true, lastName: true, email: true, phone: true } },
      guestEmail: true, guestPhone: true,
    },
  });

  return (
    <div>
      <PageHeader
        title="صف بررسی دستی"
        description="سفارش‌هایی که موتور ریسک برای بررسی دستی علامت‌گذاری کرده است."
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="size-7" aria-hidden />}
          title="سفارشی در صف بررسی نیست"
          description="همه سفارش‌ها بدون نیاز به بررسی دستی در جریان هستند."
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const reasons = explainRiskFlags(o.riskFlags);
            return (
              <li key={o.id} className="rounded-xl border border-warn/30 bg-warn-soft/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={`/admin/orders/${o.id}`} className="font-medium text-fg hover:text-primary tnum" dir="ltr">
                        {o.orderNumber}
                      </a>
                      {o.isDemo && <DemoBadge />}
                      <StatusPill status={o.status} />
                      <StatusPill status={o.paymentStatus} />
                      <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger tnum">
                        امتیاز ریسک {toPersianDigits(o.riskScore)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-fg-muted">
                      {orderCustomerLabel(o)} — {formatJalali(o.placedAt)}
                    </p>
                    <Money value={o.totalToman} className="mt-1 block text-sm font-semibold" />
                    {reasons.length > 0 && (
                      <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-fg-muted">
                        {reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <ReviewQueueActions orderId={o.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
