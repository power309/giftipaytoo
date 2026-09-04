import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { audit } from '../audit';
import { enforceRateLimit } from '../rate-limit';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { getGateway, getGatewayUnchecked } from './registry';

type DbOrTx = typeof db | Prisma.TransactionClient;

/** How long a freshly-created PENDING payment attempt stays valid before `expireStalePayments` sweeps it. */
const PAYMENT_ATTEMPT_TTL_MS = 30 * 60 * 1000;
/** Interactive transactions here may include one outbound gateway HTTP call, so give them real headroom. */
const TX_TIMEOUT_MS = 25_000;
const TX_MAX_WAIT_MS = 10_000;

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002';
}

/**
 * Pure amount check used right before any success transition. Both call
 * sites always derive `expectedAmountToman` fresh from the order row read
 * inside the same locked transaction — never from anything the client sent.
 */
export function amountsMatch(paymentAmountToman: number, expectedAmountToman: number): boolean {
  return (
    Number.isInteger(paymentAmountToman) &&
    Number.isInteger(expectedAmountToman) &&
    paymentAmountToman === expectedAmountToman
  );
}

export type PayableCheck = { ok: true } | { ok: false; code: string; messageFa: string };

/** Pure — no DB access — so it is fully unit-testable. */
export function isOrderPayable(
  order: { status: string; paymentStatus: string; reservationExpiresAt: Date | null },
  now: Date = new Date(),
): PayableCheck {
  if (order.paymentStatus === 'PAID') {
    return { ok: false, code: 'ALREADY_PAID', messageFa: 'این سفارش قبلاً پرداخت شده است.' };
  }
  if (order.status !== 'AWAITING_PAYMENT' && order.status !== 'PENDING') {
    return { ok: false, code: 'NOT_PAYABLE', messageFa: 'وضعیت فعلی سفارش امکان پرداخت را نمی‌دهد.' };
  }
  if (order.reservationExpiresAt && order.reservationExpiresAt.getTime() < now.getTime()) {
    return { ok: false, code: 'RESERVATION_EXPIRED', messageFa: 'مهلت رزرو این سفارش به پایان رسیده است.' };
  }
  return { ok: true };
}

