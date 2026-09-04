import 'server-only';
import { Prisma, JobStatus } from '@prisma/client';
import type { JobQueue } from '@prisma/client';
import { db } from '../db';
import { logger } from '@/lib/logger';

/**
 * Durable, at-least-once job queue over the `JobQueue` table.
 *
 * At-least-once semantics: a job is only marked SUCCEEDED after its handler
 * returns without throwing. If a worker dies mid-job the row stays RUNNING
 * with a `lockedAt` timestamp; `reclaimStuck()` puts it back to QUEUED after
 * a timeout so another worker retries it. Handlers MUST therefore be
 * idempotent (safe to run twice) — use `idempotencyKey` at enqueue time and
 * design handler side effects (payments excepted — that module owns its own
 * idempotency) to tolerate a repeat run.
 */

const RECLAIM_STUCK_AFTER_MS = 10 * 60 * 1000; // 10 minutes
const MAX_BACKOFF_SEC = 3600; // 1 hour

export interface EnqueueOptions {
  runAt?: Date;
  maxAttempts?: number;
  idempotencyKey?: string;
}

/**
 * Enqueues a job. When `idempotencyKey` is given and a job with that key
 * already exists (in any status), this is a no-op that returns the existing
 * row instead of creating a duplicate.
 */
export async function enqueue(
  type: string,
  payload: unknown,
  opts: EnqueueOptions = {},
): Promise<JobQueue> {
  if (opts.idempotencyKey) {
    const existing = await db.jobQueue.findUnique({
      where: { idempotencyKey: opts.idempotencyKey },
    });
    if (existing) {
      logger.debug('jobs: enqueue no-op (idempotency key exists)', {
        type,
        idempotencyKey: opts.idempotencyKey,
        jobId: existing.id,
      });
      return existing;
    }
  }

  const job = await db.jobQueue.create({
    data: {
      type,
      payload: payload as Prisma.InputJsonValue,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 5,
      idempotencyKey: opts.idempotencyKey ?? null,
    },
  });

  logger.info('jobs: enqueued', { jobId: job.id, type, runAt: job.runAt });
  return job;
}

/**
 * Atomically claims the single next QUEUED job whose `runAt` has arrived,
 * marking it RUNNING and locking it to `workerId`.
 *
 * Uses one `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)` so
 * concurrent workers can call this in parallel and never receive the same
 * job — a naive `findFirst` followed by `update` has a race window between
 * the read and the write that lets two workers grab the same row.
 */
export async function claimNext(workerId: string): Promise<JobQueue | null> {
  const rows = await db.$queryRaw<JobQueue[]>`
    UPDATE "public"."job_queue"
    SET "status" = 'RUNNING'::"public"."JobStatus",
        "lockedAt" = now(),
        "lockedBy" = ${workerId},
        "updatedAt" = now()
    WHERE "id" = (
      SELECT "id"
      FROM "public"."job_queue"
      WHERE "status" = 'QUEUED'::"public"."JobStatus"
        AND "runAt" <= now()
      ORDER BY "runAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `;
  return rows[0] ?? null;
}

/** Marks a job as done. */
export async function complete(jobId: string): Promise<void> {
  await db.jobQueue.update({
    where: { id: jobId },
    data: {
      status: JobStatus.SUCCEEDED,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

/**
 * Records a failed attempt. Reschedules with exponential backoff
 * (`min(2^attempts, 3600)` seconds) while `attempts < maxAttempts`; moves the
 * job to DEAD once attempts are exhausted.
 */
export async function fail(jobId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const job = await db.jobQueue.findUnique({ where: { id: jobId } });
  if (!job) return;

  const attempts = job.attempts + 1;
  const dead = attempts >= job.maxAttempts;
  const backoffSec = Math.min(Math.pow(2, attempts), MAX_BACKOFF_SEC);

  await db.jobQueue.update({
    where: { id: jobId },
    data: {
      status: dead ? JobStatus.DEAD : JobStatus.QUEUED,
      attempts,
      lastError: message.slice(0, 2000),
      lockedAt: null,
      lockedBy: null,
      runAt: dead ? job.runAt : new Date(Date.now() + backoffSec * 1000),
    },
  });

  if (dead) {
    logger.error('jobs: moved to DEAD after exhausting attempts', {
      jobId,
      type: job.type,
      attempts,
      maxAttempts: job.maxAttempts,
      error: message,
    });
  } else {
    logger.warn('jobs: attempt failed, will retry with backoff', {
      jobId,
      type: job.type,
      attempts,
      maxAttempts: job.maxAttempts,
      backoffSec,
      error: message,
    });
  }
}

/**
 * Jobs stuck RUNNING (worker crashed / was killed before it could complete
 * or fail the job) longer than the stuck threshold go back to QUEUED so
 * another worker retries them. Call on worker boot and periodically.
 */
export async function reclaimStuck(): Promise<number> {
  const cutoff = new Date(Date.now() - RECLAIM_STUCK_AFTER_MS);
  const res = await db.jobQueue.updateMany({
    where: { status: JobStatus.RUNNING, lockedAt: { lt: cutoff } },
    data: { status: JobStatus.QUEUED, lockedAt: null, lockedBy: null },
  });
  if (res.count > 0) {
    logger.warn('jobs: reclaimed stuck jobs', { count: res.count });
  }
  return res.count;
}

export interface QueueStats {
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  dead: number;
  oldestQueuedAt: Date | null;
}

/** Aggregate counts by status for the admin dashboard. */
export async function queueStats(): Promise<QueueStats> {
  const [grouped, oldestQueued] = await Promise.all([
    db.jobQueue.groupBy({ by: ['status'], _count: { _all: true } }),
    db.jobQueue.findFirst({
      where: { status: JobStatus.QUEUED },
      orderBy: { runAt: 'asc' },
      select: { runAt: true },
    }),
  ]);

  const counts: Record<JobStatus, number> = {
    QUEUED: 0,
    RUNNING: 0,
    SUCCEEDED: 0,
    FAILED: 0,
    DEAD: 0,
  };
  for (const g of grouped) counts[g.status] = g._count._all;

  return {
    queued: counts.QUEUED,
    running: counts.RUNNING,
    succeeded: counts.SUCCEEDED,
    failed: counts.FAILED,
    dead: counts.DEAD,
    oldestQueuedAt: oldestQueued?.runAt ?? null,
  };
}
