import 'server-only';
import { logger } from '@/lib/logger';
import {
  notifyHandler,
  sendEmailHandler,
  sendSmsHandler,
  cleanupHandler,
  priceRefreshCheckHandler,
  expirePaymentsHandler,
  reconcileStockHandler,
  newsletterSendHandler,
} from './handlers';

/**
 * Job handler registry: `type` (as passed to `enqueue`) → async handler.
 *
 * Handlers owned by other agents (inventory) are wired in defensively via a
 * dynamic import inside try/catch, so a module that doesn't exist yet (or
 * fails to load) never crashes the worker process — it just logs a warning
 * naming the handler that could not be loaded. Jobs of that type will then
 * fail with a clear "no handler registered" error (visible via
 * `queueStats()` and worker logs) instead of taking the whole process down.
 */

export type JobHandler = (payload: any) => Promise<void>;

const registry: Record<string, JobHandler> = {};

function register(type: string, handler: JobHandler) {
  registry[type] = handler;
}

const INVENTORY_HANDLER_NAMES = [
  'fulfill-order',
  'release-reservation',
  'inventory-import',
  'low-stock-scan',
] as const;

async function wireInventoryHandlers(): Promise<void> {
  try {
    const mod: Record<string, unknown> = await import('@/server/inventory/handlers');
    for (const name of INVENTORY_HANDLER_NAMES) {
      const fn = mod[name];
      if (typeof fn === 'function') {
        register(name, fn as JobHandler);
      } else {
        logger.warn('jobs: inventory handler not exported by module, job type left unhandled', {
          module: '@/server/inventory/handlers',
          handler: name,
        });
      }
    }
  } catch (err) {
    logger.warn(
      'jobs: could not load @/server/inventory/handlers — its job types are unhandled until it exists',
      {
        handlers: INVENTORY_HANDLER_NAMES,
        err: err instanceof Error ? err.message : String(err),
      },
    );
  }
}

let built = false;

/**
 * Populates the registry. Idempotent — safe to call repeatedly (subsequent
 * calls are no-ops) so both the worker and the cron route can call it on
 * every cold start without re-importing modules.
 */
export async function buildRegistry(): Promise<Record<string, JobHandler>> {
  if (built) return registry;
  built = true;

  await wireInventoryHandlers();

  register('notify', notifyHandler);
  register('send-email', sendEmailHandler);
  register('send-sms', sendSmsHandler);
  register('cleanup', cleanupHandler);
  register('price-refresh-check', priceRefreshCheckHandler);
  register('expire-payments', expirePaymentsHandler);
  register('reconcile-stock', reconcileStockHandler);
  register('newsletter-send', newsletterSendHandler);

  logger.info('jobs: registry built', { types: Object.keys(registry) });
  return registry;
}

export function getRegisteredTypes(): string[] {
  return Object.keys(registry);
}

export function getHandler(type: string): JobHandler | undefined {
  return registry[type];
}
