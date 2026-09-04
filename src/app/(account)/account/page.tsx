import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Package, Wallet, KeyRound, Bell, LifeBuoy, ChevronLeft, ShoppingBag, Sparkles,
} from 'lucide-react';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { formatToman } from '@/lib/money';
import { formatJalali, toPersianDigits } from '@/lib/persian';
import { Card, SectionHeading, Badge, EmptyState } from '@/components/ui';
import { orderStatusInfo } from '@/components/account/status-labels';

export const metadata: Metadata = { title: 'داشبورد' };
export const dynamic = 'force-dynamic';

const LOYALTY_TIERS = [
  { key: 'bronze', label: 'برنزی', min: 0 },
  { key: 'silver', label: 'نقره‌ای', min: 500 },
  { key: 'gold', label: 'طلایی', min: 2000 },
  { key: 'diamond', label: 'الماسی', min: 5000 },
] as const;

function loyaltyProgress(points: number) {
  const idx = [...LOYALTY_TIERS].reverse().findIndex((t) => points >= t.min);
  const currentIdx = LOYALTY_TIERS.length - 1 - idx;
  const current = LOYALTY_TIERS[currentIdx];
  const next = LOYALTY_TIERS[currentIdx + 1];
  const pct = next ? Math.min(100, Math.round(((points - current.min) / (next.min - current.min)) * 100)) : 100;
  return { current, next, pct };
}

export default async function AccountDashboardPage() {
  const user = await requireUser('/account');

  const [recentOrders, ordersCount, unreadNotifications, openTickets, codesCount] = await Promise.all([
    db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalToman: true,
        createdAt: true,
        items: { select: { productNameFa: true }, take: 1 },
        _count: { select: { items: true } },
      },
    }),
    db.order.count({ where: { userId: user.id } }),
    db.notification.findMany({
      where: { userId: user.id, readAt: null },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, title: true, body: true, href: true, createdAt: true },
    }),
    db.ticket.findMany({
      where: { userId: user.id, status: { in: ['OPEN', 'PENDING_CUSTOMER', 'PENDING_STAFF'] } },
      orderBy: { lastReplyAt: 'desc' },
      take: 3,
      select: { id: true, number: true, subject: true, status: true, lastReplyAt: true },
    }),
    db.delivery.count({ where: { orderItem: { order: { userId: user.id } } } }),
  ]);

  const { current, next, pct } = loyaltyProgress(user.loyaltyPoints);
  const isBrandNew = ordersCount === 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-fg">سلام {user.displayName.split(' ')[0]}، خوش آمدید 👋</h1>

      {isBrandNew && (
        <Card className="bg-primary-soft border-primary/20">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-contrast">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-semibold text-fg">حساب شما تازه ساخته شده است</p>
                <p className="text-sm text-fg-muted">هنوز سفارشی ثبت نکرده‌اید. اولین خرید خود را از فروشگاه شروع کنید.</p>
              </div>
            </div>
            <Link
              href="/"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-contrast hover:bg-primary-hover"
            >
              <ShoppingBag className="size-4" aria-hidden />
              رفتن به فروشگاه
            </Link>
          </div>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Wallet className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-fg-muted">موجودی کیف پول</p>
              <p className="truncate text-lg font-bold text-fg tnum">{formatToman(user.walletBalance)}</p>
            </div>
          </div>
          <Link href="/account/wallet" className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            مشاهده تراکنش‌ها
            <ChevronLeft className="size-3.5" aria-hidden />
          </Link>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold-soft text-gold">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-fg-muted">سطح وفاداری</p>
              <p className="text-lg font-bold text-fg">{current.label}</p>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-fg-muted">
              {next
                ? `${toPersianDigits(user.loyaltyPoints)} از ${toPersianDigits(next.min)} امتیاز تا سطح ${next.label}`
                : `${toPersianDigits(user.loyaltyPoints)} امتیاز — بالاترین سطح`}
            </p>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <KeyRound className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-fg-muted">کدهای دیجیتال خریداری‌شده</p>
              <p className="text-lg font-bold text-fg tnum">{toPersianDigits(codesCount)}</p>
            </div>
          </div>
          <Link href="/account/codes" className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            رفتن به کتابخانه کدها
            <ChevronLeft className="size-3.5" aria-hidden />
          </Link>
        </Card>
      </div>

      {/* Recent orders */}
      <Card className="p-0 overflow-hidden">
        <div className="p-5 pb-0">
          <SectionHeading
            title="سفارش‌های اخیر"
            action={
              <Link href="/account/orders" className="text-xs font-medium text-primary hover:underline">
                مشاهده همه
              </Link>
            }
          />
        </div>
        {recentOrders.length === 0 ? (
          <EmptyState
            icon={<Package className="size-7" aria-hidden />}
            title="هنوز سفارشی ثبت نشده است"
            description="پس از اولین خرید، سفارش‌های شما اینجا نمایش داده می‌شود."
          />
        ) : (
          <ul className="divide-y divide-border-base">
            {recentOrders.map((o) => {
              const info = orderStatusInfo(o.status);
              return (
                <li key={o.id}>
                  <Link
                    href={`/account/orders/${o.orderNumber}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">
                        {o.items[0]?.productNameFa ?? 'سفارش'}
                        {o._count.items > 1 && ` و ${toPersianDigits(o._count.items - 1)} کالای دیگر`}
                      </p>
                      <p className="mt-0.5 text-xs text-fg-muted tnum">
                        {o.orderNumber} — {formatJalali(o.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold text-fg tnum">{formatToman(o.totalToman)}</span>
                      <Badge tone={info.tone} size="sm">
                        {info.label}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Unread notifications */}
        <Card>
          <SectionHeading
            title="اعلان‌های خوانده‌نشده"
            action={
              <Link href="/account/notifications" className="text-xs font-medium text-primary hover:underline">
                مشاهده همه
              </Link>
            }
          />
          {unreadNotifications.length === 0 ? (
            <EmptyState
              icon={<Bell className="size-6" aria-hidden />}
              title="اعلان خوانده‌نشده‌ای ندارید"
              className="py-8"
            />
          ) : (
            <ul className="space-y-3">
              {unreadNotifications.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href ?? '/account/notifications'}
                    className="block rounded-xl p-2.5 -m-2.5 transition-colors hover:bg-surface-muted"
                  >
                    <p className="text-sm font-medium text-fg">{n.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-fg-muted">{n.body}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Open tickets */}
        <Card>
          <SectionHeading
            title="تیکت‌های در حال بررسی"
            action={
              <Link href="/account/tickets" className="text-xs font-medium text-primary hover:underline">
                مشاهده همه
              </Link>
            }
          />
          {openTickets.length === 0 ? (
            <EmptyState
              icon={<LifeBuoy className="size-6" aria-hidden />}
              title="تیکت بازی ندارید"
              description="در صورت نیاز به کمک، تیکت جدیدی ثبت کنید."
              className="py-8"
            />
          ) : (
            <ul className="space-y-3">
              {openTickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/account/tickets/${t.number}`}
                    className="flex items-center justify-between gap-2 rounded-xl p-2.5 -m-2.5 transition-colors hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">{t.subject}</p>
                      <p className="text-xs text-fg-muted tnum">{t.number}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
