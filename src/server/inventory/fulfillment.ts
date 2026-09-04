import 'server-only';
import type { DeliveryChannel, FulfillmentStatus, OrderStatus, Prisma } from '@prisma/client';
import { db } from '@/server/db';
import { audit } from '@/server/audit';
import { logger } from '@/lib/logger';
import { encryptSecret, fingerprintCode, maskCode } from '@/lib/crypto';
import { isUniqueConstraintError } from './db-errors';
import { assertStaffActor } from './access';
import { enqueueJob } from './jobs';
import { getSupplierAdapter } from '@/server/suppliers/registry';

type Tx = Prisma.TransactionClient;

const DEFAULT_RESERVE_MINUTES = 15;
const DEFAULT_MAX_SUPPLIER_ATTEMPTS = 3;

// ─────────────────────────────────────────────────────────────
// fulfillOrder — the fulfill-order job handler
// ─────────────────────────────────────────────────────────────

export type FulfillResult =
  | { ok: false; reason: 'not-found' | 'not-paid' }
  | { ok: true; alreadyFulfilled: true; delivered: 0 }
  | { ok: true; alreadyFulfilled: false; delivered: number; manualReview: boolean; fulfillmentStatus: FulfillmentStatus };

class SupplierRetryableError extends Error {
  constructor(public readonly orderId: string) {
    super(`supplier fulfillment pending retry for order ${orderId}`);
  }
}

