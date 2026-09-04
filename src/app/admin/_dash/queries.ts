import 'server-only';

/**
 * Dashboard aggregation queries. Private to `src/app/admin/page.tsx` — not
 * imported anywhere else. Every monetary figure is integer Toman; every
 * count query avoids N+1 by grouping/joining in SQL rather than looping.
 */

import { db } from '@/server/db';
import { getSetting } from '@/server/settings';

export type Period = { from: Date; to: Date };

// ── KPI tiles ────────────────────────────────────────────────────

export type DashboardKpis = {
  revenueToman: number;
  netProfitToman: number;
  costOfGoodsToman: number;
  orderCount: number;
  avgOrderValueToman: number;
  paymentSuccessRate: number | null; // 0..100
  paymentFailRate: number | null;
  newCustomers: number;
  returningCustomerShare: number | null; // 0..100
  pendingManualDeliveries: number;
  ordersUnderReview: number;
  lowStockItems: number;
  inventoryValueToman: number;
  openTickets: number;
  pendingPriceApprovals: number;
};

async function paidOrderAggregate(period: Period) {
  const agg = await db.order.aggregate({
    where: { paidAt: { gte: period.from, lte: period.to } },
    _sum: { totalToman: true, costTotalToman: true },
    _count: { _all: true },
  });
  return {
    revenueToman: agg._sum.totalToman ?? 0,
    costOfGoodsToman: agg._sum.costTotalToman ?? 0,
    paidOrderCount: agg._count._all,
  };
}

async function orderCountInPeriod(period: Period): Promise<number> {
  return db.order.count({ where: { placedAt: { gte: period.from, lte: period.to } } });
}

async function paymentRates(period: Period): Promise<{ successRate: number | null; failRate: number | null }> {
  const rows = await db.payment.groupBy({
    by: ['status'],
    where: { createdAt: { gte: period.from, lte: period.to } },
    _count: { _all: true },
  });
  const total = rows.reduce((s, r) => s + r._count._all, 0);
  if (total === 0) return { successRate: null, failRate: null };
  const paid = rows.find((r) => r.status === 'PAID')?._count._all ?? 0;
  const failed = rows
    .filter((r) => ['FAILED', 'VERIFICATION_FAILED', 'CANCELED', 'EXPIRED'].includes(r.status))
    .reduce((s, r) => s + r._count._all, 0);
  return {
    successRate: Math.round((paid / total) * 1000) / 10,
    failRate: Math.round((failed / total) * 1000) / 10,
  };
}

async function newCustomers(period: Period): Promise<number> {
  return db.user.count({ where: { isStaff: false, createdAt: { gte: period.from, lte: period.to } } });
}

/** Share of customers ordering in the period who have more than one order lifetime. */
async function returningCustomerShare(period: Period): Promise<number | null> {
  const orderers = await db.order.findMany({
    where: { placedAt: { gte: period.from, lte: period.to }, userId: { not: null } },
    select: { userId: true },
    distinct: ['userId'],
  });
  const ids = orderers.map((o) => o.userId!).filter(Boolean);
  if (ids.length === 0) return null;
  const counts = await db.order.groupBy({
    by: ['userId'],
    where: { userId: { in: ids } },
    _count: { _all: true },
  });
  const returning = counts.filter((c) => c._count._all > 1).length;
  return Math.round((returning / ids.length) * 1000) / 10;
}

