/**
 * Long-running job worker. `npm run worker` (== `tsx scripts/worker.ts`).
 *
 * - Claims and runs jobs from the `JobQueue` table with a configurable
 *   concurrency (default 3, `WORKER_CONCURRENCY` env var).
 * - Reclaims stuck (crashed-mid-job) jobs on boot and periodically.
 * - Runs the recurring-task scheduler (see `src/server/jobs/scheduler.ts`).
 * - Shuts down gracefully on SIGTERM/SIGINT: stops claiming new jobs,
 *   finishes in-flight ones, then exits 0.
 *
 * Bootstrap note: every `src/server/**` module starts with `import
 * 'server-only'`, which only resolves to a no-op under the `react-server`
 * export condition — Next.js's bundler sets that automatically, but a plain
 * `tsx scripts/worker.ts` process does not, and the bare module throws on
 * import outside it. Rather than depending on a wrapper CLI flag this repo's
 * `npm run worker` script doesn't pass, this file re-execs itself once with
 * that condition set (via `NODE_OPTIONS`) before touching anything under
 * `@/server` — see `runReexecIfNeeded` below. Everything from `@/server` and
 * `@/lib` is therefore imported dynamically, inside `main()`, never as a
 * static top-level import — a static import is resolved before any of this
 * file's own code (including the re-exec check) runs, which would defeat it.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';

const REEXEC_FLAG = 'GP_WORKER_REACT_SERVER';

function runReexecIfNeeded(): boolean {
  if (process.env[REEXEC_FLAG]) return false;

  const extra = '--conditions=react-server';
  const nodeOptions = [process.env.NODE_OPTIONS, extra].filter(Boolean).join(' ');
  const child = spawn('npx', ['tsx', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, [REEXEC_FLAG]: '1', NODE_OPTIONS: nodeOptions },
  });

  const forward = (sig: NodeJS.Signals) => {
    process.on(sig, () => child.kill(sig));
  };
  forward('SIGTERM');
  forward('SIGINT');

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exitCode = code ?? 0;
    }
  });
  child.on('error', (err) => {
    console.error(JSON.stringify({ level: 'error', msg: 'worker: failed to spawn re-exec child', err: String(err) }));
    process.exitCode = 1;
  });

  return true;
}

async function main(): Promise<void> {
  const { logger } = await import('@/lib/logger');
  const { reclaimStuck, claimNext, complete, fail } = await import('@/server/jobs/queue');
  const { buildRegistry, getHandler } = await import('@/server/jobs/registry');
  const { runCronTask, SCHEDULE } = await import('@/server/jobs/scheduler');

  const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 3);
  const POLL_MS = 1000;
  const RECLAIM_INTERVAL_MS = 5 * 60_000;
  const workerBase = `${hostname()}:${process.pid}`;

  await buildRegistry();

  const reclaimedOnBoot = await reclaimStuck();
  logger.info('worker: booting', {
    concurrency: CONCURRENCY,
    worker: workerBase,
    reclaimedOnBoot,
  });

  let shuttingDown = false;
  const timers: NodeJS.Timeout[] = [];

  timers.push(setInterval(() => void reclaimStuck().catch((err) => logger.error('worker: reclaimStuck failed', { err: String(err) })), RECLAIM_INTERVAL_MS));

  for (const entry of SCHEDULE) {
    timers.push(
      setInterval(() => {
        runCronTask(entry.task)
          .then((res) => {
            if (res.enqueued > 0) {
              logger.info('worker: scheduler tick enqueued work', { ...res });
            }
          })
          .catch((err) => logger.error('worker: scheduler tick failed', { task: entry.task, err: String(err) }));
      }, entry.intervalMs),
    );
  }

  async function runJob(job: { id: string; type: string; payload: unknown; attempts: number }) {
    const startedAt = Date.now();
    const handler = getHandler(job.type);
    if (!handler) {
      await fail(job.id, new Error(`no handler registered for job type "${job.type}"`));
      logger.error('worker: no handler for job type', { jobId: job.id, type: job.type });
      return;
    }
    try {
      await handler(job.payload);
      await complete(job.id);
      logger.info('worker: job completed', {
        jobId: job.id,
        type: job.type,
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      await fail(job.id, err);
      logger.warn('worker: job failed', {
        jobId: job.id,
        type: job.type,
        attempts: job.attempts + 1,
        durationMs: Date.now() - startedAt,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function slotLoop(slot: number) {
    const workerId = `${workerBase}#${slot}`;
    while (!shuttingDown) {
      let job;
      try {
        job = await claimNext(workerId);
      } catch (err) {
        logger.error('worker: claimNext failed, backing off', { err: err instanceof Error ? err.message : String(err) });
        await sleep(POLL_MS * 3);
        continue;
      }
      if (!job) {
        await sleep(POLL_MS);
        continue;
      }
      await runJob(job);
    }
  }

  const slots = Array.from({ length: CONCURRENCY }, (_, i) => slotLoop(i));

  let shutdownStarted = false;
  const shutdown = (signal: string) => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    logger.info('worker: shutting down, finishing in-flight jobs', { signal });
    shuttingDown = true;
    for (const t of timers) clearInterval(t);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await Promise.all(slots);
  logger.info('worker: all slots drained, exiting', {});
  process.exit(0);
}

if (!runReexecIfNeeded()) {
  main().catch((err) => {
    console.error(JSON.stringify({ level: 'error', msg: 'worker: fatal error', err: String(err) }));
    process.exit(1);
  });
}
