import 'server-only';
import { fulfillOrder } from './fulfillment';
import { releaseReservation, releaseExpiredReservations } from './reservation';
import { inventoryImportJobHandler } from './import';
import { lowStockScanHandler } from './reconcile';

/**
 * Job handlers, keyed by `JobQueue.type`. Wired up by
 * `src/server/jobs/registry.ts` (owned by the jobs agent), which imports
 * this module dynamically and looks up a same-named export for each of
 * `'fulfill-order' | 'release-reservation' | 'inventory-import' |
 * 'low-stock-scan'` — hence the string-literal export names below (valid
 * ES2022 "arbitrary module namespace identifiers", matching this repo's
 * `tsconfig.json` target).
 *
 * The worker calls a handler as `handler(job.payload)` — payload only, no
 * wrapping job row — and treats a thrown error as "job failed, retry with
 * backoff" (`src/server/jobs/queue.ts`'s `fail()`), so every handler below
 * simply awaits its real work and lets exceptions propagate.
 *
 * Payload shapes:
 *   fulfill-order        { orderId: string }
 *   release-reservation  { orderId: string; actorId?: string | null }
 *                         (payload with no orderId → bulk expiry sweep)
 *   inventory-import     see `InventoryImportJobPayload` in ./import.ts
 *   low-stock-scan       (no payload)
 */

async function fulfillOrderHandler(payload: unknown): Promise<void> {
  const { orderId } = payload as { orderId: string };
  await fulfillOrder(orderId);
}

async function releaseReservationHandler(payload: unknown): Promise<void> {
  const p = (payload as { orderId?: string; actorId?: string | null } | null) ?? {};
  if (p.orderId) {
    await releaseReservation(p.orderId, { actorId: p.actorId ?? null });
    return;
  }
  await releaseExpiredReservations();
}

async function inventoryImportHandler(payload: unknown): Promise<void> {
  await inventoryImportJobHandler({ payload });
}

async function lowStockScanJobHandler(): Promise<void> {
  await lowStockScanHandler();
}

export {
  fulfillOrderHandler as 'fulfill-order',
  releaseReservationHandler as 'release-reservation',
  inventoryImportHandler as 'inventory-import',
  lowStockScanJobHandler as 'low-stock-scan',
};

/** Same handlers, keyed by job type — convenient for direct/test invocation. */
export const inventoryJobHandlers = {
  'fulfill-order': fulfillOrderHandler,
  'release-reservation': releaseReservationHandler,
  'inventory-import': inventoryImportHandler,
  'low-stock-scan': lowStockScanJobHandler,
} as const;

export type InventoryJobType = keyof typeof inventoryJobHandlers;
