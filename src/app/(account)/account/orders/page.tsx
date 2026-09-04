import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { Package } from 'lucide-react';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { formatToman } from '@/lib/money';
import { formatJalali, toPersianDigits } from '@/lib/persian';
import { Card, Badge, EmptyState, Pagination } from '@/components/ui';
import { orderStatusInfo } from '@/components/account/status-labels';
import { PageHeading } from '@/components/account/page-heading';
import { OrdersFilterBar } from './filter-bar';

export const metadata: Metadata = { title: 'سفارش‌های من' };
export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = [
  'PENDING', 'AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'COMPLETED',
  'PARTIALLY_FULFILLED', 'CANCELED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED',
] as const;

const PER_PAGE = 10;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string; q?: string; page?: string }>;
}) {
  const user = await requireUser('/account/orders');
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page) || 1);
  const status = STATUS_OPTIONS.includes(sp.status as (typeof STATUS_OPTIONS)[number]) ? sp.status : undefined;
  const q = sp.q?.trim();

  const where: Prisma.OrderWhereInput = {
    userId: user.id,
    ...(status ? { status: status as Prisma.EnumOrderStatusFilter['equals'] } : {}),
    ...(q ? { orderNumber: { contains: q, mode: 'insensitive' } } : {}),
    ...(sp.from || sp.to
      ? {
          createdAt: {
            ...(sp.from ? { gte: new Date(sp.from) } : {}),
            ...(sp.to ? { lte: new Date(`${sp.to}T23:59:59`) } : {}),
          },
        }
      : {}),
  };

  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalToman: true,
        createdAt: true,
        items: { select: { productNameFa: true, qty: true }, take: 2 },
        _count: { select: { items: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const hasFilters = !!(status || q || sp.from || sp.to);

  return (
    <div className="space-y-5">
      <PageHeading title="سفارش‌های من" subtitle={`${toPersianDigits(total)} سفارش`} />

      <Card>
        <OrdersFilterBar
          statusOptions={STATUS_OPTIONS as unknown as string[]}
          initial={{ status: sp.status, from: sp.from, to: sp.to, q: sp.q }}
        />
      </Card>

      {orders.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={<Package className="size-7" aria-hidden />}
            title={hasFilters ? 'سفارشی با این فیلترها یافت نشد' : 'هنوز سفارشی ثبت نکرده‌اید'}
            description={hasFilters ? 'فیلترها را تغییر دهید یا پاک کنید.' : 'پس از خرید، سفارش‌های شما اینجا نمایش داده می‌شود.'}
            action={
              !hasFilters && (
                <Link href="/" className="text-sm font-medium text-primary hover:underline">
                  رفتن به فروشگاه
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-border-base">
            {orders.map((o) => {
              const info = orderStatusInfo(o.status);
              return (
                <li key={o.id}>
                  <Link
                    href={`/account/orders/${o.orderNumber}`}
                    className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">
                        {o.items.map((i) => i.productNameFa).join('، ')}
                        {o._count.items > o.items.length && ` و ${toPersianDigits(o._count.items - o.items.length)} مورد دیگر`}
                      </p>
                      <p className="mt-1 text-xs text-fg-muted tnum">
                        شماره سفارش {o.orderNumber} — {formatJalali(o.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold text-fg tnum">{formatToman(o.totalToman)}</span>
                      <Badge tone={info.tone}>{info.label}</Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Pagination page={page} totalPages={totalPages} buildHref={(p) => {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (q) params.set('q', q);
        if (sp.from) params.set('from', sp.from);
        if (sp.to) params.set('to', sp.to);
        params.set('page', String(p));
        return `/account/orders?${params.toString()}`;
      }} />
    </div>
  );
}
