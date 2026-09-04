import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import { db } from '@/server/db';
import { isUniqueConstraintError } from './db-errors';

/** Either the shared client or an in-flight transaction client. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

export type EnqueueResult = { enqueued: boolean; id?: string };

/**
 * Inserts a `JobQueue` row. This module does not run jobs — the queue
 * runner (`src/server/jobs/**`, owned by another agent) polls `JobQueue`
 * and dispatches by `type` to the handlers exported from `handlers.ts`.
 *
 * When an `idempotencyKey` is given and a row with that key already exists,
 * the insert is treated as a no-op success rather than an error — enqueueing
 * "the same job" twice (e.g. two fulfillment attempts racing) must never
 * throw.
 */
export async function enqueueJob(
  client: DbClient,
  type: string,
  payload: Record<string, unknown>,
  opts: { idempotencyKey?: string; runAt?: Date } = {},
): Promise<EnqueueResult> {
  try {
    const row = await client.jobQueue.create({
      data: {
        type,
        payload: payload as Prisma.InputJsonValue,
        idempotencyKey: opts.idempotencyKey ?? null,
        runAt: opts.runAt ?? new Date(),
      },
      select: { id: true },
    });
    return { enqueued: true, id: row.id };
  } catch (err) {
    if (isUniqueConstraintError(err, 'idempotencyKey')) return { enqueued: false };
    throw err;
  }
}

/** Convenience wrapper against the shared client (outside any transaction). */
export function enqueue(
  type: string,
  payload: Record<string, unknown>,
  opts?: { idempotencyKey?: string; runAt?: Date },
): Promise<EnqueueResult> {
  return enqueueJob(db, type, payload, opts);
}