function scrubForStorage(raw: unknown): Prisma.InputJsonValue | undefined {
  if (raw === undefined || raw === null) return undefined;
  const SENSITIVE = new Set(['merchant_id']);
  const redact = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(redact);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = SENSITIVE.has(k) ? '[redacted]' : redact(val);
      }
      return out;
    }
    return v;
  };
  try {
    return JSON.parse(JSON.stringify(redact(raw))) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

async function enqueueJob(
  client: DbOrTx,
  input: { type: string; payload: Record<string, unknown>; idempotencyKey: string; runAt?: Date },
): Promise<void> {
  try {
    await client.jobQueue.create({
      data: {
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
        runAt: input.runAt ?? new Date(),
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      logger.debug('enqueueJob: already queued', { idempotencyKey: input.idempotencyKey });
      return;
    }
    throw err;
  }
}

/**
 * Puts an order that just had a payment attempt fail/cancel/expire back
 * into a state the customer can act on again (retry payment, or have it
 * naturally expire) — never leaves it stuck mid-flow. No-op once the order
 * has already settled as PAID/REFUNDED by some other, earlier attempt.
 */
async function settleUnpaidOrder(
  tx: Prisma.TransactionClient,
  order: { id: string; status: string },
  paymentStatus: 'CANCELED' | 'FAILED' | 'EXPIRED',
): Promise<void> {
  await tx.order.updateMany({
    where: { id: order.id, paymentStatus: { notIn: ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'] } },
    data: { status: 'AWAITING_PAYMENT', paymentStatus },
  });
  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: paymentStatus,
      field: 'paymentStatus',
      actorType: 'SYSTEM',
    },
  });
}

// ── Start a payment attempt ───────────────────────────────────────────────

export type StartPaymentInput = {
  orderId: string;
  gatewayKey: string;
  userId: string;
  ip: string;
};

export type StartPaymentResult =
  | { ok: true; redirectUrl: string; paymentId: string }
  | { ok: false; code: string; messageFa: string };

export async function startPayment(input: StartPaymentInput): Promise<StartPaymentResult> {
  await enforceRateLimit('payment.start', `${input.userId}:${input.ip}`);

  const order = await db.order.findUnique({
    where: { id: input.orderId },
    include: { user: { select: { email: true, phone: true } } },
  });
  if (!order) {
    return { ok: false, code: 'ORDER_NOT_FOUND', messageFa: 'سفارش یافت نشد.' };
  }
  if (order.userId !== input.userId) {
    await audit({
      action: 'payment.start.denied',
      entity: 'Order',
      entityId: order.id,
      actorId: input.userId,
      summary: 'تلاش برای پرداخت سفارشی که متعلق به کاربر نیست.',
      ip: input.ip,
    });
    return { ok: false, code: 'FORBIDDEN', messageFa: 'شما اجازه پرداخت این سفارش را ندارید.' };
  }

  const payable = isOrderPayable(order);
  if (!payable.ok) {
    return { ok: false, code: payable.code, messageFa: payable.messageFa };
  }

  const gateway = await getGateway(input.gatewayKey);
  if (!gateway) {
    return { ok: false, code: 'GATEWAY_UNAVAILABLE', messageFa: 'این روش پرداخت در حال حاضر در دسترس نیست.' };
  }

  // Amount is always recomputed from the order row — never trust a client-supplied amount.
  const amountToman = order.totalToman - order.walletAppliedToman;
  if (amountToman <= 0) {
    return { ok: false, code: 'NOTHING_TO_PAY', messageFa: 'مبلغی برای پرداخت باقی نمانده است.' };
  }

  const attemptNumber = (await db.payment.count({ where: { orderId: order.id, gateway: gateway.key } })) + 1;
  const idempotencyKey = `${order.id}:${gateway.key}:${attemptNumber}`;

  let payment;
  try {
    payment = await db.payment.create({
      data: {
        orderId: order.id,
        gateway: gateway.key,
        mode: gateway.mode,
        amountToman,
        status: 'PENDING',
        idempotencyKey,
        expiresAt: new Date(Date.now() + PAYMENT_ATTEMPT_TTL_MS),
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return {
        ok: false,
        code: 'DUPLICATE_ATTEMPT',
        messageFa: 'یک درخواست پرداخت مشابه هم‌اکنون در حال پردازش است.',
      };
    }
    throw err;
  }

  const callbackUrl = `${env.appUrl}/api/payments/${gateway.key}/callback`;
  const initResult = await gateway.init({
    orderId: order.id,
    orderNumber: order.orderNumber,
    amountToman,
    description: `پرداخت سفارش ${order.orderNumber}`,
    callbackUrl,
    customerEmail: order.user?.email ?? order.guestEmail ?? null,
    customerPhone: order.user?.phone ?? order.guestPhone ?? null,
    idempotencyKey,
  });

  if (!initResult.ok) {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureReason: initResult.messageFa },
    });
    await audit({
      action: 'payment.start.failed',
      entity: 'Payment',
      entityId: payment.id,
      actorId: input.userId,
      summary: initResult.messageFa,
      ip: input.ip,
    });
    return { ok: false, code: initResult.code, messageFa: initResult.messageFa };
  }

  await db.payment.update({
    where: { id: payment.id },
    data: {
      authority: initResult.authority,
      requestPayload: scrubForStorage(initResult.raw),
    },
  });

  await audit({
    action: 'payment.start',
    entity: 'Payment',
    entityId: payment.id,
    actorId: input.userId,
    summary: `شروع پرداخت سفارش ${order.orderNumber} از طریق ${gateway.labelFa}`,
    ip: input.ip,
    after: { gateway: gateway.key, amountToman, attemptNumber },
  });

  return { ok: true, redirectUrl: initResult.redirectUrl, paymentId: payment.id };
}

// ── Verify a payment callback ─────────────────────────────────────────────

const callbackParamsSchema = z.record(z.string(), z.string());

export type VerifyPaymentStatus =
  | 'PAID'
  | 'ALREADY_PAID'
  | 'CANCELED'
  | 'FAILED'
  | 'VERIFICATION_FAILED'
  | 'AWAITING_MANUAL_REVIEW'
  | 'UNKNOWN';

export type VerifyPaymentResult = {
  ok: boolean;
  status: VerifyPaymentStatus;
  orderNumber: string | null;
  messageFa: string;
};

export type VerifyPaymentInput = {
  gatewayKey: string;
  params: Record<string, string>;
  ip: string;
};

/**
 * The callback-handling core. See `src/app/api/payments/[gateway]/callback/route.ts`
 * for the HTTP entry point — this function contains ALL of the trust
 * decisions and must never be reachable with unvalidated input.
 */
export async function verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
  const parsedParams = callbackParamsSchema.safeParse(input.params);
  if (!parsedParams.success) {
    await audit({
      action: 'payment.verify.invalid_params',
      entity: 'Payment',
      summary: 'پارامترهای بازگشتی درگاه پرداخت نامعتبر بود.',
      ip: input.ip,
    });
    return { ok: false, status: 'UNKNOWN', orderNumber: null, messageFa: 'پارامترهای بازگشتی درگاه پرداخت نامعتبر است.' };
  }

  const gateway = getGatewayUnchecked(input.gatewayKey);
  if (!gateway) {
    await audit({
      action: 'payment.verify.unknown_gateway',
      entity: 'Payment',
      summary: input.gatewayKey,
      ip: input.ip,
    });
    return { ok: false, status: 'UNKNOWN', orderNumber: null, messageFa: 'درگاه پرداخت نامعتبر است.' };
  }

  const { authority, canceled } = gateway.parseCallback(new URLSearchParams(parsedParams.data));
  if (!authority) {
    await audit({
      action: 'payment.verify.no_authority',
      entity: 'Payment',
      summary: gateway.key,
      ip: input.ip,
    });
    return { ok: false, status: 'UNKNOWN', orderNumber: null, messageFa: 'شناسه تراکنش در بازگشت از درگاه یافت نشد.' };
  }

  const paymentRef = await db.payment.findUnique({
    where: { gateway_authority: { gateway: gateway.key, authority } },
  });
  if (!paymentRef) {
    await audit({
      action: 'payment.verify.not_found',
      entity: 'Payment',
      summary: `authority ناشناخته برای درگاه ${gateway.key}`,
      ip: input.ip,
    });
    return { ok: false, status: 'UNKNOWN', orderNumber: null, messageFa: 'تراکنش پرداخت یافت نشد.' };
  }

  return db.$transaction(
    async (tx): Promise<VerifyPaymentResult> => {
      // Row-level lock: a concurrent/replayed callback for the SAME payment
      // blocks here until the winner's transaction commits, then re-reads
      // the now-settled row below. This — not "first write wins" — is what
      // makes verification idempotent under real concurrency.
      await tx.$queryRaw`SELECT id FROM "payments" WHERE id = ${paymentRef.id} FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentRef.id } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });

      if (payment.status === 'PAID') {
        return {
          ok: true,
          status: 'ALREADY_PAID',
          orderNumber: order.orderNumber,
          messageFa: 'این پرداخت قبلاً با موفقیت تأیید شده است.',
        };
      }
      if (
        payment.status === 'CANCELED' ||
        payment.status === 'EXPIRED' ||
        payment.status === 'FAILED' ||
        payment.status === 'VERIFICATION_FAILED'
      ) {
        return {
          ok: false,
          status: payment.status,
          orderNumber: order.orderNumber,
          messageFa: payment.failureReason ?? 'این تراکنش قبلاً ناموفق ثبت شده بود.',
        };
      }
      if (payment.status === 'REFUNDED' || payment.status === 'PARTIALLY_REFUNDED') {
        return {
          ok: true,
          status: 'ALREADY_PAID',
          orderNumber: order.orderNumber,
          messageFa: 'وضعیت این پرداخت قبلاً نهایی شده است.',
        };
      }
      if (payment.status === 'PROCESSING') {
        return {
          ok: true,
          status: 'AWAITING_MANUAL_REVIEW',
          orderNumber: order.orderNumber,
          messageFa: 'این سفارش در انتظار بررسی و تأیید تیم پشتیبانی است.',
        };
      }
      // Only remaining state: PENDING — the one state a callback may act on.

      if (canceled) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'CANCELED', failureReason: 'کاربر پرداخت را لغو کرد.' },
        });
        await settleUnpaidOrder(tx, order, 'CANCELED');
        await enqueueJob(tx, {
          type: 'release-reservation',
          payload: { orderId: order.id },
          idempotencyKey: `release:${order.id}`,
        });
        await audit({
          action: 'payment.verify.canceled',
          entity: 'Payment',
          entityId: payment.id,
          summary: `لغو پرداخت سفارش ${order.orderNumber}`,
          ip: input.ip,
        });
        return { ok: false, status: 'CANCELED', orderNumber: order.orderNumber, messageFa: 'پرداخت توسط کاربر لغو شد.' };
      }

      // ── Server-side verification ──────────────────────────────────────
      // Landing on this URL proves nothing by itself — the query string can
      // be replayed or forged by anyone. The ONLY thing that can mark an
      // order paid is a successful, server-to-server `gateway.verify()`
      // call below, using the amount WE trust from the Payment row (never
      // anything from the callback query string). Returning to the
      // "success" URL alone never marks an order paid.
      const verifyResult = await gateway.verify({
        authority,
        amountToman: payment.amountToman,
        params: parsedParams.data,
      });

      if (!verifyResult.ok) {
        if (verifyResult.code === 'AWAITING_MANUAL_REVIEW') {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'PROCESSING' } });
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'UNDER_REVIEW', paymentStatus: 'PROCESSING' },
          });
          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              fromStatus: order.status,
              toStatus: 'UNDER_REVIEW',
              field: 'status',
              note: verifyResult.messageFa,
              actorType: 'SYSTEM',
            },
          });
          await audit({
            action: 'payment.verify.awaiting_manual_review',
            entity: 'Payment',
            entityId: payment.id,
            summary: `سفارش ${order.orderNumber} در انتظار تأیید واریز دستی`,
            ip: input.ip,
          });
          return {
            ok: true,
            status: 'AWAITING_MANUAL_REVIEW',
            orderNumber: order.orderNumber,
            messageFa: verifyResult.messageFa,
          };
        }

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            failureReason: verifyResult.messageFa,
            verifyPayload: scrubForStorage(verifyResult.raw),
          },
        });
        await settleUnpaidOrder(tx, order, 'FAILED');
        await enqueueJob(tx, {
          type: 'release-reservation',
          payload: { orderId: order.id },
          idempotencyKey: `release:${order.id}`,
        });
        await audit({
          action: 'payment.verify.failed',
          entity: 'Payment',
          entityId: payment.id,
          summary: verifyResult.messageFa,
          ip: input.ip,
        });
        return { ok: false, status: 'FAILED', orderNumber: order.orderNumber, messageFa: verifyResult.messageFa };
      }

      // ── Amount check ────────────────────────────────────────────────
      // We only ever asked the gateway to verify `payment.amountToman`, but
      // the order itself may have drifted since the attempt was created
      // (e.g. edited out-of-band). Re-confirm the amount we are about to
      // mark paid still matches what the order actually needs.
      const expectedAmountToman = order.totalToman - order.walletAppliedToman;
      if (!amountsMatch(payment.amountToman, expectedAmountToman)) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'VERIFICATION_FAILED',
            failureReason: `مغایرت مبلغ: پرداخت ${payment.amountToman} تومان در برابر سفارش ${expectedAmountToman} تومان.`,
            verifyPayload: scrubForStorage(verifyResult.raw),
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'VERIFICATION_FAILED', needsReview: true },
        });
        await enqueueJob(tx, {
          type: 'notify',
          payload: { template: 'payment.amount_mismatch', orderId: order.id, channel: 'IN_APP' },
          idempotencyKey: `notify:${order.id}:amount_mismatch:${payment.id}`,
        });
        await audit({
          action: 'payment.verify.amount_mismatch',
          entity: 'Payment',
          entityId: payment.id,
          summary: `مغایرت مبلغ سفارش ${order.orderNumber}`,
          ip: input.ip,
        });
        return {
          ok: false,
          status: 'VERIFICATION_FAILED',
          orderNumber: order.orderNumber,
          messageFa: 'مبلغ تأییدشده با مبلغ سفارش مطابقت ندارد. سفارش برای بررسی علامت‌گذاری شد.',
        };
      }

      // ── Success ─────────────────────────────────────────────────────
      const now = new Date();
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          refId: verifyResult.refId,
          cardPanMasked: verifyResult.cardPanMasked ?? null,
          verifiedAt: now,
          verifyPayload: scrubForStorage(verifyResult.raw),
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'PAID', paymentStatus: 'PAID', paidAt: now },
      });
      await tx.orderStatusHistory.createMany({
        data: [
          { orderId: order.id, fromStatus: order.status, toStatus: 'PAID', field: 'status', actorType: 'SYSTEM' },
          {
            orderId: order.id,
            fromStatus: order.paymentStatus,
            toStatus: 'PAID',
            field: 'paymentStatus',
            actorType: 'SYSTEM',
          },
        ],
      });

      // Fulfillment happens out-of-band via the `fulfill-order` job — NEVER
      // inline here. The unique idempotencyKey makes duplicate delivery
      // structurally impossible even if this branch were ever re-entered.
      await enqueueJob(tx, {
        type: 'fulfill-order',
        payload: { orderId: order.id },
        idempotencyKey: `fulfill:${order.id}`,
      });
      await enqueueJob(tx, {
        type: 'notify',
        payload: { template: 'order.paid', userId: order.userId ?? undefined, orderId: order.id, channel: 'IN_APP' },
        idempotencyKey: `notify:${order.id}:order_paid`,
      });

      await audit({
        action: 'payment.verify.success',
        entity: 'Payment',
        entityId: payment.id,
        summary: `پرداخت سفارش ${order.orderNumber} تأیید شد (${gateway.labelFa})`,
        ip: input.ip,
        after: { refId: verifyResult.refId, amountToman: payment.amountToman },
      });

      return { ok: true, status: 'PAID', orderNumber: order.orderNumber, messageFa: 'پرداخت با موفقیت تأیید شد.' };
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  );
}

// ── Manual (bank-transfer) staff review ───────────────────────────────────

export async function confirmManualPayment(input: {
  paymentId: string;
  approvedById: string;
  ip?: string | null;
}): Promise<VerifyPaymentResult> {
  const paymentRef = await db.payment.findUnique({ where: { id: input.paymentId } });
  if (!paymentRef || paymentRef.gateway !== 'manual') {
    return { ok: false, status: 'UNKNOWN', orderNumber: null, messageFa: 'پرداخت واریز بانکی یافت نشد.' };
  }

  return db.$transaction(
    async (tx): Promise<VerifyPaymentResult> => {
      await tx.$queryRaw`SELECT id FROM "payments" WHERE id = ${paymentRef.id} FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentRef.id } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });

      if (payment.status === 'PAID') {
        return {
          ok: true,
          status: 'ALREADY_PAID',
          orderNumber: order.orderNumber,
          messageFa: 'این پرداخت قبلاً تأیید شده بود.',
        };
      }
      if (payment.status !== 'PROCESSING') {
        return {
          ok: false,
          status: 'UNKNOWN',
          orderNumber: order.orderNumber,
          messageFa: 'این پرداخت در وضعیتی نیست که بتوان آن را تأیید کرد.',
        };
      }

      const expectedAmountToman = order.totalToman - order.walletAppliedToman;
      if (!amountsMatch(payment.amountToman, expectedAmountToman)) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'VERIFICATION_FAILED', failureReason: 'مغایرت مبلغ در تأیید واریز دستی.' },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'VERIFICATION_FAILED', needsReview: true },
        });
        await audit({
          action: 'payment.manual.amount_mismatch',
          entity: 'Payment',
          entityId: payment.id,
          actorId: input.approvedById,
          actorType: 'STAFF',
          ip: input.ip ?? null,
        });
        return {
          ok: false,
          status: 'VERIFICATION_FAILED',
          orderNumber: order.orderNumber,
          messageFa: 'مبلغ واریزی با مبلغ سفارش مطابقت ندارد.',
        };
      }

      const now = new Date();
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID', verifiedAt: now, refId: `manual-${payment.id}` },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'PAID', paymentStatus: 'PAID', paidAt: now },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: 'PAID',
          field: 'status',
          actorId: input.approvedById,
          actorType: 'STAFF',
          note: 'تأیید واریز بانکی توسط تیم پشتیبانی',
        },
      });
      await enqueueJob(tx, {
        type: 'fulfill-order',
        payload: { orderId: order.id },
        idempotencyKey: `fulfill:${order.id}`,
      });
      await enqueueJob(tx, {
        type: 'notify',
        payload: { template: 'order.paid', userId: order.userId ?? undefined, orderId: order.id, channel: 'IN_APP' },
        idempotencyKey: `notify:${order.id}:order_paid`,
      });
      await audit({
        action: 'payment.manual.confirmed',
        entity: 'Payment',
        entityId: payment.id,
        actorId: input.approvedById,
        actorType: 'STAFF',
        ip: input.ip ?? null,
        summary: `تأیید واریز بانکی سفارش ${order.orderNumber}`,
      });

      return {
        ok: true,
        status: 'PAID',
        orderNumber: order.orderNumber,
        messageFa: 'واریز بانکی تأیید و سفارش پرداخت‌شده علامت‌گذاری شد.',
      };
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  );
}

