import 'server-only';
import { db } from '../db';
import { logger } from '@/lib/logger';
import { enqueue } from './queue';

/**
 * Recurring background work, expressed as an allow-listed set of named
 * tasks. Both the long-running worker (`scripts/worker.ts`, on a timer) and
 * the token-protected cron endpoint (`/api/cron/[task]`, for a platform
 * scheduler that pings an HTTP endpoint instead of running a standing
 * process) call `runCronTask` with one of these names — so the two
 * operating modes share one implementation and can't drift apart.
 *
 * Task bodies mostly `enqueue()` a JobQueue row rather than doing the work
 * inline, so the work is durable, retried on failure, and visible in
 * `queueStats()` regardless of which trigger fired it. `idempotencyKey` is
 * bucketed by the task's own period, so firing the same task twice within
 * one window (e.g. the worker's timer AND an external cron hitting the same
 * task) enqueues at most one job.
 */

export const CRON_TASKS = [
  'release-reservations',
  'expire-payments',
  'prune',
  'low-stock-scan',
  'reconcile-stock',
] as const;

export type CronTask = (typeof CRON_TASKS)[number];

export function isCronTask(value: string): value is CronTask {
  return (CRON_TASKS as readonly string[]).includes(value);
}

function bucketKey(prefix: string, windowMs: number): string {
  const bucket = Math.floor(Date.now() / windowMs);
  return `scheduled:${prefix}:${bucket}`;
}

/**
 * Finds orders whose reservation window has lapsed while still awaiting
 * payment, and enqueues one `release-reservation` job per order (handled by
 * the inventory agent's module) — reusing the same idempotency key
 * `expire-payments` uses for the same purpose, so both paths converge on a
 * single job per order regardless of which one notices first.
 */
export async function sweepExpiredReservations(): Promise<number> {
  const now = new Date();
  const orders = await db.order.findMany({
    where: {
      status: { in: ['PENDING', 'AWAITING_PAYMENT'] },
      reservationExpiresAt: { lt: now },
    },
    select: { id: true },
    take: 500,
  });

  for (const order of orders) {
    await enqueue(
      'release-reservation',
      { orderId: order.id },
      { idempotencyKey: `release-reservation:${order.id}` },
    );
  }

  if (orders.length > 0) {
    logger.info('scheduler: enqueued release-reservation for expired orders', {
      count: orders.length,
    });
  }
  return orders.length;
}

export interface CronTaskResult {
  task: CronTask;
  enqueued: number;
}

export async function runCronTask(task: CronTask): Promise<CronTaskResult> {
  switch (task) {
    case 'release-reservations': {
      const count = await sweepExpiredReservations();
      return { task, enqueued: count };
    }
    case 'expire-payments':
      await enqueue('expire-payments', {}, { idempotencyKey: bucketKey('expire-payments', 5 * 60_000) });
      return { task, enqueued: 1 };
    case 'prune':
      await enqueue('cleanup', {}, { idempotencyKey: bucketKey('cleanup', 60 * 60_000) });
      return { task, enqueued: 1 };
    case 'low-stock-scan':
      await enqueue('low-stock-scan', {}, { idempotencyKey: bucketKey('low-stock-scan', 30 * 60_000) });
      return { task, enqueued: 1 };
    case 'reconcile-stock':
      await enqueue(
        'reconcile-stock',
        {},
        { idempotencyKey: bucketKey('reconcile-stock', 24 * 60 * 60_000) },
      );
      return { task, enqueued: 1 };
    default: {
      const _exhaustive: never = task;
      throw new Error(`unknown cron task: ${_exhaustive}`);
    }
  }
}

/** Interval, in ms, for the worker's own in-process scheduler ticks. */
export const SCHEDULE: Array<{ task: CronTask; intervalMs: number }> = [
  { task: 'release-reservations', intervalMs: 60_000 },
  { task: 'expire-payments', intervalMs: 5 * 60_000 },
  { task: 'prune', intervalMs: 60 * 60_000 },
  { task: 'low-stock-scan', intervalMs: 30 * 60_000 },
  { task: 'reconcile-stock', intervalMs: 24 * 60 * 60_000 },
];
