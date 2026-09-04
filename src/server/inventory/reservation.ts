import 'server-only';
import { db } from '@/server/db';
import { logger } from '@/lib/logger';

/**
 * Inventory reservation.
 *
 * TRUST BOUNDARY: `reserveForOrder` and `releaseReservation` are internal
 * system entry points, not directly exposed to arbitrary user input. They
 * are called from the checkout flow (after the caller has already
 * established the order belongs to the current customer/session) and from
 * the job queue. They do not call `assertPermission` themselves.
 *
 * ── Concurrency strategy ────────────────────────────────────────────────
 * The task description offers two options: full `Serializable` isolation,
 * or a guarded conditional update whose affected-row count is verified.
 * We use the second, implemented as:
 *
 *   1. `SELECT id FROM inventory_items WHERE variantId = $1 AND
 *      status = 'AVAILABLE' ORDER BY createdAt LIMIT $qty FOR UPDATE SKIP
 *      LOCKED` — takes row-level locks on up to `qty` candidate rows,
 *      skipping any row a concurrent transaction already has locked
 *      instead of blocking on it.
 *   2. `UPDATE ... WHERE id IN (...) AND status = 'AVAILABLE'` — the
 *      guarded update — and we verify `count === qty` before trusting it.
 *
 * Why this over `Serializable`: two transactions racing for the same last
 * unit under `SELECT ... FOR UPDATE SKIP LOCKED` never block each other and
 * never abort with a serialization failure that the caller would have to
 * retry — the loser simply sees fewer than `qty` candidates and reports an
 * honest, immediate shortage. `Serializable` would also solve the race, but
 * at the cost of occasional retry-worthy `40001` errors under contention
 * and a full-table conflict-detection scan; the row-lock approach is the
 * standard, lower-latency pattern for "reserve N of a limited pool" and
 * needs no client-side retry loop for the concurrent-shortage case (a
 * client the pool ran out on truly is out of stock, not merely unlucky).
 * The `updateMany` count check is a second, cheap assertion on top of the
 * lock — belt-and-braces in case the row set changed underneath us, which
 * should be unreachable but must never be silently trusted.
 */

export type ReserveLine = { variantId: string; qty: number };

export type ReserveResult =
  | { ok: true; reserved: { variantId: string; itemIds: string[] }[] }
  | { ok: false; shortages: { variantId: string; requested: number; available: number }[] };

const DEFAULT_RESERVE_MINUTES = 15;

/** Thrown internally to force a transaction rollback when a line falls short. */
class ShortageSignal extends Error {
  constructor(public readonly shortages: { variantId: string; requested: number; available: number }[]) {
    super('inventory shortage');
  }
}

/** Thrown when the guarded update's affected-row count disagrees with the lock — should be unreachable. */
class ReservationRaceError extends Error {
  constructor(variantId: string) {
    super(`reservation race detected for variant ${variantId}`);
  }
}

