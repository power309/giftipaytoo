import 'server-only';
import { db } from '@/server/db';
import { audit } from '@/server/audit';
import { assertPermission } from '@/server/auth/guard';
import { enqueueJob } from './jobs';

// ─────────────────────────────────────────────────────────────
// reconcileStock
// ─────────────────────────────────────────────────────────────

export type ReconcileIssueKind =
  | 'reserved-for-closed-order'
  | 'sold-without-delivery'
  | 'delivery-without-item'
  | 'fulfilled-order-incomplete-items'
  | 'duplicate-fingerprint';

export type ReconcileIssue = { kind: ReconcileIssueKind; count: number; sampleIds: string[] };
export type ReconcileReport = {
  issues: ReconcileIssue[];
  fixed: Partial<Record<ReconcileIssueKind, number>>;
  checkedAt: Date;
};

const CLOSED_ORDER_STATUSES = new Set(['CANCELED', 'EXPIRED', 'REFUNDED', 'FAILED']);

/**
 * Finds inconsistencies between InventoryItem/Delivery/Order state. Only
 * the unambiguously-safe class — RESERVED items whose order is closed
 * (canceled/expired/refunded/failed) or no longer exists — is auto-fixed
 * when `fix: true`; everything else is reported for a human to look at,
 * since "create a Delivery for this SOLD item" or "which fingerprint row
 * is the real one" require judgement this function should not make alone.
 */
export async function reconcileStock(opts: { fix?: boolean; actorId?: string } = {}): Promise<ReconcileReport> {
  if (opts.fix) await assertPermission('inventory.update');

  const issues: ReconcileIssue[] = [];
  const fixed: Partial<Record<ReconcileIssueKind, number>> = {};

  // 1) RESERVED items whose order is closed or missing.
  const reservedItems = await db.inventoryItem.findMany({
    where: { status: 'RESERVED', reservedForOrderId: { not: null } },
    select: { id: true, reservedForOrderId: true },
  });
  const orderIds = Array.from(new Set(reservedItems.map((i) => i.reservedForOrderId as string)));
  const orders = orderIds.length
    ? await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, status: true } })
    : [];
  const orderStatusById = new Map(orders.map((o) => [o.id, o.status]));
  const staleReserved = reservedItems.filter((i) => {
    const status = orderStatusById.get(i.reservedForOrderId as string);
    return !status || CLOSED_ORDER_STATUSES.has(status);
  });
  if (staleReserved.length > 0) {
    issues.push({ kind: 'reserved-for-closed-order', count: staleReserved.length, sampleIds: staleReserved.slice(0, 10).map((i) => i.id) });
    if (opts.fix) {
      const ids = staleReserved.map((i) => i.id);
      const res = await db.inventoryItem.updateMany({
        where: { id: { in: ids }, status: 'RESERVED' },
        data: { status: 'AVAILABLE', reservedUntil: null, reservedForOrderId: null },
      });
      await db.inventoryAuditLog.createMany({
        data: ids.map((id) => ({ itemId: id, action: 'RELEASED', actorId: opts.actorId ?? null, actorType: 'SYSTEM' as const, meta: { reason: 'reconcile:closed-order' } })),
      });
      fixed['reserved-for-closed-order'] = res.count;
    }
  }

  // 2) SOLD items with no Delivery row at all.
  const soldNoDelivery = await db.inventoryItem.findMany({
    where: { status: 'SOLD', deliveries: { none: {} } },
    select: { id: true },
  });
  if (soldNoDelivery.length > 0) {
    issues.push({ kind: 'sold-without-delivery', count: soldNoDelivery.length, sampleIds: soldNoDelivery.slice(0, 10).map((i) => i.id) });
  }

  // 3) Deliveries pointing at no InventoryItem.
  const orphanDeliveries = await db.delivery.findMany({ where: { inventoryItemId: null }, select: { id: true } });
  if (orphanDeliveries.length > 0) {
    issues.push({ kind: 'delivery-without-item', count: orphanDeliveries.length, sampleIds: orphanDeliveries.slice(0, 10).map((d) => d.id) });
  }

  // 4) Orders marked FULFILLED whose items are not all actually fulfilled.
  const fulfilledOrders = await db.order.findMany({
    where: { fulfillmentStatus: 'FULFILLED' },
    select: { id: true, items: { select: { qty: true, fulfilledQty: true } } },
  });
  const badFulfilled = fulfilledOrders.filter((o) => o.items.some((i) => i.fulfilledQty < i.qty));
  if (badFulfilled.length > 0) {
    issues.push({ kind: 'fulfilled-order-incomplete-items', count: badFulfilled.length, sampleIds: badFulfilled.slice(0, 10).map((o) => o.id) });
  }

  // 5) Duplicate fingerprints — should be impossible given the unique
  // constraint, checked defensively (e.g. a restored backup, a manual
  // migration mistake).
  const dupFingerprints = await db.inventoryItem.groupBy({
    by: ['codeFingerprint'],
    _count: { _all: true },
    having: { codeFingerprint: { _count: { gt: 1 } } },
  });
  if (dupFingerprints.length > 0) {
    issues.push({ kind: 'duplicate-fingerprint', count: dupFingerprints.length, sampleIds: [] });
  }

  const report: ReconcileReport = { issues, fixed, checkedAt: new Date() };

  await audit({
    action: 'inventory.reconcile',
    entity: 'InventoryItem',
    actorId: opts.actorId ?? null,
    actorType: opts.actorId ? 'STAFF' : 'SYSTEM',
    summary: `بازبینی موجودی: ${issues.length} نوع مشکل یافت شد${opts.fix ? '، موارد قابل رفع اصلاح شدند' : ''}`,
    after: { issues: issues.map((i) => ({ kind: i.kind, count: i.count })), fixed },
  });

  return report;
}

