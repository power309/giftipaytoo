import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { timingSafeEqualStr } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { isCronTask, runCronTask, CRON_TASKS } from '@/server/jobs/scheduler';

/**
 * Cron alternative to the long-running worker: lets a platform scheduler
 * (system cron via curl, a managed "cron job" product, ...) trigger the
 * same recurring tasks as `scripts/worker.ts`'s internal scheduler, without
 * needing a standing process. `runCronTask` is the exact function the
 * worker's timers call — this endpoint is a thin, authenticated trigger for
 * it, so the two ways of running the app can never define the task
 * differently.
 *
 * `task` is validated against `CRON_TASKS`, an explicit allow-list — no
 * arbitrary job type can be triggered this way. Protected by the same
 * `HEALTHCHECK_TOKEN` used by `/api/health/ready`, checked in constant time.
 *
 * Example: `curl -X POST -H "Authorization: Bearer $HEALTHCHECK_TOKEN" \
 *   https://shop.example/api/cron/expire-payments`
 */

export const dynamic = 'force-dynamic';

function isAuthorized(req: Request): boolean {
  const token = env.healthcheckToken;
  if (!token) {
    // No token configured: refuse rather than silently running unauthenticated
    // mutations — unlike the read-only health endpoints, cron triggers write.
    return false;
  }
  const header = req.headers.get('authorization') ?? '';
  const [scheme, value] = header.split(' ');
  if (scheme !== 'Bearer' || !value) return false;
  return timingSafeEqualStr(value, token);
}

async function handle(req: Request, params: Promise<{ task: string }>) {
  if (!env.healthcheckToken) {
    logger.error('cron: HEALTHCHECK_TOKEN not set, refusing all cron triggers');
    return NextResponse.json(
      { ok: false, error: 'HEALTHCHECK_TOKEN تنظیم نشده است.' },
      { status: 503 },
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { task } = await params;
  if (!isCronTask(task)) {
    return NextResponse.json(
      { ok: false, error: `unknown task "${task}"`, allowed: CRON_TASKS },
      { status: 404 },
    );
  }

  try {
    const result = await runCronTask(task);
    logger.info('cron: task triggered', { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'خطای ناشناخته';
    logger.error('cron: task failed', { task, err: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ task: string }> }) {
  return handle(req, ctx.params);
}

export async function GET(req: Request, ctx: { params: Promise<{ task: string }> }) {
  return handle(req, ctx.params);
}