async function lowStockItems(): Promise<number> {
  const rows = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "product_variants" v
    WHERE v."isActive" = true
      AND (
        SELECT COUNT(*) FROM "inventory_items" i
        WHERE i."variantId" = v.id AND i.status = 'AVAILABLE'
      ) <= v."lowStockThreshold"
  `;
  return Number(rows[0]?.count ?? 0);
}

async function inventoryValue(): Promise<number> {
  const agg = await db.inventoryItem.aggregate({
    where: { status: 'AVAILABLE' },
    _sum: { costToman: true },
  });
  return agg._sum.costToman ?? 0;
}

export async function getDashboardKpis(period: Period): Promise<DashboardKpis> {
  const [
    paidAgg,
    orderCount,
    rates,
    newCust,
    returningShare,
    pendingManual,
    ordersUnderReview,
    lowStock,
    invValue,
    openTickets,
    pendingApprovals,
  ] = await Promise.all([
    paidOrderAggregate(period),
    orderCountInPeriod(period),
    paymentRates(period),
    newCustomers(period),
    returningCustomerShare(period),
    db.order.count({ where: { fulfillmentStatus: 'MANUAL_REVIEW' } }),
    db.order.count({ where: { needsReview: true, status: { notIn: ['CANCELED', 'REFUNDED'] } } }),
    lowStockItems(),
    inventoryValue(),
    db.ticket.count({ where: { status: { in: ['OPEN', 'PENDING_STAFF'] } } }),
    db.priceChangeApproval.count({ where: { status: 'PENDING' } }),
  ]);

  const netProfitToman = paidAgg.revenueToman - paidAgg.costOfGoodsToman;
  const avgOrderValueToman = paidAgg.paidOrderCount > 0 ? Math.round(paidAgg.revenueToman / paidAgg.paidOrderCount) : 0;

  return {
    revenueToman: paidAgg.revenueToman,
    netProfitToman,
    costOfGoodsToman: paidAgg.costOfGoodsToman,
    orderCount,
    avgOrderValueToman,
    paymentSuccessRate: rates.successRate,
    paymentFailRate: rates.failRate,
    newCustomers: newCust,
    returningCustomerShare: returningShare,
    pendingManualDeliveries: pendingManual,
    ordersUnderReview,
    lowStockItems: lowStock,
    inventoryValueToman: invValue,
    openTickets,
    pendingPriceApprovals: pendingApprovals,
  };
}

// ── Orders by status ─────────────────────────────────────────────

export async function getOrdersByStatus(period: Period): Promise<{ status: string; count: number }[]> {
  const rows = await db.order.groupBy({
    by: ['status'],
    where: { placedAt: { gte: period.from, lte: period.to } },
    _count: { _all: true },
  });
  return rows.map((r) => ({ status: r.status, count: r._count._all })).sort((a, b) => b.count - a.count);
}

// ── Revenue over time ────────────────────────────────────────────

export async function getRevenueOverTime(period: Period): Promise<{ label: string; value: number }[]> {
  const days = Math.max(1, Math.round((period.to.getTime() - period.from.getTime()) / 86_400_000) + 1);
  const bucketByHour = days <= 1;

  if (bucketByHour) {
    const rows = await db.$queryRaw<{ bucket: Date; total: bigint }[]>`
      SELECT date_trunc('hour', "paidAt") AS bucket, COALESCE(SUM("totalToman"), 0)::bigint AS total
      FROM "orders"
      WHERE "paidAt" BETWEEN ${period.from} AND ${period.to}
      GROUP BY 1 ORDER BY 1 ASC
    `;
    return rows.map((r) => ({
      label: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Tehran' }).format(r.bucket),
      value: Number(r.total),
    }));
  }

  const rows = await db.$queryRaw<{ bucket: Date; total: bigint }[]>`
    SELECT date_trunc('day', "paidAt") AS bucket, COALESCE(SUM("totalToman"), 0)::bigint AS total
    FROM "orders"
    WHERE "paidAt" BETWEEN ${period.from} AND ${period.to}
    GROUP BY 1 ORDER BY 1 ASC
  `;
  return rows.map((r) => ({
    label: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Tehran' }).format(r.bucket),
    value: Number(r.total),
  }));
}

// ── Top products / categories ────────────────────────────────────

export async function getTopProducts(period: Period, take = 6): Promise<{ label: string; value: number }[]> {
  const rows = await db.$queryRaw<{ name: string; total: bigint }[]>`
    SELECT oi."productNameFa" AS name, COALESCE(SUM(oi."lineTotalToman"), 0)::bigint AS total
    FROM "order_items" oi
    JOIN "orders" o ON o.id = oi."orderId"
    WHERE o."placedAt" BETWEEN ${period.from} AND ${period.to}
    GROUP BY oi."productNameFa"
    ORDER BY total DESC
    LIMIT ${take}
  `;
  return rows.map((r) => ({ label: r.name, value: Number(r.total) }));
}

export async function getTopCategories(period: Period, take = 6): Promise<{ label: string; value: number }[]> {
  const rows = await db.$queryRaw<{ name: string; total: bigint }[]>`
    SELECT c."nameFa" AS name, COALESCE(SUM(oi."lineTotalToman"), 0)::bigint AS total
    FROM "order_items" oi
    JOIN "orders" o ON o.id = oi."orderId"
    JOIN "product_variants" v ON v.id = oi."variantId"
    JOIN "products" p ON p.id = v."productId"
    JOIN "categories" c ON c.id = p."categoryId"
    WHERE o."placedAt" BETWEEN ${period.from} AND ${period.to}
    GROUP BY c."nameFa"
    ORDER BY total DESC
    LIMIT ${take}
  `;
  return rows.map((r) => ({ label: r.name, value: Number(r.total) }));
}

// ── Recent lists ─────────────────────────────────────────────────

export async function getRecentOrders(take = 6) {
  return db.order.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      orderNumber: true,
      totalToman: true,
      status: true,
      paymentStatus: true,
      createdAt: true,
      isDemo: true,
      user: { select: { firstName: true, lastName: true, email: true, phone: true } },
      guestEmail: true,
      guestPhone: true,
    },
  });
}

export async function getRecentTickets(take = 6) {
  return db.ticket.findMany({
    orderBy: { lastReplyAt: 'desc' },
    take,
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      priority: true,
      lastReplyAt: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });
}

// ── Alerts panel ─────────────────────────────────────────────────

export type DashboardAlerts = {
  failedDeliveries: number;
  deadJobs: number;
  staleExchangeRates: { currencyCode: string; effectiveAt: Date }[];
};

export async function getDashboardAlerts(): Promise<DashboardAlerts> {
  const staleHours = await getSetting<number>('pricing.staleHours', 24);
  const staleCutoff = new Date(Date.now() - staleHours * 3600_000);

  const [failedDeliveries, deadJobs, staleRates] = await Promise.all([
    db.order.count({ where: { fulfillmentStatus: 'FAILED' } }),
    db.jobQueue.count({ where: { status: 'DEAD' } }),
    db.exchangeRate.findMany({
      where: { isActive: true, effectiveAt: { lt: staleCutoff } },
      orderBy: { effectiveAt: 'asc' },
      select: { currencyCode: true, effectiveAt: true },
      distinct: ['currencyCode'],
      take: 8,
    }),
  ]);

  return { failedDeliveries, deadJobs, staleExchangeRates: staleRates };
}
