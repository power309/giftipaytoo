import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { timingSafeEqualStr } from '@/lib/crypto';
import { db } from '@/server/db';
import { queueStats } from '@/server/jobs/queue';
import { logger } from '@/lib/logger';

/**
 * Readiness probe — "can this instance actually serve traffic right now".
 * Checks a real database round-trip and reports job-queue depth. Returns
 * 503 when the database is unreachable, or when the queue is backed up
 * badly enough to indicate the worker has stopped keeping up.
 *
 * When `HEALTHCHECK_TOKEN` is set, callers must send it as
 * `Authorization: Bearer <token>` — compared in constant time so this
 * endpoint (which, unlike `/api/health`, reveals operational detail) can't
 * be probed by timing. Leaving the env var unset keeps the endpoint open,
 * which is fine behind a private network but not recommended publicly.
 */

export const dynamic = 'force-dynamic';

// Queued jobs beyond this suggest the worker isn't keeping up — surfaced as
// unhealthy so an uptime monitor pages someone rather than the queue just
// growing silently. See docs/OPERATIONS.md "when the queue backs up".
const QUEUE_BACKLOG_UNHEALTHY = 5000;

function isAuthorized(req: Request): boolean {
  const token = env.healthcheckToken;
  if (!token) return true; // no token configured => endpoint is open
  const header = req.headers.get('authorization') ?? '';
  const [scheme, value] = header.split(' ');
  if (scheme !== 'Bearer' || !value) return false;
  return timingSafeEqualStr(value, token);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 401 });
  }

  const checks: Record<string, { ok: boolean; error?: string }> = {};
  let queue: Awaited<ReturnType<typeof queueStats>> | null = null;

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (err) {
    checks.database = { ok: false, error: 'database unreachable' };
    logger.error('health/ready: database check failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    queue = await queueStats();
    checks.queue = { ok: queue.queued < QUEUE_BACKLOG_UNHEALTHY };
  } catch (err) {
    checks.queue = { ok: false, error: 'queue stats unavailable' };
    logger.error('health/ready: queue check failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const healthy = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { status: healthy ? 'ok' : 'unhealthy', checks, queue },
    { status: healthy ? 200 : 503 },
  );
}