export async function rejectManualPayment(input: {
  paymentId: string;
  rejectedById: string;
  reason: string;
  ip?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const paymentRef = await db.payment.findUnique({ where: { id: input.paymentId } });
  if (!paymentRef || paymentRef.gateway !== 'manual') {
    return { ok: false, error: 'پرداخت واریز بانکی یافت نشد.' };
  }

  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "payments" WHERE id = ${paymentRef.id} FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentRef.id } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
      if (payment.status === 'PAID') {
        return { ok: false, error: 'این پرداخت قبلاً تأیید شده است.' };
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: input.reason },
      });
      await settleUnpaidOrder(tx, order, 'FAILED');
      await enqueueJob(tx, {
        type: 'release-reservation',
        payload: { orderId: order.id },
        idempotencyKey: `release:${order.id}`,
      });
      await audit({
        action: 'payment.manual.rejected',
        entity: 'Payment',
        entityId: payment.id,
        actorId: input.rejectedById,
        actorType: 'STAFF',
        ip: input.ip ?? null,
        summary: input.reason,
      });
      return { ok: true };
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
  );
}

// ── Refunds ────────────────────────────────────────────────────────────

export type RequestRefundInput = {
  orderId: string;
  paymentId?: string | null;
  amountToman: number;
  reason: string;
  method?: 'WALLET' | 'GATEWAY' | 'MANUAL';
  requestedById: string;
};

