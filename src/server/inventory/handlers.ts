import 'server-only';
import { fulfillOrder } from './fulfillment';
import { releaseReservation, releaseExpiredReservations } from './reservation';
import { inventoryImportJobHandler } from './import';
import { lowStockScanHandler } from './reconcile';

/**
 * Minimal shape the job queue runner (owned by another agent) gives every
 * handler. It is intentionally loose — the runner's actual `JobQueue` row
 * type may carry more fields.
 */
export type JobQueueRow = {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
};

/**
 * Map from `JobQueue.type` to the function that processes it. The queue
 * runner wires this up directly — see docs/INVENTORY.md for the payload
 * shape each job type expects.
 */
export const inventoryJobHandlers = {
  'fulfill-order': async (job: JobQueueRow) => {
    const payload = job.payload as { orderId: string };
    return fulfillOrder(payload.orderId, { attempt: job.attempts });
  },

  'release-reservation': async (job: JobQueueRow) => {
    const payload = (job.payload as { orderId?: string; actorId?: string | null }) ?? {};
    if (payload.orderId) {
      return releaseReservation(payload.orderId, { actorId: payload.actorId ?? null });
    }
    // No orderId in the payload — treat as the bulk expiry sweep.
    return releaseExpiredReservations();
  },

  'inventory-import': async (job: JobQueueRow) => inventoryImportJobHandler(job),

  'low-stock-scan': async () => lowStockScanHandler(),
} as const;

export type InventoryJobType = keyof typeof inventoryJobHandlers;
