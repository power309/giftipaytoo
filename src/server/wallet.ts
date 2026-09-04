import 'server-only';
import { db } from './db';
import { assertToman } from '@/lib/money';
import { assertPermission } from './auth/guard';
import { audit } from './audit';
import { logger } from '@/lib/logger';

/**
 * Wallet ledger: every balance change is a transaction inside a database
 * transaction, snapshotting `balanceAfter` on the row itself so the ledger
 * is self-auditing without needing to replay history. `debit` can never
 * push the balance negative — the guard is enforced by the database itself
 * (an `updateMany` whose `WHERE` clause re-checks the balance under the row
 * lock the UPDATE takes), not just by an application-level read-then-write,
 * so two concurrent debits can never both succeed past the real balance.
 *
 * Pass `idempotencyKey` for any caller that might retry (payment callbacks,
 * job handlers) — a repeated call with the same key is a no-op that returns
 * the original transaction instead of moving money twice.
 */

export class InsufficientBalanceError extends Error {
  constructor() {
    super('موجودی کیف پول کافی نیست.');
    this.name = 'InsufficientBalanceError';
  }
}

export async function getBalance(userId: string): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { walletBalance: true } });
  return user?.walletBalance ?? 0;
}

export type WalletMoveResult = { balanceAfter: number; transactionId: string; idempotentReplay: boolean };

async function findByIdempotencyKey(idempotencyKey: string) {
  return db.walletTransaction.findUnique({ where: { idempotencyKey } });
}

