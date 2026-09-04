import { describe, it, expect, afterAll } from 'vitest';
import { db } from '@/server/db';
import { enqueue, claimNext, complete, fail, reclaimStuck, queueStats } from '@/server/jobs/queue';

/**
 * Integration tests against the real local Postgres (see .env DATABASE_URL).
 * Every fixture — job `type` and `idempotencyKey` — is prefixed `TEST-` and
 * removed in `afterAll`, regardless of pass/fail.
 */

const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const TYPE_PREFIX = `TEST-jobs-${RUN_ID}`;

afterAll(async () => {
  await db.jobQueue.deleteMany({ where: { type: { startsWith: TYPE_PREFIX } } });
});

describe('enqueue — idempotency', () => {
  it('a repeated idempotencyKey is a no-op that returns the existing job', async () => {
    const idempotencyKey = `${TYPE_PREFIX}-idem`;
    const first = await enqueue(`${TYPE_PREFIX}-idem-type`, { n: 1 }, { idempotencyKey });
    const second = await enqueue(`${TYPE_PREFIX}-idem-type`, { n: 2 }, { idempotencyKey });

    expect(second.id).toBe(first.id);
    // The second call's payload must NOT have overwritten the first's.
    expect((first.payload as { n: number }).n).toBe(1);

    const rows = await db.jobQueue.findMany({ where: { idempotencyKey } });
    expect(rows).toHaveLength(1);
  });

  it('different idempotencyKeys create distinct jobs', async () => {
    const a = await enqueue(`${TYPE_PREFIX}-distinct`, {}, { idempotencyKey: `${TYPE_PREFIX}-distinct-a` });
    const b = await enqueue(`${TYPE_PREFIX}-distinct`, {}, { idempotencyKey: `${TYPE_PREFIX}-distinct-b` });
    expect(a.id).not.toBe(b.id);
  });
});

describe('claimNext — atomic claiming under concurrency', () => {
  it('never lets two concurrent claimNext calls return the same job', async () => {
    const N = 25;
    const type = `${TYPE_PREFIX}-concurrent`;

    const created = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        enqueue(type, { i }, { idempotencyKey: `${TYPE_PREFIX}-concurrent-${i}` }),
      ),
    );
    const createdIds = new Set(created.map((j) => j.id));

    // More claimers than jobs, firing at once — this is exactly the scenario
    // a naive findFirst()+update() race would let double-process a job under.
    const claims = await Promise.all(
      Array.from({ length: N + 15 }, (_, i) => claimNext(`${TYPE_PREFIX}-worker-${i}`)),
    );

    const claimedOurs = claims.filter(
      (j): j is NonNullable<typeof j> => !!j && createdIds.has(j.id),
    );
    const claimedIds = claimedOurs.map((j) => j.id);

    // No job claimed twice.
    expect(new Set(claimedIds).size).toBe(claimedIds.length);
    // Every job we created was claimed exactly once (none left behind, none doubled).
    expect(new Set(claimedIds).size).toBe(N);
    for (const job of claimedOurs) {
      expect(job.status).toBe('RUNNING');
      expect(job.lockedBy).toBeTruthy();
    }
  });

  it('returns null when there is nothing left to claim of a given fixture batch', async () => {
    const type = `${TYPE_PREFIX}-single`;
    const job = await enqueue(type, {}, { idempotencyKey: `${TYPE_PREFIX}-single-1` });
    const claimed = await claimNext(`${TYPE_PREFIX}-single-worker-a`);
    expect(claimed?.id).toBe(job.id);
    await complete(claimed!.id);

    // The row is now SUCCEEDED, not QUEUED — a second claim must not pick it
    // back up. (Other suites' fixtures may still produce a non-null result
    // here, so only assert this specific job is never returned again.)
    const second = await claimNext(`${TYPE_PREFIX}-single-worker-b`);
    expect(second?.id).not.toBe(job.id);
  });
});