export async function reserveForOrder(params: {
  orderId: string;
  lines: ReserveLine[];
  minutes?: number;
}): Promise<ReserveResult> {
  const minutes = params.minutes ?? DEFAULT_RESERVE_MINUTES;
  const reservedUntil = new Date(Date.now() + minutes * 60_000);
  const lines = params.lines.filter((l) => l.qty > 0);

  try {
    return await db.$transaction(
      async (tx) => {
        const reserved: { variantId: string; itemIds: string[] }[] = [];
        const shortages: { variantId: string; requested: number; available: number }[] = [];

        for (const line of lines) {
          const candidates = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM inventory_items
            WHERE "variantId" = ${line.variantId}
              AND status = 'AVAILABLE'::"InventoryStatus"
              AND ("expiresAt" IS NULL OR "expiresAt" > now())
            ORDER BY "createdAt" ASC
            LIMIT ${line.qty}
            FOR UPDATE SKIP LOCKED
          `;

          if (candidates.length < line.qty) {
            // Keep evaluating remaining lines so the caller gets a complete
            // shortage report in one round trip; the whole transaction is
            // rolled back below regardless (via ShortageSignal), so any
            // rows locked/reserved for other lines in this pass are freed.
            shortages.push({ variantId: line.variantId, requested: line.qty, available: candidates.length });
            continue;
          }

          const ids = candidates.map((c) => c.id);
          const updateRes = await tx.inventoryItem.updateMany({
            where: { id: { in: ids }, status: 'AVAILABLE' },
            data: { status: 'RESERVED', reservedUntil, reservedForOrderId: params.orderId },
          });

          if (updateRes.count !== line.qty) {
            throw new ReservationRaceError(line.variantId);
          }

          reserved.push({ variantId: line.variantId, itemIds: ids });
        }

        if (shortages.length > 0) {
          throw new ShortageSignal(shortages);
        }

        for (const r of reserved) {
          await tx.inventoryAuditLog.createMany({
            data: r.itemIds.map((id) => ({
              itemId: id,
              action: 'RESERVED',
              actorType: 'SYSTEM' as const,
              meta: { orderId: params.orderId, variantId: r.variantId },
            })),
          });
        }

        return { ok: true, reserved } as const;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  } catch (err) {
    if (err instanceof ShortageSignal) {
      return { ok: false, shortages: err.shortages };
    }
    throw err;
  }
}

/**
 * Adapter matching the exact optional shape `src/server/orders.ts`'s
 * checkout flow dynamically imports and duck-types
 * (`InventoryReservationModule`) — kept as a thin wrapper around
 * `reserveForOrder` so that module can prefer this race-safe implementation
 * over its own hand-rolled `SKIP LOCKED` fallback, without either module
 * taking a hard compile-time dependency on the other.
 */
export async function reserveInventory(opts: {
  orderId: string;
  lines: { variantId: string; qty: number }[];
  minutes: number;
}): Promise<{ ok: boolean; shortage?: { variantId: string; available: number }[] }> {
  const result = await reserveForOrder(opts);
  if (result.ok) return { ok: true };
  return { ok: false, shortage: result.shortages.map((s) => ({ variantId: s.variantId, available: s.available })) };
}

/** Returns every item reserved for an order back to AVAILABLE. Idempotent. */
export async function releaseReservation(
  orderId: string,
  opts: { actorId?: string | null } = {},
): Promise<number> {
  return db.$transaction(async (tx) => {
    const items = await tx.inventoryItem.findMany({
      where: { reservedForOrderId: orderId, status: 'RESERVED' },
      select: { id: true },
    });
    if (items.length === 0) return 0;

    const res = await tx.inventoryItem.updateMany({
      where: { reservedForOrderId: orderId, status: 'RESERVED' },
      data: { status: 'AVAILABLE', reservedUntil: null, reservedForOrderId: null },
    });

    await tx.inventoryAuditLog.createMany({
      data: items.map((i) => ({
        itemId: i.id,
        action: 'RELEASED',
        actorId: opts.actorId ?? null,
        actorType: opts.actorId ? ('STAFF' as const) : ('SYSTEM' as const),
        meta: { orderId },
      })),
    });

    return res.count;
  });
}

/**
 * Worker entry point: releases every RESERVED item whose `reservedUntil`
 * has passed and whose order is not `PAID`. `Order.reservedForOrderId` has
 * no foreign key to `Order` (it is a plain string), so a reservation whose
 * order id matches no row at all is treated the same as "not paid" and is
 * released — an orphaned/test reservation must not linger forever.
 */
export async function releaseExpiredReservations(): Promise<number> {
  const now = new Date();
  const expired = await db.inventoryItem.findMany({
    where: { status: 'RESERVED', reservedUntil: { lt: now }, reservedForOrderId: { not: null } },
    select: { id: true, reservedForOrderId: true },
  });
  if (expired.length === 0) return 0;

  const orderIds = Array.from(new Set(expired.map((e) => e.reservedForOrderId as string)));
  const orders = await db.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, paymentStatus: true },
  });
  const paidOrderIds = new Set(orders.filter((o) => o.paymentStatus === 'PAID').map((o) => o.id));

  const toRelease = expired.filter((e) => !paidOrderIds.has(e.reservedForOrderId as string));
  if (toRelease.length === 0) return 0;

  const ids = toRelease.map((e) => e.id);
  const res = await db.inventoryItem.updateMany({
    where: { id: { in: ids }, status: 'RESERVED' },
    data: { status: 'AVAILABLE', reservedUntil: null, reservedForOrderId: null },
  });

  await db.inventoryAuditLog.createMany({
    data: toRelease.map((e) => ({
      itemId: e.id,
      action: 'RELEASED',
      actorType: 'SYSTEM' as const,
      meta: { reason: 'expired' },
    })),
  });

  logger.info('released expired reservations', { count: res.count });
  return res.count;
}

export async function availableCount(variantId: string): Promise<number> {
  return db.inventoryItem.count({
    where: {
      variantId,
      status: 'AVAILABLE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
}

/** Single grouped query — no N+1 — for listing pages showing many variants at once. */
export async function availabilityMap(variantIds: string[]): Promise<Record<string, number>> {
  const map: Record<string, number> = Object.fromEntries(variantIds.map((v) => [v, 0]));
  if (variantIds.length === 0) return map;

  const now = new Date();
  const rows = await db.inventoryItem.groupBy({
    by: ['variantId'],
    where: {
      variantId: { in: variantIds },
      status: 'AVAILABLE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    _count: { _all: true },
  });
  for (const r of rows) map[r.variantId] = r._count._all;
  return map;
}