async function resolveJobAttempt(idempotencyKey: string): Promise<number> {
  try {
    const row = await db.jobQueue.findUnique({ where: { idempotencyKey }, select: { attempts: true } });
    return row?.attempts ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Fulfills a paid order. This is the handler behind the `fulfill-order` job
 * (payload `{ orderId }`, idempotencyKey `fulfill:<orderId>` at enqueue
 * time — enforced by whoever enqueues it, not here).
 *
 * IDEMPOTENCY / DUPLICATE-DELIVERY PREVENTION:
 *   1. The whole per-order body of work runs inside one transaction that
 *      opens with `SELECT id FROM orders WHERE id = $1 FOR UPDATE`. Two
 *      concurrent calls for the same order serialize on that row lock —
 *      the second one only proceeds once the first has committed, at which
 *      point it observes `fulfillmentStatus = 'FULFILLED'` (or the
 *      already-updated `fulfilledQty` per item) and does no further work.
 *   2. Every unit actually delivered is tracked via
 *      `OrderItem.fulfilledQty`, so even a resumed/partial run only ever
 *      asks for `qty - fulfilledQty` more units — it can never sell or
 *      delivery a unit twice.
 *   3. A guard at the top short-circuits when `fulfillmentStatus` is
 *      already `FULFILLED`, and when `paymentStatus !== 'PAID'`.
 */
export async function fulfillOrder(
  orderId: string,
  opts: { attempt?: number; maxSupplierAttempts?: number } = {},
): Promise<FulfillResult> {
  // The job queue runner invokes handlers as `handler(job.payload)` — it
  // does not pass attempt/idempotency metadata into the call. Since this
  // job is always enqueued with idempotencyKey `fulfill:<orderId>`, we can
  // recover "how many times has this already run" from that row when the
  // caller (tests, mainly) hasn't passed `opts.attempt` explicitly.
  const attempt = opts.attempt ?? (await resolveJobAttempt(`fulfill:${orderId}`));
  const maxSupplierAttempts = opts.maxSupplierAttempts ?? DEFAULT_MAX_SUPPLIER_ATTEMPTS;

  const txResult = await db.$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      if (lock.length === 0) return { kind: 'not-found' as const };

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          items: {
            include: {
              variant: { include: { product: true, supplier: true } },
            },
          },
        },
      });

      if (order.paymentStatus !== 'PAID') return { kind: 'not-paid' as const };
      if (order.fulfillmentStatus === 'FULFILLED') return { kind: 'already-fulfilled' as const };

      let manualReviewNeeded = false;
      let pendingSupplierRetry = false;
      let deliveredThisRun = 0;

      for (const item of order.items) {
        const remaining = item.qty - item.fulfilledQty;
        if (remaining <= 0) continue;

        if (!item.variantId || !item.variant) {
          // Variant was deleted/unset after the order was placed — nothing
          // automatic can be done; staff must resolve via manualFulfill.
          logger.warn('fulfillOrder: order item has no variant', { orderId, orderItemId: item.id });
          manualReviewNeeded = true;
          continue;
        }
        const variant = item.variant;

        // 1) Reuse whatever is already RESERVED for this order/variant.
        const reserved = await tx.inventoryItem.findMany({
          where: { reservedForOrderId: orderId, variantId: variant.id, status: 'RESERVED' },
          select: { id: true },
          take: remaining,
        });
        let pool = reserved;

        // 2) Reservation lost/expired/never happened — take fresh AVAILABLE stock.
        if (pool.length < remaining) {
          const need = remaining - pool.length;
          const fresh = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM inventory_items
            WHERE "variantId" = ${variant.id}
              AND status = 'AVAILABLE'::"InventoryStatus"
            ORDER BY "createdAt" ASC
            LIMIT ${need}
            FOR UPDATE SKIP LOCKED
          `;
          if (fresh.length > 0) {
            const ids = fresh.map((f) => f.id);
            const upd = await tx.inventoryItem.updateMany({
              where: { id: { in: ids }, status: 'AVAILABLE' },
              data: {
                status: 'RESERVED',
                reservedForOrderId: orderId,
                reservedUntil: new Date(Date.now() + DEFAULT_RESERVE_MINUTES * 60_000),
              },
            });
            if (upd.count === ids.length) pool = [...pool, ...ids.map((id) => ({ id }))];
          }
        }

        // 3) Still short and this is a supplier-backed product — call out.
        if (pool.length < remaining && variant.product.deliveryType === 'SUPPLIER_API') {
          const supplier = variant.supplier;
          if (supplier) {
            const adapter = getSupplierAdapter(supplier.adapterKey);
            if (adapter.isConfigured(supplier)) {
              const need = remaining - pool.length;
              for (let i = 0; i < need; i++) {
                let result;
                try {
                  result = await adapter.fetchCode({ supplier, variant });
                } catch (err) {
                  logger.error('supplier adapter threw', { orderId, supplierId: supplier.id, err: err instanceof Error ? err.message : String(err) });
                  result = { ok: false as const, code: '' as const, messageFa: 'خطای غیرمنتظره در ارتباط با تأمین‌کننده' };
                }
                if (result.ok) {
                  const codeCipher = encryptSecret(result.code);
                  const fp = fingerprintCode(result.code);
                  try {
                    const created = await tx.inventoryItem.create({
                      data: {
                        variantId: variant.id,
                        supplierId: supplier.id,
                        codeCipher,
                        codeFingerprint: fp,
                        codeMask: maskCode(result.code),
                        serialCipher: result.serial ? encryptSecret(result.serial) : null,
                        pinCipher: result.pin ? encryptSecret(result.pin) : null,
                        status: 'AVAILABLE',
                      },
                      select: { id: true },
                    });
                    pool.push({ id: created.id });
                  } catch (err) {
                    if (isUniqueConstraintError(err, 'codeFingerprint')) {
                      logger.warn('supplier returned a code already on file', { orderId, supplierId: supplier.id });
                    } else {
                      throw err;
                    }
                  }
                } else {
                  pendingSupplierRetry = true;
                  logger.warn('supplier fetchCode failed', {
                    orderId,
                    orderItemId: item.id,
                    supplierId: supplier.id,
                    message: result.messageFa,
                  });
                }
              }
            } else {
              // Honest: not configured for auto-fulfillment → manual queue.
              manualReviewNeeded = true;
            }
          } else {
            manualReviewNeeded = true;
          }
        }

        // 4) Sell whatever we ended up with.
        const toSell = pool.slice(0, remaining);
        if (toSell.length > 0) {
          const now = new Date();
          for (const inv of toSell) {
            await tx.inventoryItem.update({
              where: { id: inv.id },
              data: { status: 'SOLD', soldAt: now, orderItemId: item.id, reservedForOrderId: null, reservedUntil: null },
            });
            const delivery = await tx.delivery.create({
              data: { orderItemId: item.id, inventoryItemId: inv.id, channel: 'ACCOUNT' },
              select: { id: true },
            });
            await tx.inventoryAuditLog.create({
              data: {
                itemId: inv.id,
                action: 'SOLD',
                actorType: 'SYSTEM',
                meta: { orderId, orderItemId: item.id, deliveryId: delivery.id },
              },
            });
          }
          await tx.orderItem.update({ where: { id: item.id }, data: { fulfilledQty: { increment: toSell.length } } });
          await tx.product.update({ where: { id: variant.productId }, data: { salesCount: { increment: toSell.length } } });
          deliveredThisRun += toSell.length;
        }

        // Genuinely stuck (no supplier retry in flight) → flag for staff.
        if (toSell.length < remaining && !pendingSupplierRetry && variant.product.deliveryType !== 'SUPPLIER_API') {
          manualReviewNeeded = true;
        }
      }

      if (manualReviewNeeded && !order.needsReview) {
        await tx.order.update({ where: { id: orderId }, data: { needsReview: true } });
      }

      // Note: `order.fulfillmentStatus` can never be 'FULFILLED' here — the
      // guard above already returned 'already-fulfilled' for that case — so
      // `summary.fulfillmentStatus === 'FULFILLED'` below is exactly "became
      // fulfilled during this run" without needing a separate before/after flag.
      const summary = await recomputeOrderFulfillment(tx, orderId);

      return {
        kind: 'processed' as const,
        summary,
        userId: order.userId,
        manualReviewNeeded,
        pendingSupplierRetry,
        deliveredThisRun,
      };
    },
    { isolationLevel: 'ReadCommitted' },
  );

  if (txResult.kind === 'not-found') return { ok: false, reason: 'not-found' };
  if (txResult.kind === 'not-paid') return { ok: false, reason: 'not-paid' };
  if (txResult.kind === 'already-fulfilled') return { ok: true, alreadyFulfilled: true, delivered: 0 };

  const { summary, userId, manualReviewNeeded, pendingSupplierRetry, deliveredThisRun } = txResult;

  if (summary.fulfillmentStatus === 'FULFILLED') {
    await enqueueJob(
      db,
      'notify',
      { template: 'order-delivered', orderId, userId },
      { idempotencyKey: `notify:order-delivered:${orderId}` },
    );
  }

  if (manualReviewNeeded) {
    await enqueueJob(
      db,
      'notify',
      { template: 'admin-manual-review', orderId },
      { idempotencyKey: `notify:manual-review:${orderId}` },
    );
    return {
      ok: true,
      alreadyFulfilled: false,
      delivered: deliveredThisRun,
      manualReview: true,
      fulfillmentStatus: summary.fulfillmentStatus,
    };
  }

  if (pendingSupplierRetry) {
    if (attempt + 1 >= maxSupplierAttempts) {
      await db.$transaction(async (tx) => {
        const current = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { fulfillmentStatus: true } });
        await tx.order.update({
          where: { id: orderId },
          data: { needsReview: true, fulfillmentStatus: 'MANUAL_REVIEW', status: 'UNDER_REVIEW' },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: current.fulfillmentStatus,
            toStatus: 'MANUAL_REVIEW',
            field: 'fulfillmentStatus',
            actorType: 'SYSTEM',
            note: 'تأمین‌کننده پس از چند تلاش موفق نشد؛ سفارش برای بررسی دستی علامت‌گذاری شد.',
          },
        });
      });
      await enqueueJob(
        db,
        'notify',
        { template: 'admin-manual-review', orderId },
        { idempotencyKey: `notify:manual-review:${orderId}` },
      );
      return { ok: true, alreadyFulfilled: false, delivered: deliveredThisRun, manualReview: true, fulfillmentStatus: 'MANUAL_REVIEW' };
    }
    // Throwing signals failure to the job queue runner, which retries with
    // backoff per `JobQueue.attempts`/`maxAttempts` — this is the "retry
    // via the job queue" path; we only fall back to MANUAL_REVIEW once
    // `maxSupplierAttempts` is exhausted (handled above).
    throw new SupplierRetryableError(orderId);
  }

  return {
    ok: true,
    alreadyFulfilled: false,
    delivered: deliveredThisRun,
    manualReview: false,
    fulfillmentStatus: summary.fulfillmentStatus,
  };
}

/**
 * Recomputes and persists `Order.status` / `fulfillmentStatus` /
 * `fulfilledAt` from the current `OrderItem.fulfilledQty` values, writing
 * `OrderStatusHistory` rows for whatever actually changed. Shared by
 * `fulfillOrder`, `manualFulfill` and `replaceDefectiveCode` so the status
 * machine has exactly one implementation.
 */
async function recomputeOrderFulfillment(
  tx: Tx,
  orderId: string,
): Promise<{ fulfillmentStatus: FulfillmentStatus; status: OrderStatus }> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { select: { qty: true, fulfilledQty: true } } },
  });

  const totalQty = order.items.reduce((s, i) => s + i.qty, 0);
  const totalFulfilled = order.items.reduce((s, i) => s + Math.min(i.fulfilledQty, i.qty), 0);
  const allDone = totalQty > 0 && totalFulfilled >= totalQty;
  const anyDone = totalFulfilled > 0;

  let fulfillmentStatus: FulfillmentStatus;
  let status: OrderStatus;

  if (allDone) {
    fulfillmentStatus = 'FULFILLED';
    status = order.needsReview ? 'UNDER_REVIEW' : 'COMPLETED';
  } else if (order.needsReview) {
    fulfillmentStatus = anyDone ? 'PARTIALLY_FULFILLED' : 'MANUAL_REVIEW';
    status = 'UNDER_REVIEW';
  } else if (anyDone) {
    fulfillmentStatus = 'PARTIALLY_FULFILLED';
    status = 'PARTIALLY_FULFILLED';
  } else {
    fulfillmentStatus = 'UNFULFILLED';
    status = order.status;
  }

  const fulfilledAt = allDone ? (order.fulfilledAt ?? new Date()) : order.fulfilledAt;
  const changed = fulfillmentStatus !== order.fulfillmentStatus || status !== order.status;

  if (changed) {
    await tx.order.update({ where: { id: orderId }, data: { fulfillmentStatus, status, fulfilledAt } });
    if (fulfillmentStatus !== order.fulfillmentStatus) {
      await tx.orderStatusHistory.create({
        data: { orderId, fromStatus: order.fulfillmentStatus, toStatus: fulfillmentStatus, field: 'fulfillmentStatus', actorType: 'SYSTEM' },
      });
    }
    if (status !== order.status) {
      await tx.orderStatusHistory.create({
        data: { orderId, fromStatus: order.status, toStatus: status, field: 'status', actorType: 'SYSTEM' },
      });
    }
  }

  return { fulfillmentStatus, status };
}

// ─────────────────────────────────────────────────────────────
// resendDelivery
// ─────────────────────────────────────────────────────────────

export type ResendDeliveryInput = { orderItemId: string; channel: DeliveryChannel; actorId: string };

/**
 * Re-sends the SAME codes already delivered for an order item — it never
 * allocates a new one. Actually rendering/dispatching the notification is
 * outside this module's scope (owned by the notifications system); the
 * `notify` job payload below carries only ids and channel, never a
 * plaintext code — the notify handler must itself call `revealCode` under
 * the customer's own authorization at send time.
 */
export async function resendDelivery(input: ResendDeliveryInput): Promise<{ ok: true; count: number }> {
  const actor = await assertStaffActor('order.fulfill', input.actorId);

  const deliveries = await db.delivery.findMany({
    where: { orderItemId: input.orderItemId },
    select: { id: true },
  });
  if (deliveries.length === 0) throw new Error('تحویلی برای این ردیف سفارش یافت نشد.');

  await db.$transaction(
    deliveries.map((d) =>
      db.delivery.update({ where: { id: d.id }, data: { channel: input.channel, resendCount: { increment: 1 } } }),
    ),
  );

  for (const d of deliveries) {
    await audit({
      action: 'delivery.resend',
      entity: 'Delivery',
      entityId: d.id,
      actorId: actor.id,
      actorType: 'STAFF',
      summary: `ارسال مجدد کد برای ردیف سفارش ${input.orderItemId}`,
    });
  }

  await enqueueJob(
    db,
    'notify',
    { template: 'order-code-resend', orderItemId: input.orderItemId, channel: input.channel, deliveryIds: deliveries.map((d) => d.id) },
    {},
  );

  return { ok: true, count: deliveries.length };
}

// ─────────────────────────────────────────────────────────────
// replaceDefectiveCode
// ─────────────────────────────────────────────────────────────

export type ReplaceDefectiveCodeInput = { deliveryId: string; reason: string; actorId: string };
export type ReplaceDefectiveCodeResult =
  | { ok: true; deliveryId: string; inventoryItemId: string }
  | { ok: false; reason: 'out-of-stock' };

export async function replaceDefectiveCode(input: ReplaceDefectiveCodeInput): Promise<ReplaceDefectiveCodeResult> {
  const actor = await assertStaffActor('order.fulfill', input.actorId);

  return db.$transaction(async (tx) => {
    const delivery = await tx.delivery.findUnique({
      where: { id: input.deliveryId },
      include: { orderItem: { select: { id: true, orderId: true } }, inventoryItem: true },
    });
    if (!delivery || !delivery.inventoryItem) throw new Error('تحویل یا کد مربوط به آن یافت نشد.');
    const oldItem = delivery.inventoryItem;

    await tx.inventoryItem.update({ where: { id: oldItem.id }, data: { status: 'INVALID', notes: input.reason } });
    await tx.inventoryAuditLog.create({
      data: { itemId: oldItem.id, action: 'INVALIDATED', actorId: actor.id, actorType: 'STAFF', meta: { reason: input.reason, deliveryId: delivery.id } },
    });

    const candidate = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM inventory_items
      WHERE "variantId" = ${oldItem.variantId}
        AND status = 'AVAILABLE'::"InventoryStatus"
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    if (candidate.length === 0) {
      await tx.order.update({
        where: { id: delivery.orderItem.orderId },
        data: { needsReview: true, status: 'UNDER_REVIEW', fulfillmentStatus: 'MANUAL_REVIEW' },
      });
      await enqueueJob(
        tx,
        'notify',
        { template: 'admin-manual-review', orderId: delivery.orderItem.orderId, reason: 'no-replacement-stock' },
        { idempotencyKey: `notify:manual-review:${delivery.orderItem.orderId}` },
      );
      return { ok: false, reason: 'out-of-stock' } as const;
    }

    const newItemId = candidate[0].id;
    const now = new Date();
    const upd = await tx.inventoryItem.updateMany({
      where: { id: newItemId, status: 'AVAILABLE' },
      data: { status: 'SOLD', soldAt: now, orderItemId: delivery.orderItem.id },
    });
    if (upd.count !== 1) throw new Error('تخصیص کد جایگزین با مشکل مواجه شد.');

    const newDelivery = await tx.delivery.create({
      data: {
        orderItemId: delivery.orderItem.id,
        inventoryItemId: newItemId,
        channel: delivery.channel,
        isReplacement: true,
        replacedDeliveryId: delivery.id,
      },
      select: { id: true },
    });
    await tx.inventoryAuditLog.create({
      data: { itemId: newItemId, action: 'SOLD', actorId: actor.id, actorType: 'STAFF', meta: { reason: 'replacement', replacedDeliveryId: delivery.id } },
    });

    await audit({
      action: 'delivery.replace',
      entity: 'Delivery',
      entityId: newDelivery.id,
      actorId: actor.id,
      actorType: 'STAFF',
      summary: input.reason,
    });

    return { ok: true, deliveryId: newDelivery.id, inventoryItemId: newItemId } as const;
  });
}

// ─────────────────────────────────────────────────────────────
// manualFulfill
// ─────────────────────────────────────────────────────────────

export type ManualFulfillInput = {
  orderItemId: string;
  plaintextCode: string;
  serial?: string;
  pin?: string;
  actorId: string;
};

export async function manualFulfill(input: ManualFulfillInput): Promise<{ ok: true; deliveryId: string }> {
  const actor = await assertStaffActor('order.fulfill', input.actorId);
  const plaintext = input.plaintextCode.trim();
  if (!plaintext) throw new Error('کد نمی‌تواند خالی باشد.');

  return db.$transaction(async (tx) => {
    const orderItem = await tx.orderItem.findUnique({ where: { id: input.orderItemId } });
    if (!orderItem) throw new Error('ردیف سفارش یافت نشد.');
    if (!orderItem.variantId) throw new Error('این ردیف سفارش به متغیر محصولی متصل نیست و نمی‌توان به‌صورت دستی تحویل داد.');

    const variant = await tx.productVariant.findUniqueOrThrow({
      where: { id: orderItem.variantId },
      select: { productId: true },
    });

    const codeCipher = encryptSecret(plaintext);
    const codeFingerprint = fingerprintCode(plaintext);
    const codeMask = maskCode(plaintext);

    let newItem: { id: string };
    try {
      newItem = await tx.inventoryItem.create({
        data: {
          variantId: orderItem.variantId,
          codeCipher,
          codeFingerprint,
          codeMask,
          serialCipher: input.serial?.trim() ? encryptSecret(input.serial.trim()) : null,
          pinCipher: input.pin?.trim() ? encryptSecret(input.pin.trim()) : null,
          status: 'SOLD',
          soldAt: new Date(),
          orderItemId: orderItem.id,
        },
        select: { id: true },
      });
    } catch (err) {
      if (isUniqueConstraintError(err, 'codeFingerprint')) {
        throw new Error('این کد قبلاً در سامانه ثبت شده است.');
      }
      throw err;
    }

    const delivery = await tx.delivery.create({
      data: { orderItemId: orderItem.id, inventoryItemId: newItem.id, channel: 'ACCOUNT' },
      select: { id: true },
    });
    await tx.orderItem.update({ where: { id: orderItem.id }, data: { fulfilledQty: { increment: 1 } } });
    await tx.product.update({ where: { id: variant.productId }, data: { salesCount: { increment: 1 } } });

    await tx.inventoryAuditLog.create({
      data: { itemId: newItem.id, action: 'SOLD', actorId: actor.id, actorType: 'STAFF', meta: { manual: true, orderItemId: orderItem.id } },
    });
    await audit({
      action: 'order.manual-fulfill',
      entity: 'OrderItem',
      entityId: orderItem.id,
      actorId: actor.id,
      actorType: 'STAFF',
    });

    await recomputeOrderFulfillment(tx, orderItem.orderId);

    return { ok: true, deliveryId: delivery.id };
  });
}