// ─────────────────────────────────────────────────────────────
// lowStockReport
// ─────────────────────────────────────────────────────────────

export type LowStockRow = { variantId: string; nameFa: string; available: number; threshold: number };

export async function lowStockReport(): Promise<LowStockRow[]> {
  const variants = await db.productVariant.findMany({
    where: { isActive: true },
    select: { id: true, nameFa: true, lowStockThreshold: true },
  });
  if (variants.length === 0) return [];

  const now = new Date();
  const counts = await db.inventoryItem.groupBy({
    by: ['variantId'],
    where: {
      variantId: { in: variants.map((v) => v.id) },
      status: 'AVAILABLE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    _count: { _all: true },
  });
  const countByVariant = new Map(counts.map((c) => [c.variantId, c._count._all]));

  return variants
    .map((v) => ({ variantId: v.id, nameFa: v.nameFa, available: countByVariant.get(v.id) ?? 0, threshold: v.lowStockThreshold }))
    .filter((v) => v.available <= v.threshold);
}

const LOW_STOCK_NOTIFY_THROTTLE_MS = 24 * 3600_000;

/** Handler for the `low-stock-scan` job. Throttles repeat notifications per variant via `StockAlert.lastNotifiedAt`. */
export async function lowStockScanHandler(): Promise<{ scanned: number; alerted: number }> {
  const report = await lowStockReport();
  let alerted = 0;

  for (const row of report) {
    const alert = await db.stockAlert.upsert({
      where: { variantId: row.variantId },
      create: { variantId: row.variantId, threshold: row.threshold, isActive: true },
      update: { threshold: row.threshold },
    });
    if (!alert.isActive) continue;
    if (alert.lastNotifiedAt && Date.now() - alert.lastNotifiedAt.getTime() < LOW_STOCK_NOTIFY_THROTTLE_MS) continue;

    await enqueueJob(
      db,
      'notify',
      { template: 'low-stock', variantId: row.variantId, available: row.available, threshold: row.threshold },
      { idempotencyKey: `notify:low-stock:${row.variantId}:${new Date().toISOString().slice(0, 10)}` },
    );
    await db.stockAlert.update({ where: { id: alert.id }, data: { lastNotifiedAt: new Date() } });
    alerted++;
  }

  return { scanned: report.length, alerted };
}

// ─────────────────────────────────────────────────────────────
// inventoryValuation
// ─────────────────────────────────────────────────────────────

export type ValuationRow = { id: string; nameFa: string; valueToman: number; itemCount: number };
export type ValuationReport = {
  totalValueToman: number;
  byVariant: ValuationRow[];
  byBrand: ValuationRow[];
  byCategory: ValuationRow[];
};

/** Total cost value (integer Toman) of AVAILABLE + RESERVED stock, grouped three ways. */
export async function inventoryValuation(): Promise<ValuationReport> {
  const items = await db.inventoryItem.findMany({
    where: { status: { in: ['AVAILABLE', 'RESERVED'] } },
    select: {
      costToman: true,
      variantId: true,
      variant: {
        select: {
          nameFa: true,
          product: {
            select: {
              nameFa: true,
              brandId: true,
              categoryId: true,
              brand: { select: { nameFa: true } },
              category: { select: { nameFa: true } },
            },
          },
        },
      },
    },
  });

  const byVariant = new Map<string, ValuationRow>();
  const byBrand = new Map<string, ValuationRow>();
  const byCategory = new Map<string, ValuationRow>();
  let totalValueToman = 0;

  const bump = (map: Map<string, ValuationRow>, id: string, nameFa: string, cost: number) => {
    const row = map.get(id) ?? { id, nameFa, valueToman: 0, itemCount: 0 };
    row.valueToman += cost;
    row.itemCount += 1;
    map.set(id, row);
  };

  for (const item of items) {
    const cost = item.costToman ?? 0;
    totalValueToman += cost;
    bump(byVariant, item.variantId, item.variant.nameFa, cost);
    bump(byBrand, item.variant.product.brandId, item.variant.product.brand.nameFa, cost);
    bump(byCategory, item.variant.product.categoryId, item.variant.product.category.nameFa, cost);
  }

  return {
    totalValueToman,
    byVariant: Array.from(byVariant.values()),
    byBrand: Array.from(byBrand.values()),
    byCategory: Array.from(byCategory.values()),
  };
}