export async function requestRefund(
  input: RequestRefundInput,
): Promise<{ ok: true; refundId: string } | { ok: false; error: string }> {
  if (!Number.isInteger(input.amountToman) || input.amountToman <= 0) {
    return { ok: false, error: 'مبلغ بازپرداخت نامعتبر است.' };
  }

  const order = await db.order.findUnique({
    where: { id: input.orderId },
    include: { refunds: { where: { status: { in: ['PROCESSED', 'APPROVED'] } } } },
  });
  if (!order) return { ok: false, error: 'سفارش یافت نشد.' };

  const alreadyCommitted = order.refunds.reduce((sum, r) => sum + r.amountToman, 0);
  if (alreadyCommitted + input.amountToman > order.totalToman) {
    return { ok: false, error: 'مجموع بازپرداخت‌ها از مبلغ سفارش بیشتر می‌شود.' };
  }

  const refund = await db.refund.create({
    data: {
      orderId: order.id,
      paymentId: input.paymentId ?? null,
      amountToman: input.amountToman,
      reason: input.reason,
      method: input.method ?? 'WALLET',
      status: 'REQUESTED',
      requestedById: input.requestedById,
    },
  });

  await audit({
    action: 'refund.request',
    entity: 'Refund',
    entityId: refund.id,
    actorId: input.requestedById,
    summary: `درخواست بازپرداخت ${input.amountToman} تومان برای سفارش ${order.orderNumber}`,
  });

  return { ok: true, refundId: refund.id };
}

