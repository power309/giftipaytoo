import 'server-only';
import { db } from '../db';
import { logger } from '@/lib/logger';
import { getSetting } from '../settings';
import { pruneRateLimits } from '../rate-limit';
import { notify, notifyAdmins } from '../notifications/service';
import { enqueue } from './queue';

/**
 * Handlers this agent owns directly (registered in registry.ts). Kept in a
 * separate module from the registry so each handler is independently
 * unit-testable without importing the dynamic-import wiring.
 */

// ── notify / send-email / send-sms ──────────────────────────────

export async function notifyHandler(payload: unknown): Promise<void> {
  await notify(payload as Parameters<typeof notify>[0]);
}

export async function sendEmailHandler(payload: unknown): Promise<void> {
  await notify({ ...(payload as Record<string, unknown>), channels: ['EMAIL'] } as Parameters<
    typeof notify
  >[0]);
}

export async function sendSmsHandler(payload: unknown): Promise<void> {
  await notify({ ...(payload as Record<string, unknown>), channels: ['SMS'] } as Parameters<
    typeof notify
  >[0]);
}

// ── cleanup ──────────────────────────────────────────────────────

/** Prunes rate-limit counters, expired sessions, expired carts and consumed/expired verification tokens. */
export async function cleanupHandler(): Promise<void> {
  const now = new Date();
  const [rateLimits, sessions, carts, tokens] = await Promise.all([
    pruneRateLimits(),
    db.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }] },
    }),
    db.cart.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.verificationToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }] },
    }),
  ]);
  logger.info('jobs: cleanup completed', {
    rateLimitsPruned: rateLimits,
    sessionsDeleted: sessions.count,
    cartsDeleted: carts.count,
    verificationTokensDeleted: tokens.count,
  });
}

// ── price-refresh-check ─────────────────────────────────────────

/**
 * Flags auto-priced, active product variants whose price has not been
 * recomputed within `pricing.staleHours` and notifies staff holding
 * `pricing.update` so they can trigger a refresh. Read-only with respect to
 * pricing itself — this agent does not own pricing logic.
 */
export async function priceRefreshCheckHandler(): Promise<void> {
  const staleHours = await getSetting<number>('pricing.staleHours', 24);
  const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000);

  const stale = await db.productVariant.findMany({
    where: {
      isActive: true,
      autoPrice: true,
      OR: [{ priceUpdatedAt: null }, { priceUpdatedAt: { lt: cutoff } }],
    },
    select: { id: true, sku: true, nameFa: true, priceUpdatedAt: true },
    take: 200,
  });

  if (stale.length === 0) {
    logger.info('jobs: price-refresh-check found no stale variants');
    return;
  }

  logger.warn('jobs: stale prices detected', { count: stale.length });
  await notifyAdmins('pricing.update', {
    template: 'price-stale-alert',
    data: {
      count: String(stale.length),
      sample: stale
        .slice(0, 5)
        .map((v) => v.sku)
        .join('، '),
    },
  });
}

// ── expire-payments ──────────────────────────────────────────────

/**
 * Marks PENDING/PROCESSING payments past their `expiresAt` as EXPIRED, and
 * enqueues a `release-reservation` job per affected order so the inventory
 * agent's handler (which owns reservation release) can free the held stock —
 * decoupled through the queue rather than this module calling inventory code.
 */
export async function expirePaymentsHandler(): Promise<void> {
  const now = new Date();
  const expiring = await db.payment.findMany({
    where: {
      status: { in: ['PENDING', 'PROCESSING'] },
      expiresAt: { not: null, lt: now },
    },
    select: { id: true, orderId: true },
    take: 500,
  });

  if (expiring.length === 0) return;

  await db.payment.updateMany({
    where: { id: { in: expiring.map((p) => p.id) } },
    data: { status: 'EXPIRED', failureReason: 'انقضای مهلت پرداخت' },
  });

  const orderIds = Array.from(new Set(expiring.map((p) => p.orderId)));
  for (const orderId of orderIds) {
    await enqueue(
      'release-reservation',
      { orderId },
      { idempotencyKey: `release-reservation:${orderId}` },
    );
  }

  logger.info('jobs: expired stale payments', {
    paymentsExpired: expiring.length,
    ordersReleased: orderIds.length,
  });
}

// ── reconcile-stock ───────────────────────────────────────────────

/**
 * Read-only daily integrity check: inventory items left RESERVED past their
 * `reservedUntil` window (which `release-reservation` should already have
 * cleared) indicate a drift between the queue and the data — this agent
 * surfaces it to staff rather than mutating inventory state itself, which
 * stays owned by the inventory module.
 *
 * Only ever selects non-sensitive columns — never `codeCipher`/`serialCipher`
 * /`pinCipher`, per repo convention.
 */
export async function reconcileStockHandler(): Promise<void> {
  const now = new Date();
  const orphaned = await db.inventoryItem.findMany({
    where: { status: 'RESERVED', reservedUntil: { lt: now } },
    select: { id: true, variantId: true, reservedForOrderId: true, reservedUntil: true },
    take: 200,
  });

  logger.info('jobs: reconcile-stock completed', { orphanedReservations: orphaned.length });

  if (orphaned.length > 0) {
    await notifyAdmins('inventory.update', {
      template: 'inventory-drift-alert',
      data: { count: String(orphaned.length) },
    });
  }
}

// ── newsletter-send ────────────────────────────────────────────────

export interface NewsletterSendPayload {
  userIds: string[];
  template: string;
  data?: Record<string, unknown>;
}

export async function newsletterSendHandler(payload: unknown): Promise<void> {
  const { userIds, template, data } = payload as NewsletterSendPayload;
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  for (const userId of userIds) {
    await notify({ template, userId, channels: ['EMAIL'], data: data ?? {} });
  }
  logger.info('jobs: newsletter-send dispatched', { recipients: userIds.length, template });
}
