import type { Metadata } from 'next';
import Link from 'next/link';
import { Receipt, FileDown } from 'lucide-react';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { formatToman } from '@/lib/money';
import { formatJalali } from '@/lib/persian';
import { Card, EmptyState } from '@/components/ui';
import { PageHeading } from '@/components/account/page-heading';

export const metadata: Metadata = { title: 'فاکتورها' };
export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const user = await requireUser('/account/invoices');

  const orders = await db.order.findMany({
    where: { userId: user.id, paymentStatus: 'PAID' },
    orderBy: { createdAt: 'desc' },
    select: {
      orderNumber: true,
      totalToman: true,
      paidAt: true,
      createdAt: true,
      invoice: { select: { number: true, issuedAt: true } },
    },
  });

  return (
    <div className="space-y-5">
      <PageHeading title="فاکتورها" subtitle="فاکتورهای صادرشده برای سفارش‌های پرداخت‌شده شما" />

      {orders.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={<Receipt className="size-7" aria-hidden />}
            title="هنوز فاکتوری صادر نشده است"
            description="پس از پرداخت اولین سفارش، فاکتور آن اینجا در دسترس شما قرار می‌گیرد."
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-border-base">
            {orders.map((o) => (
              <li key={o.orderNumber}>
                <Link
                  href={`/account/invoices/${o.orderNumber}`}
                  className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg tnum">
                      {o.invoice?.number ?? `INV-${o.orderNumber}`}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-muted tnum">
                      سفارش {o.orderNumber} — {formatJalali(o.paidAt ?? o.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold text-fg tnum">{formatToman(o.totalToman)}</span>
                    <FileDown className="size-4 text-fg-muted" aria-hidden />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