async function sumProcessedRefunds(orderId: string): Promise<number> {
  const rows = await db.refund.findMany({ where: { orderId, status: 'PROCESSED' }, select: { amountToman: true } });
  return rows.reduce((sum, r) => sum + r.amountToman, 0);
}

async function creditWalletForRefund(refund: {
  id: string;
  orderId: string;
  amountToman: number;
  reason: string;
}): Promise<{ ok: boolean; messageFa: string }> {
  const order = await db.order.findUnique({ where: { id: refund.orderId }, select: { userId: true } });
  if (!order?.userId) {
    return { ok: false, messageFa: 'این سفارش کاربر مهمان است و کیف پول برای بازپرداخت ندارد.' };
  }
  const userId = order.userId;
  const idempotencyKey = `refund-credit:${refund.id}`;
  const existing = await db.walletTransaction.findUnique({ where: { idempotencyKey } });
  if (existing) return { ok: true, messageFa: 'مبلغ قبلاً به کیف پول واریز شده بود.' };

  try {
    await db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { walletBalance: { increment: refund.amountToman } },
      });
      await tx.walletTransaction.create({
        data: {
          userId,
          type: 'CREDIT',
          amountToman: refund.amountToman,
          balanceAfter: user.walletBalance,
          reason: `بازپرداخت سفارش: ${refund.reason}`,
          orderId: refund.orderId,
          idempotencyKey,
        },
      });
    });
    return { ok: true, messageFa: 'مبلغ به کیف پول واریز شد.' };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { ok: true, messageFa: 'مبلغ قبلاً به کیف پول واریز شده بود.' };
    }
    logger.error('creditWalletForRefund failed', { err: err instanceof Error ? err.message : String(err) });
    return { ok: false, messageFa: 'واریز مبلغ بازپرداخت به کیف پول با خطا مواجه شد.' };
  }
}

