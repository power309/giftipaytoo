import 'server-only';
import { db } from '../db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type {
  PaymentGateway,
  PaymentInitInput,
  PaymentInitResult,
  PaymentVerifyInput,
  PaymentVerifyResult,
} from './types';

/**
 * Internal wallet "gateway" — no external redirect, no network call.
 *
 * Money moves exactly once, inside `verify()`, guarded by a unique
 * `WalletTransaction.idempotencyKey` so a replayed/duplicated callback can
 * never double-debit the customer. `init()` only *checks* the balance — it
 * never moves money — and mints a deterministic internal authority string
 * that encodes the order id, so `verify()` can recover which order (and
 * therefore which user) is being charged without the shared `PaymentGateway`
 * interface needing a `userId` field.
 *
 * The redirect URL still points at the standard
 * `/api/payments/wallet/callback` route so the checkout flow shape stays
 * identical to every external gateway — the browser just bounces straight
 * back through our own server instead of leaving the site.
 */

const AUTHORITY_PREFIX = 'wallet';

function buildAuthority(orderId: string, idempotencyKey: string): string {
  // Deterministic: re-`init`-ing the same attempt (same idempotencyKey)
  // always yields the same authority, so a retried "pay with wallet" click
  // never mints a second pending attempt for the same order.
  return `${AUTHORITY_PREFIX}:${orderId}:${idempotencyKey}`;
}

function parseAuthority(authority: string): { orderId: string } | null {
  const parts = authority.split(':');
  if (parts.length < 3 || parts[0] !== AUTHORITY_PREFIX) return null;
  const orderId = parts[1];
  if (!orderId) return null;
  return { orderId };
}

class InsufficientBalanceError extends Error {}

export class WalletGateway implements PaymentGateway {
  readonly key = 'wallet';
  readonly labelFa = 'کیف پول';
  // No sandbox/production distinction for an internal ledger; it always
  // reflects the environment's own real balances.
  readonly mode = 'production' as const;

  isConfigured(): boolean {
    return true; // no external credentials; admins gate it via `payment.gateways.enabled`
  }

  async init(input: PaymentInitInput): Promise<PaymentInitResult> {
    const order = await db.order.findUnique({
      where: { id: input.orderId },
      select: { userId: true },
    });
    if (!order?.userId) {
      return {
        ok: false,
        code: 'LOGIN_REQUIRED',
        messageFa: 'برای پرداخت با کیف پول باید وارد حساب کاربری خود شوید.',
      };
    }

    const user = await db.user.findUnique({
      where: { id: order.userId },
      select: { walletBalance: true },
    });
    if (!user || user.walletBalance < input.amountToman) {
      return {
        ok: false,
        code: 'INSUFFICIENT_BALANCE',
        messageFa: 'موجودی کیف پول شما برای این پرداخت کافی نیست.',
      };
    }

    const authority = buildAuthority(input.orderId, input.idempotencyKey);
    const redirectUrl = `${env.appUrl}/api/payments/wallet/callback?Authority=${encodeURIComponent(authority)}&Status=OK`;
    return { ok: true, redirectUrl, authority };
  }

  async verify(input: PaymentVerifyInput): Promise<PaymentVerifyResult> {
    const parsed = parseAuthority(input.authority);
    if (!parsed) {
      return { ok: false, code: 'INVALID_AUTHORITY', messageFa: 'شناسه تراکنش کیف پول نامعتبر است.' };
    }

    const order = await db.order.findUnique({
      where: { id: parsed.orderId },
      select: { userId: true },
    });
    if (!order?.userId) {
      return { ok: false, code: 'ORDER_NOT_FOUND', messageFa: 'سفارش برای برداشت از کیف پول یافت نشد.' };
    }
    const userId = order.userId;

    const idempotencyKey = `wallet-debit:${input.authority}`;

    // Replay guard #1 — a fast, cheap read before touching the balance.
    const existing = await db.walletTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) {
      logger.info('wallet.verify: idempotent replay, no re-debit', { orderId: parsed.orderId });
      return { ok: true, refId: existing.id, cardPanMasked: null };
    }

    try {
      const walletTx = await db.$transaction(async (tx) => {
        // Atomic, race-safe debit: the WHERE clause re-checks the balance
        // at UPDATE time under the row lock Postgres takes for the write,
        // so two concurrent debits of the same user can never both succeed
        // past the balance they actually have.
        const debited = await tx.user.updateMany({
          where: { id: userId, walletBalance: { gte: input.amountToman } },
          data: { walletBalance: { decrement: input.amountToman } },
        });
        if (debited.count === 0) throw new InsufficientBalanceError();

        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { walletBalance: true },
        });

        return tx.walletTransaction.create({
          data: {
            userId,
            type: 'DEBIT',
            amountToman: input.amountToman,
            balanceAfter: user.walletBalance,
            reason: `پرداخت سفارش ${parsed.orderId}`,
            orderId: parsed.orderId,
            idempotencyKey,
          },
        });
      });

      return { ok: true, refId: walletTx.id, cardPanMasked: null };
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return { ok: false, code: 'INSUFFICIENT_BALANCE', messageFa: 'موجودی کیف پول شما برای این پرداخت کافی نیست.' };
      }
      // Race: two concurrent verify() calls both passed replay guard #1
      // before either committed — the unique constraint on
      // WalletTransaction.idempotencyKey is the final backstop.
      if (isUniqueConstraintError(err)) {
        const raced = await db.walletTransaction.findUnique({ where: { idempotencyKey } });
        if (raced) {
          logger.info('wallet.verify: idempotent race resolved via unique constraint');
          return { ok: true, refId: raced.id, cardPanMasked: null };
        }
      }
      logger.error('wallet.verify: unexpected failure', { err: err instanceof Error ? err.message : String(err) });
      return { ok: false, code: 'INTERNAL_ERROR', messageFa: 'برداشت از کیف پول با خطا مواجه شد.' };
    }
  }

  async refund(input: { refId: string; amountToman: number; reason: string }) {
    // `refId` is the id of the original debit `WalletTransaction`.
    const original = await db.walletTransaction.findUnique({ where: { id: input.refId } });
    if (!original || original.type !== 'DEBIT') {
      return { ok: false, messageFa: 'تراکنش کیف پول اصلی برای بازگشت وجه یافت نشد.' };
    }
    const idempotencyKey = `wallet-refund:${input.refId}`;
    const existing = await db.walletTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return { ok: true, messageFa: 'مبلغ قبلاً به کیف پول بازگشته است.' };
    }
    try {
      await db.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: original.userId },
          data: { walletBalance: { increment: input.amountToman } },
        });
        await tx.walletTransaction.create({
          data: {
            userId: original.userId,
            type: 'CREDIT',
            amountToman: input.amountToman,
            balanceAfter: user.walletBalance,
            reason: `بازگشت وجه: ${input.reason}`,
            orderId: original.orderId,
            idempotencyKey,
          },
        });
      });
      return { ok: true, messageFa: 'مبلغ به کیف پول بازگشت داده شد.' };
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return { ok: true, messageFa: 'مبلغ قبلاً به کیف پول بازگشته است.' };
      }
      logger.error('wallet.refund: unexpected failure', { err: err instanceof Error ? err.message : String(err) });
      return { ok: false, messageFa: 'بازگشت وجه به کیف پول با خطا مواجه شد.' };
    }
  }

  parseCallback(params: URLSearchParams): { authority: string | null; canceled: boolean } {
    const authority = params.get('Authority');
    const status = params.get('Status');
    return { authority, canceled: status !== 'OK' };
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002';
}

export const walletGateway = new WalletGateway();