/** Credits (adds to) a user's wallet balance. */
export async function credit(input: {
  userId: string;
  amountToman: number;
  reason: string;
  orderId?: string | null;
  actorId?: string | null;
  idempotencyKey?: string | null;
}): Promise<WalletMoveResult> {
  assertToman(input.amountToman, 'مبلغ کیف پول');
  if (input.amountToman <= 0) throw new Error('مبلغ واریز به کیف پول باید مثبت باشد.');

  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return { balanceAfter: existing.balanceAfter, transactionId: existing.id, idempotentReplay: true };
    }
  }

  const tx = await db.$transaction(async (t) => {
    const user = await t.user.update({
      where: { id: input.userId },
      data: { walletBalance: { increment: input.amountToman } },
    });
    return t.walletTransaction.create({
      data: {
        userId: input.userId,
        type: 'CREDIT',
        amountToman: input.amountToman,
        balanceAfter: user.walletBalance,
        reason: input.reason,
        orderId: input.orderId ?? null,
        actorId: input.actorId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
  });

  await audit({
    action: 'wallet.credit',
    entity: 'User',
    entityId: input.userId,
    actorId: input.actorId ?? null,
    summary: input.reason,
    after: { amountToman: input.amountToman, balanceAfter: tx.balanceAfter, orderId: input.orderId ?? null },
  });

  return { balanceAfter: tx.balanceAfter, transactionId: tx.id, idempotentReplay: false };
}

/** Debits (subtracts from) a user's wallet balance. Refuses to go negative. */
export async function debit(input: {
  userId: string;
  amountToman: number;
  reason: string;
  orderId?: string | null;
  actorId?: string | null;
  idempotencyKey?: string | null;
}): Promise<WalletMoveResult> {
  assertToman(input.amountToman, 'مبلغ کیف پول');
  if (input.amountToman <= 0) throw new Error('مبلغ برداشت از کیف پول باید مثبت باشد.');

  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return { balanceAfter: existing.balanceAfter, transactionId: existing.id, idempotentReplay: true };
    }
  }

  try {
    const tx = await db.$transaction(async (t) => {
      const guarded = await t.user.updateMany({
        where: { id: input.userId, walletBalance: { gte: input.amountToman } },
        data: { walletBalance: { decrement: input.amountToman } },
      });
      if (guarded.count === 0) throw new InsufficientBalanceError();

      const user = await t.user.findUniqueOrThrow({ where: { id: input.userId }, select: { walletBalance: true } });
      return t.walletTransaction.create({
        data: {
          userId: input.userId,
          type: 'DEBIT',
          amountToman: input.amountToman,
          balanceAfter: user.walletBalance,
          reason: input.reason,
          orderId: input.orderId ?? null,
          actorId: input.actorId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
    });

    await audit({
      action: 'wallet.debit',
      entity: 'User',
      entityId: input.userId,
      actorId: input.actorId ?? null,
      summary: input.reason,
      after: { amountToman: input.amountToman, balanceAfter: tx.balanceAfter, orderId: input.orderId ?? null },
    });

    return { balanceAfter: tx.balanceAfter, transactionId: tx.id, idempotentReplay: false };
  } catch (err) {
    if (err instanceof InsufficientBalanceError) throw err;
    if (isUniqueConstraintError(err) && input.idempotencyKey) {
      const raced = await findByIdempotencyKey(input.idempotencyKey);
      if (raced) return { balanceAfter: raced.balanceAfter, transactionId: raced.id, idempotentReplay: true };
    }
    logger.error('wallet.debit: unexpected failure', { err: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

/** Admin-initiated wallet credit — requires `customer.wallet`. */
export async function adminCredit(input: {
  userId: string;
  amountToman: number;
  reason: string;
}): Promise<WalletMoveResult> {
  const staff = await assertPermission('customer.wallet');
  return credit({ ...input, actorId: staff.id });
}

/** Admin-initiated wallet debit — requires `customer.wallet`. */
export async function adminDebit(input: {
  userId: string;
  amountToman: number;
  reason: string;
}): Promise<WalletMoveResult> {
  const staff = await assertPermission('customer.wallet');
  return debit({ ...input, actorId: staff.id });
}

export async function listTransactions(userId: string, opts: { take?: number; cursor?: string } = {}) {
  return db.walletTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 20,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
  });
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

// ── Loyalty points ─────────────────────────────────────────────────

/** Points earned per 1,000 Toman of a paid order, before rounding down. */
const DEFAULT_POINTS_PER_1000_TOMAN = 1;

export async function awardPoints(orderId: string, opts: { pointsPer1000?: number } = {}): Promise<number> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, totalToman: true },
  });
  if (!order?.userId) return 0;

  const existing = await db.loyaltyTransaction.findFirst({ where: { orderId: order.id, points: { gt: 0 } } });
  if (existing) return 0; // already awarded — idempotent per order

  const rate = opts.pointsPer1000 ?? DEFAULT_POINTS_PER_1000_TOMAN;
  const points = Math.floor((order.totalToman / 1000) * rate);
  if (points <= 0) return 0;

  await db.$transaction(async (t) => {
    const user = await t.user.update({ where: { id: order.userId! }, data: { loyaltyPoints: { increment: points } } });
    await t.loyaltyTransaction.create({
      data: {
        userId: order.userId!,
        points,
        balanceAfter: user.loyaltyPoints,
        reason: `امتیاز خرید سفارش ${order.id}`,
        orderId: order.id,
      },
    });
  });

  return points;
}

export type RedeemPointsResult = { ok: true; discountToman: number } | { ok: false; error: string };

/** Redeems loyalty points for a Toman discount at a configurable conversion rate. */
export async function redeemPoints(input: {
  userId: string;
  points: number;
  tomanPerPoint?: number;
  orderId?: string | null;
}): Promise<RedeemPointsResult> {
  if (!Number.isInteger(input.points) || input.points <= 0) {
    return { ok: false, error: 'تعداد امتیاز نامعتبر است.' };
  }
  const tomanPerPoint = input.tomanPerPoint ?? 100;

  try {
    const result = await db.$transaction(async (t) => {
      const guarded = await t.user.updateMany({
        where: { id: input.userId, loyaltyPoints: { gte: input.points } },
        data: { loyaltyPoints: { decrement: input.points } },
      });
      if (guarded.count === 0) throw new Error('امتیاز کافی برای این تبدیل وجود ندارد.');

      const user = await t.user.findUniqueOrThrow({ where: { id: input.userId }, select: { loyaltyPoints: true } });
      await t.loyaltyTransaction.create({
        data: {
          userId: input.userId,
          points: -input.points,
          balanceAfter: user.loyaltyPoints,
          reason: 'تبدیل امتیاز به تخفیف',
          orderId: input.orderId ?? null,
        },
      });
      return input.points * tomanPerPoint;
    });

    return { ok: true, discountToman: result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'تبدیل امتیاز ناموفق بود.' };
  }
}
