'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { logger } from '@/lib/logger';
import type { ActionResult } from '@/app/admin/orders/_lib';

function fail(error: string): ActionResult {
  return { ok: false, error };
}
function ok(message?: string): ActionResult {
  return { ok: true, message };
}

const idSchema = z.object({ jobId: z.string().min(1) });

/** Re-queues a DEAD (or any non-running) job: clears its error and attempt count and brings `runAt` forward to now. */
export async function retryJob(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('job.manage');

  const job = await db.jobQueue.findUnique({ where: { id: parsed.data.jobId } });
  if (!job) return fail('کار یافت نشد.');
  if (job.status === 'RUNNING') return fail('این کار در حال اجراست.');

  await db.jobQueue.update({ where: { id: job.id }, data: { status: 'QUEUED', attempts: 0, lastError: null, runAt: new Date(), lockedAt: null, lockedBy: null } });
  await audit({ action: 'job.retry', entity: 'JobQueue', entityId: job.id, actorId: user.id, actorType: 'STAFF', summary: `کار نوع ${job.type} دوباره در صف قرار گرفت.` });
  revalidatePath('/admin/jobs');
  return ok('کار دوباره در صف قرار گرفت.');
}

/** Brings a still-QUEUED job's schedule forward so the worker picks it up on its next poll. */
export async function runJobNow(input: z.infer<typeof idSchema>): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('job.manage');

  const job = await db.jobQueue.findUnique({ where: { id: parsed.data.jobId } });
  if (!job) return fail('کار یافت نشد.');
  if (job.status !== 'QUEUED') return fail('فقط کارهای در صف قابل تسریع هستند.');

  await db.jobQueue.update({ where: { id: job.id }, data: { runAt: new Date() } });
  await audit({ action: 'job.run-now', entity: 'JobQueue', entityId: job.id, actorId: user.id, actorType: 'STAFF' });
  revalidatePath('/admin/jobs');
  return ok('زمان‌بندی کار تسریع شد؛ در دور بعدی صف اجرا خواهد شد.');
}

const cronSchema = z.object({ task: z.enum(['release-reservations', 'expire-payments', 'prune', 'low-stock-scan', 'reconcile-stock']) });

/** Fires one of the recurring scheduled tasks immediately (the same entry point `scripts/worker.ts` and the cron HTTP endpoint use). */
export async function runScheduledTaskNow(input: z.infer<typeof cronSchema>): Promise<ActionResult> {
  const parsed = cronSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const user = await assertPermission('job.manage');

  try {
    const { runCronTask } = await import('@/server/jobs/scheduler');
    const result = await runCronTask(parsed.data.task);
    await audit({ action: 'job.cron.run-now', entity: 'CronTask', entityId: parsed.data.task, actorId: user.id, actorType: 'STAFF', summary: `${result.enqueued} کار در صف قرار گرفت.` });
    revalidatePath('/admin/jobs');
    return ok(`اجرا شد — ${result.enqueued.toLocaleString('fa-IR')} کار جدید در صف قرار گرفت.`);
  } catch (err) {
    logger.error('runScheduledTaskNow: scheduler module unavailable', { err: err instanceof Error ? err.message : String(err) });
    return fail('ماژول زمان‌بند هنوز آماده نیست.');
  }
}
