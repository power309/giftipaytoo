import Link from 'next/link';
import {
  Wallet, TrendingUp, Package, ShoppingCart, ReceiptText, CircleCheck, Users, Repeat,
  Truck, ShieldAlert, Boxes, Landmark, LifeBuoy, BadgeCheck, AlertTriangle, ServerCrash, Clock,
} from 'lucide-react';
import { requirePermission } from '@/server/auth/guard';
import { formatToman } from '@/lib/money';
import { toPersianDigits, formatJalali, timeAgoFa } from '@/lib/persian';
import { PageHeader, StatCard, Panel, Money, StatusPill, DemoBadge } from '@/components/admin/kit';
import { AreaLineChart } from '@/components/admin/charts/area-line-chart';
import { BarChart } from '@/components/admin/charts/bar-chart';
import { DonutChart } from '@/components/admin/charts/donut-chart';
import { EmptyState, Badge } from '@/components/ui';
import { resolvePeriod, previousPeriod, percentDelta, type SearchParams } from '@/lib/admin-query';
import {
  getDashboardKpis, getOrdersByStatus, getRevenueOverTime, getTopProducts, getTopCategories,
  getRecentOrders, getRecentTickets, getDashboardAlerts,
} from './_dash/queries';
import { PeriodPicker } from './_dash/period-picker';

export const metadata = { title: 'داشبورد' };

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'در انتظار', AWAITING_PAYMENT: 'در انتظار پرداخت', PAID: 'پرداخت‌شده',
  UNDER_REVIEW: 'بررسی دستی', PROCESSING: 'در حال پردازش', COMPLETED: 'تکمیل‌شده',
  PARTIALLY_FULFILLED: 'تحویل جزئی', CANCELED: 'لغوشده', EXPIRED: 'منقضی',
  REFUNDED: 'بازپرداخت‌شده', PARTIALLY_REFUNDED: 'بازپرداخت جزئی', FAILED: 'ناموفق',
};