describe('complete / fail — status transitions', () => {
  it('complete() marks the job SUCCEEDED and releases the lock', async () => {
    const job = await enqueue(
      `${TYPE_PREFIX}-ok`,
      {},
      { idempotencyKey: `${TYPE_PREFIX}-ok-1` },
    );
    const claimed = await claimNext(`${TYPE_PREFIX}-ok-worker`);
    expect(claimed?.id).toBe(job.id);

    await complete(claimed!.id);

    const row = await db.jobQueue.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe('SUCCEEDED');
    expect(row.lockedAt).toBeNull();
    expect(row.lockedBy).toBeNull();
  });

  it('fail() reschedules with exponential backoff while attempts remain', async () => {
    const job = await enqueue(
      `${TYPE_PREFIX}-backoff`,
      {},
      { idempotencyKey: `${TYPE_PREFIX}-backoff-1`, maxAttempts: 3 },
    );
    const claimed = await claimNext(`${TYPE_PREFIX}-backoff-worker`);
    expect(claimed?.id).toBe(job.id);

    const before = Date.now();
    await fail(claimed!.id, new Error('boom'));

    const row = await db.jobQueue.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe('QUEUED'); // attempts=1 < maxAttempts=3
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain('boom');
    expect(row.lockedAt).toBeNull();
    // backoff = min(2^1, 3600) = 2s in the future
    expect(row.runAt.getTime()).toBeGreaterThan(before + 1000);
    expect(row.runAt.getTime()).toBeLessThan(before + 10_000);
  });

  it('fail() moves the job to DEAD once maxAttempts is exhausted', async () => {
    const job = await enqueue(
      `${TYPE_PREFIX}-dead`,
      {},
      { idempotencyKey: `${TYPE_PREFIX}-dead-1`, maxAttempts: 2 },
    );

    // Attempt 1: claim, fail — back to QUEUED.
    const first = await claimNext(`${TYPE_PREFIX}-dead-worker-1`);
    expect(first?.id).toBe(job.id);
    await fail(first!.id, new Error('first failure'));
    let row = await db.jobQueue.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe('QUEUED');
    expect(row.attempts).toBe(1);

    // Make it claimable again immediately instead of waiting out the backoff.
    await db.jobQueue.update({ where: { id: job.id }, data: { runAt: new Date() } });

    // Attempt 2: claim, fail — attempts (2) >= maxAttempts (2) => DEAD.
    const second = await claimNext(`${TYPE_PREFIX}-dead-worker-2`);
    expect(second?.id).toBe(job.id);
    await fail(second!.id, new Error('second failure'));

    row = await db.jobQueue.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe('DEAD');
    expect(row.attempts).toBe(2);
    expect(row.lastError).toContain('second failure');

    // A DEAD job is never claimed again.
    const third = await claimNext(`${TYPE_PREFIX}-dead-worker-3`);
    expect(third?.id).not.toBe(job.id);
  });
});

describe('reclaimStuck', () => {
  it('moves a RUNNING job whose lock is older than the stuck threshold back to QUEUED', async () => {
    const job = await enqueue(
      `${TYPE_PREFIX}-stuck`,
      {},
      { idempotencyKey: `${TYPE_PREFIX}-stuck-1` },
    );
    const claimed = await claimNext(`${TYPE_PREFIX}-stuck-worker`);
    expect(claimed?.id).toBe(job.id);

    // Simulate a worker that crashed mid-job 11 minutes ago.
    await db.jobQueue.update({
      where: { id: job.id },
      data: { lockedAt: new Date(Date.now() - 11 * 60_000) },
    });

    const reclaimedCount = await reclaimStuck();
    expect(reclaimedCount).toBeGreaterThanOrEqual(1);

    const row = await db.jobQueue.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe('QUEUED');
    expect(row.lockedAt).toBeNull();
    expect(row.lockedBy).toBeNull();

    // Now claimable again.
    const reclaimed = await claimNext(`${TYPE_PREFIX}-stuck-worker-2`);
    expect(reclaimed?.id).toBe(job.id);
    await complete(reclaimed!.id);
  });

  it('leaves a freshly-locked RUNNING job alone', async () => {
    const job = await enqueue(
      `${TYPE_PREFIX}-fresh`,
      {},
      { idempotencyKey: `${TYPE_PREFIX}-fresh-1` },
    );
    const claimed = await claimNext(`${TYPE_PREFIX}-fresh-worker`);
    expect(claimed?.id).toBe(job.id);

    await reclaimStuck();

    const row = await db.jobQueue.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe('RUNNING'); // lockedAt is recent, untouched
    await complete(job.id);
  });
});

describe('queueStats', () => {
  it('reports counts consistent with a known set of fixtures', async () => {
    const type = `${TYPE_PREFIX}-stats`;
    // Create and fully process the DEAD fixture first, then create the
    // QUEUED one — claimNext takes the earliest `runAt` and both jobs would
    // otherwise tie, making which one gets claimed first ambiguous.
    const deadJob = await enqueue(
      type,
      {},
      { idempotencyKey: `${TYPE_PREFIX}-stats-dead`, maxAttempts: 1 },
    );
    const deadClaim = await claimNext(`${TYPE_PREFIX}-stats-worker`);
    expect(deadClaim?.id).toBe(deadJob.id);
    await fail(deadClaim!.id, new Error('dies immediately'));

    const queuedJob = await enqueue(type, {}, { idempotencyKey: `${TYPE_PREFIX}-stats-queued` });

    const stats = await queueStats();
    expect(stats.queued).toBeGreaterThanOrEqual(1); // at least queuedJob
    expect(stats.dead).toBeGreaterThanOrEqual(1); // at least deadJob
    expect(typeof stats.running).toBe('number');
    expect(typeof stats.succeeded).toBe('number');
    expect(typeof stats.failed).toBe('number');

    // cleanup this describe's queued survivor explicitly (afterAll also sweeps by type prefix)
    void queuedJob;
  });
});
