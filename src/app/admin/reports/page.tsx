import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader, Panel, Money, StatCard } from '@/components/admin/kit';
import { AreaLineChart } from '@/components/admin/charts/area-line-chart';
import { BarChart } from '@/components/admin/charts/bar-chart';
import { toPersianDigits, formatJalali } from '@/lib/persian';
import { formatToman } from '@/lib/money';
import { resolvePeriod, previousPeriod, percentDelta, type SearchParams } from '@/lib/admin-query';
import { PeriodPicker } from '../_dash/period-picker';
import { getRevenueOverTime, getTopProducts, getTopCategories, getDashboardKpis } from '../_dash/queries';

export const metadata = { title: 'گزارش‌ها' };

async function loadGatewayBreakdown(from: Date, to: Date) {
  const rows = await db.payment.groupBy({
    by: ['gateway', 'status'],
    where: { createdAt: { gte: from, lte: to } },
    _count: { _all: true },
    _sum: { amountToman: true },
  });
  const byGateway = new Map<string, { attempts: number; paid: number; amountPaid: number }>();
  for (const r of rows) {
    const cur = byGateway.get(r.gateway) ?? { attempts: 0, paid: 0, amountPaid: 0 };
    cur.attempts += r._count._all;
    if (r.status === 'PAID') {
      cur.paid += r._count._all;
      cur.amountPaid += r._sum.amountToman ?? 0;
    }
    byGateway.set(r.gateway, cur);
  }
  return Array.from(byGateway.entries()).map(([gateway, v]) => ({ gateway, ...v }));
}

async function loadTopCustomers(from: Date, to: Date) {
  const agg = await db.order.groupBy({
    by: ['userId'],
    where: { placedAt: { gte: from, lte: to }, paymentStatus: 'PAID', userId: { not: null } },
    _sum: { totalToman: true },
    _count: { _all: true },
    orderBy: { _sum: { totalToman: 'desc' } },
    take: 8,
  });
  const users = await db.user.findMany({ where: { id: { in: agg.map((a) => a.userId!) } }, select: { id: true, firstName: true, lastName: true, email: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return agg.map((a) => {
    const u = byId.get(a.userId!);
    return { name: u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'کاربر' : 'کاربر', spend: a._sum.totalToman ?? 0, orders: a._count._all };
  });
}

const GATEWAY_LABEL: Record<string, string> = { zarinpal: 'زرین‌پال', wallet: 'کیف پول', manual: 'واریز دستی' };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission('report.view');
  const sp = await searchParams;
  const presetRaw = sp.period;
  const preset = Array.isArray(presetRaw) ? presetRaw[0] : presetRaw ?? '30d';
  const fromRaw = sp.from;
  const toRaw = sp.to;
  const customFrom = Array.isArray(fromRaw) ? fromRaw[0] : fromRaw;
  const customTo = Array.isArray(toRaw) ? toRaw[0] : toRaw;
  const period = resolvePeriod(preset, customFrom, customTo);
  const prev = previousPeriod(period.from, period.to);

  const [kpis, prevKpis, revenue, topProducts, topCategories, gateways, topCustomers] = await Promise.all([
    getDashboardKpis(period),
    getDashboardKpis(prev),
    getRevenueOverTime(period),
    getTopProducts(period, 12),
    getTopCategories(period, 12),
    loadGatewayBreakdown(period.from, period.to),
    loadTopCustomers(period.from, period.to),
  ]);

  const qs = new URLSearchParams({ period: preset });
  if (customFrom) qs.set('from', customFrom);
  if (customTo) qs.set('to', customTo);

  return (
    <div>
      <PageHeader
        title="گزارش‌ها"
        description={`گزارش عملکرد فروش — ${period.label}`}
        actions={
          <>
            <PeriodPicker />
            <a
              href={`/api/admin/reports/export?${qs.toString()}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-base bg-surface-muted px-3 text-xs font-medium text-fg hover:bg-border-base"
            >
              خروجی CSV روند فروش
            </a>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="درآمد" value={formatToman(kpis.revenueToman)} delta={percentDelta(kpis.revenueToman, prevKpis.revenueToman)} />
        <StatCard label="سود خالص" value={formatToman(kpis.netProfitToman)} delta={percentDelta(kpis.netProfitToman, prevKpis.netProfitToman)} />
        <StatCard label="تعداد سفارش" value={toPersianDigits(kpis.orderCount)} delta={percentDelta(kpis.orderCount, prevKpis.orderCount)} />
        <StatCard label="میانگین ارزش سفارش" value={formatToman(kpis.avgOrderValueToman)} delta={percentDelta(kpis.avgOrderValueToman, prevKpis.avgOrderValueToman)} />
      </div>

      <Panel title="روند فروش" className="mt-4">
        <AreaLineChart title="روند فروش" data={revenue} unit="تومان" />
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="محصولات برتر (بر اساس درآمد)">
          <BarChart title="محصولات برتر" data={topProducts} maxBars={12} />
        </Panel>
        <Panel title="دسته‌های برتر (بر اساس درآمد)">
          <BarChart title="دسته‌های برتر" data={topCategories} maxBars={12} />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="عملکرد درگاه‌های پرداخت">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-base text-xs text-fg-muted">
                  <th className="p-2 text-start font-medium">درگاه</th>
                  <th className="p-2 text-center font-medium">تلاش‌ها</th>
                  <th className="p-2 text-center font-medium">موفق</th>
                  <th className="p-2 text-end font-medium">مبلغ موفق</th>
                </tr>
              </thead>
              <tbody>
                {gateways.map((g) => (
                  <tr key={g.gateway} className="border-b border-border-base last:border-0">
                    <td className="p-2">{GATEWAY_LABEL[g.gateway] ?? g.gateway}</td>
                    <td className="p-2 text-center tnum">{toPersianDigits(g.attempts)}</td>
                    <td className="p-2 text-center tnum">{toPersianDigits(g.paid)}</td>
                    <td className="p-2 text-end"><Money value={g.amountPaid} /></td>
                  </tr>
                ))}
                {gateways.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-fg-muted">داده‌ای نیست.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="مشتریان برتر (بر اساس خرید)">
          <ul className="space-y-2">
            {topCustomers.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="tnum text-xs text-fg-muted">{toPersianDigits(c.orders)} سفارش</span>
                <Money value={c.spend} className="text-sm font-medium" />
              </li>
            ))}
            {topCustomers.length === 0 && <p className="text-sm text-fg-muted">داده‌ای نیست.</p>}
          </ul>
        </Panel>
      </div>

      <p className="mt-4 text-xs text-fg-faint">بازه گزارش: {formatJalali(period.from)} تا {formatJalali(period.to)}</p>
    </div>
  );
}