function customerLabel(o: { user: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null; guestEmail: string | null; guestPhone: string | null }) {
  if (o.user) {
    const name = [o.user.firstName, o.user.lastName].filter(Boolean).join(' ');
    return name || o.user.email || o.user.phone || 'کاربر';
  }
  return o.guestEmail || o.guestPhone || 'مهمان';
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission('dashboard.view');
  const sp = await searchParams;
  const presetRaw = sp.period;
  const preset = Array.isArray(presetRaw) ? presetRaw[0] : presetRaw ?? 'today';
  const fromRaw = sp.from;
  const toRaw = sp.to;
  const customFrom = Array.isArray(fromRaw) ? fromRaw[0] : fromRaw;
  const customTo = Array.isArray(toRaw) ? toRaw[0] : toRaw;

  const period = resolvePeriod(preset, customFrom, customTo);
  const prev = previousPeriod(period.from, period.to);

  const [kpis, prevKpis, byStatus, revenueSeries, topProducts, topCategories, recentOrders, recentTickets, alerts] =
    await Promise.all([
      getDashboardKpis(period),
      getDashboardKpis(prev),
      getOrdersByStatus(period),
      getRevenueOverTime(period),
      getTopProducts(period),
      getTopCategories(period),
      getRecentOrders(),
      getRecentTickets(),
      getDashboardAlerts(),
    ]);

  const hasAlerts = alerts.failedDeliveries > 0 || alerts.deadJobs > 0 || alerts.staleExchangeRates.length > 0;

  return (
    <div>
      <PageHeader
        title="داشبورد"
        description={`نمای کلی عملکرد فروشگاه — ${period.label}`}
        actions={<PeriodPicker />}
      />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <StatCard
          label="درآمد"
          value={formatToman(kpis.revenueToman)}
          delta={percentDelta(kpis.revenueToman, prevKpis.revenueToman)}
          icon={<Wallet className="size-4" aria-hidden />}
        />
        <StatCard
          label="سود خالص"
          value={formatToman(kpis.netProfitToman)}
          delta={percentDelta(kpis.netProfitToman, prevKpis.netProfitToman)}
          tone={kpis.netProfitToman >= 0 ? 'success' : 'danger'}
          icon={<TrendingUp className="size-4" aria-hidden />}
        />
        <StatCard
          label="بهای تمام‌شده کالا"
          value={formatToman(kpis.costOfGoodsToman)}
          delta={percentDelta(kpis.costOfGoodsToman, prevKpis.costOfGoodsToman)}
          icon={<Package className="size-4" aria-hidden />}
        />
        <StatCard
          label="تعداد سفارش"
          value={toPersianDigits(kpis.orderCount)}
          delta={percentDelta(kpis.orderCount, prevKpis.orderCount)}
          icon={<ShoppingCart className="size-4" aria-hidden />}
        />
        <StatCard
          label="میانگین ارزش سفارش"
          value={formatToman(kpis.avgOrderValueToman)}
          delta={percentDelta(kpis.avgOrderValueToman, prevKpis.avgOrderValueToman)}
          icon={<ReceiptText className="size-4" aria-hidden />}
        />
        <StatCard
          label="نرخ پرداخت موفق"
          value={kpis.paymentSuccessRate == null ? '—' : `${toPersianDigits(kpis.paymentSuccessRate)}٪`}
          hint={kpis.paymentFailRate == null ? undefined : `${toPersianDigits(kpis.paymentFailRate)}٪ ناموفق`}
          tone="success"
          icon={<CircleCheck className="size-4" aria-hidden />}
        />
        <StatCard
          label="مشتریان جدید"
          value={toPersianDigits(kpis.newCustomers)}
          delta={percentDelta(kpis.newCustomers, prevKpis.newCustomers)}
          icon={<Users className="size-4" aria-hidden />}
        />
        <StatCard
          label="سهم مشتریان بازگشتی"
          value={kpis.returningCustomerShare == null ? '—' : `${toPersianDigits(kpis.returningCustomerShare)}٪`}
          icon={<Repeat className="size-4" aria-hidden />}
        />
        <StatCard
          label="تحویل دستی در انتظار"
          value={toPersianDigits(kpis.pendingManualDeliveries)}
          tone={kpis.pendingManualDeliveries > 0 ? 'warn' : 'default'}
          icon={<Truck className="size-4" aria-hidden />}
        />
        <StatCard
          label="سفارش‌های در بررسی"
          value={toPersianDigits(kpis.ordersUnderReview)}
          tone={kpis.ordersUnderReview > 0 ? 'warn' : 'default'}
          icon={<ShieldAlert className="size-4" aria-hidden />}
        />
        <StatCard
          label="کالاهای رو به اتمام"
          value={toPersianDigits(kpis.lowStockItems)}
          tone={kpis.lowStockItems > 0 ? 'warn' : 'default'}
          icon={<Boxes className="size-4" aria-hidden />}
        />
        <StatCard
          label="ارزش موجودی انبار"
          value={formatToman(kpis.inventoryValueToman)}
          icon={<Landmark className="size-4" aria-hidden />}
        />
        <StatCard
          label="تیکت‌های باز"
          value={toPersianDigits(kpis.openTickets)}
          tone={kpis.openTickets > 0 ? 'warn' : 'default'}
          icon={<LifeBuoy className="size-4" aria-hidden />}
        />
        <StatCard
          label="تأیید قیمت در انتظار"
          value={toPersianDigits(kpis.pendingPriceApprovals)}
          tone={kpis.pendingPriceApprovals > 0 ? 'warn' : 'default'}
          icon={<BadgeCheck className="size-4" aria-hidden />}
        />
      </div>

      {/* Alerts */}
      {hasAlerts && (
        <Panel title="هشدارها" className="mt-5">
          <ul className="space-y-2.5">
            {alerts.failedDeliveries > 0 && (
              <li className="flex items-center gap-2.5 text-sm">
                <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />
                <span className="flex-1">{toPersianDigits(alerts.failedDeliveries)} سفارش با تحویل ناموفق</span>
                <Link href="/admin/orders?fulfillmentStatus=FAILED" className="text-xs text-primary hover:underline">
                  مشاهده
                </Link>
              </li>
            )}
            {alerts.deadJobs > 0 && (
              <li className="flex items-center gap-2.5 text-sm">
                <ServerCrash className="size-4 shrink-0 text-danger" aria-hidden />
                <span className="flex-1">{toPersianDigits(alerts.deadJobs)} کار در صف با شکست نهایی</span>
                <Link href="/admin/jobs" className="text-xs text-primary hover:underline">
                  مشاهده
                </Link>
              </li>
            )}
            {alerts.staleExchangeRates.map((r) => (
              <li key={r.currencyCode} className="flex items-center gap-2.5 text-sm">
                <Clock className="size-4 shrink-0 text-warn" aria-hidden />
                <span className="flex-1">
                  نرخ ارز {r.currencyCode} از {timeAgoFa(r.effectiveAt)} به‌روزرسانی نشده
                </span>
                <Link href="/admin/rates" className="text-xs text-primary hover:underline">
                  مشاهده
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Charts row */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Panel title="روند درآمد" description={period.label} className="lg:col-span-2">
          <AreaLineChart title="روند درآمد" data={revenueSeries} unit="تومان" />
        </Panel>
        <Panel title="وضعیت سفارش‌ها" description={period.label}>
          <DonutChart
            title="وضعیت سفارش‌ها"
            data={byStatus.map((s) => ({ label: ORDER_STATUS_LABELS[s.status] ?? s.status, value: s.count }))}
          />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="محصولات برتر" description={period.label}>
          <BarChart title="محصولات برتر" data={topProducts} />
        </Panel>
        <Panel title="دسته‌های برتر" description={period.label}>
          <BarChart title="دسته‌های برتر" data={topCategories} />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="سفارش‌های اخیر"
          actions={
            <Link href="/admin/orders" className="text-xs text-primary hover:underline">
              مشاهده همه
            </Link>
          }
        >
          {recentOrders.length === 0 ? (
            <EmptyState title="سفارشی ثبت نشده است" className="py-6" />
          ) : (
            <ul className="divide-y divide-border-base">
              {recentOrders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/orders/${o.id}`} className="text-sm font-medium text-fg hover:text-primary">
                      {o.orderNumber}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-fg-muted">{customerLabel(o)}</p>
                  </div>
                  {o.isDemo && <DemoBadge />}
                  <StatusPill status={o.status} />
                  <Money value={o.totalToman} className="w-24 shrink-0 text-end text-sm font-medium" />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="تیکت‌های اخیر"
          actions={
            <Link href="/admin/tickets" className="text-xs text-primary hover:underline">
              مشاهده همه
            </Link>
          }
        >
          {recentTickets.length === 0 ? (
            <EmptyState title="تیکتی ثبت نشده است" className="py-6" />
          ) : (
            <ul className="divide-y divide-border-base">
              {recentTickets.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/tickets/${t.id}`} className="text-sm font-medium text-fg hover:text-primary">
                      {t.subject}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-fg-muted">
                      {[t.user.firstName, t.user.lastName].filter(Boolean).join(' ') || 'کاربر'} — {formatJalali(t.lastReplyAt)}
                    </p>
                  </div>
                  <Badge tone={t.priority === 'URGENT' || t.priority === 'HIGH' ? 'danger' : 'neutral'} size="sm">
                    {t.priority === 'URGENT' ? 'فوری' : t.priority === 'HIGH' ? 'بالا' : t.priority === 'LOW' ? 'کم' : 'عادی'}
                  </Badge>
                  <StatusPill status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