export async function processRefund(input: {
  refundId: string;
  approvedById: string;
  adminNote?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const refund = await db.refund.findUnique({
    where: { id: input.refundId },
    include: { order: true, payment: true },
  });
  if (!refund) return { ok: false, error: 'درخواست بازپرداخت یافت نشد.' };
  if (refund.status !== 'REQUESTED') return { ok: false, error: 'این بازپرداخت قبلاً پردازش شده است.' };

  await db.refund.update({
    where: { id: refund.id },
    data: { status: 'APPROVED', approvedById: input.approvedById, adminNote: input.adminNote ?? null },
  });

  let execResult: { ok: boolean; messageFa: string };
  if (refund.method === 'GATEWAY') {
    const gateway = refund.payment ? getGatewayUnchecked(refund.payment.gateway) : null;
    if (!gateway?.refund) {
      execResult = {
        ok: false,
        messageFa: `درگاه «${refund.payment?.gateway ?? 'نامشخص'}» بازگشت وجه خودکار را پشتیبانی نمی‌کند؛ بازپرداخت را از طریق کیف پول یا به‌صورت دستی ثبت کنید.`,
      };
    } else if (!refund.payment?.refId) {
      execResult = { ok: false, messageFa: 'تراکنش اصلی فاقد شماره پیگیری (refId) است.' };
    } else {
      execResult = await gateway.refund({
        refId: refund.payment.refId,
        amountToman: refund.amountToman,
        reason: refund.reason,
      });
    }
  } else if (refund.method === 'MANUAL') {
    execResult = { ok: true, messageFa: 'بازپرداخت دستی توسط تیم مالی ثبت شد.' };
  } else {
    execResult = await creditWalletForRefund(refund);
  }

  if (!execResult.ok) {
    await db.refund.update({ where: { id: refund.id }, data: { status: 'FAILED', adminNote: execResult.messageFa } });
    await audit({
      action: 'refund.process.failed',
      entity: 'Refund',
      entityId: refund.id,
      actorId: input.approvedById,
      actorType: 'STAFF',
      summary: execResult.messageFa,
    });
    return { ok: false, error: execResult.messageFa };
  }

  const processedAt = new Date();
  await db.refund.update({ where: { id: refund.id }, data: { status: 'PROCESSED', processedAt } });

  const order = refund.order;
  const totalRefunded = await sumProcessedRefunds(order.id);
  const settled = totalRefunded >= order.totalToman ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

  await db.order.update({ where: { id: order.id }, data: { paymentStatus: settled, status: settled } });
  await db.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: settled,
      field: 'status',
      actorId: input.approvedById,
      actorType: 'STAFF',
      note: refund.reason,
    },
  });
  await enqueueJob(db, {
    type: 'notify',
    payload: { template: 'refund.processed', userId: order.userId ?? undefined, orderId: order.id, channel: 'IN_APP' },
    idempotencyKey: `notify:${order.id}:refund:${refund.id}`,
  });

  await audit({
    action: 'refund.process.success',
    entity: 'Refund',
    entityId: refund.id,
    actorId: input.approvedById,
    actorType: 'STAFF',
    summary: `بازپرداخت ${refund.amountToman} تومان برای سفارش ${order.orderNumber} (${settled})`,
  });

  return { ok: true };
}

// ── Worker maintenance ─────────────────────────────────────────────────

/** Expires PENDING payments whose `expiresAt` has passed. Called by the background worker. */
export async function expireStalePayments(limit = 100): Promise<number> {
  const stale = await db.payment.findMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    take: limit,
    select: { id: true },
  });

  let count = 0;
  for (const { id } of stale) {
    try {
      await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "payments" WHERE id = ${id} FOR UPDATE`;
          const payment = await tx.payment.findUniqueOrThrow({ where: { id } });
          if (payment.status !== 'PENDING') return; // raced with a real callback — leave it alone
          const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'EXPIRED', failureReason: 'مهلت پرداخت به پایان رسید.' },
          });
          await settleUnpaidOrder(tx, order, 'EXPIRED');
          await enqueueJob(tx, {
            type: 'release-reservation',
            payload: { orderId: order.id },
            idempotencyKey: `release:${order.id}`,
          });
        },
        { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
      );
      count++;
    } catch (err) {
      logger.error('expireStalePayments: failed for one payment', {
        paymentId: id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (count > 0) {
    await audit({ action: 'payment.expire_stale', entity: 'Payment', summary: `${count} پرداخت منقضی‌شده به‌روزرسانی شد.` });
  }
  return count;
}
