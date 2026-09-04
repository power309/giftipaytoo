import 'server-only';
import { db } from './db';
import { getSetting } from './settings';

/**
 * Configurable, honest risk engine used at checkout.
 *
 * `scoreOrder` never blocks anything by itself — it only produces a score
 * and a list of flags, each carrying a Persian explanation of what the
 * customer would need to do. The caller (`orders.ts`) decides what to do
 * with that score via `requiresVerification` / `requiresManualReview`, and
 * is responsible for surfacing the explanation rather than failing silently.
 *
 * Every threshold is read from `Setting` (group `risk`) via `getSetting`,
 * each with a sane default, so tuning the engine never requires a
 * deployment. Some of these keys are not yet registered in
 * `SETTINGS_SCHEMA` (see docs/AUTH.md's seam list) — `getSetting` degrades
 * to the given fallback for any key it can't find, so this still behaves
 * correctly today and picks up admin-configured values once registered.
 */

export type RiskFlag = {
  code: string;
  weight: number;
  messageFa: string;
};

export type RiskScore = {
  score: number;
  flags: RiskFlag[];
};

export type ScoreOrderInput = {
  user: {
    id: string;
    createdAt: Date;
    emailVerified: boolean;
    phoneVerified: boolean;
  } | null;
  ip: string;
  userAgent: string;
  lines: { variantId: string; qty: number; unitPriceToman: number }[];
  totalToman: number;
  isGuest: boolean;
};

async function riskSetting(key: string, fallback: number): Promise<number> {
  return getSetting<number>(key, fallback);
}

export async function scoreOrder(input: ScoreOrderInput): Promise<RiskScore> {
  const flags: RiskFlag[] = [];

  const [
    guestThreshold,
    highValueThreshold,
    highDenomToman,
    highDenomLineCount,
    failedPaymentThreshold,
    failedPaymentWindowMinutes,
    newAccountHours,
    sharedIpAccountThreshold,
    sharedIpWindowHours,
    velocityOrderCount,
    velocityWindowMinutes,
  ] = await Promise.all([
    riskSetting('risk.guestThresholdToman', 5_000_000),
    riskSetting('risk.manualReviewThresholdToman', 20_000_000),
    riskSetting('risk.highDenomToman', 3_000_000),
    riskSetting('risk.highDenomLineCount', 3),
    riskSetting('risk.failedPaymentThreshold', 3),
    riskSetting('risk.failedPaymentWindowMinutes', 60),
    riskSetting('risk.newAccountHours', 2),
    riskSetting('risk.sharedIpAccountThreshold', 3),
    riskSetting('risk.sharedIpWindowHours', 24),
    riskSetting('risk.velocityOrderCount', 5),
    riskSetting('risk.velocityWindowMinutes', 60),
  ]);

  // ── Unverified contact ──────────────────────────────────────
  const contactVerified = input.user ? input.user.emailVerified || input.user.phoneVerified : false;
  if (!contactVerified) {
    flags.push({
      code: 'UNVERIFIED_CONTACT',
      weight: 15,
      messageFa: 'برای تکمیل این سفارش، تأیید شماره موبایل یا ایمیل لازم است.',
    });
  }

  // ── Guest checkout above threshold ──────────────────────────
  if (input.isGuest && input.totalToman >= guestThreshold) {
    flags.push({
      code: 'GUEST_HIGH_VALUE',
      weight: 20,
      messageFa: 'برای سفارش‌های بالای این مبلغ به‌صورت مهمان، لطفاً وارد حساب کاربری خود شوید یا ثبت‌نام کنید.',
    });
  }

  // ── High-value order ─────────────────────────────────────────
  if (input.totalToman >= highValueThreshold) {
    flags.push({
      code: 'HIGH_VALUE_ORDER',
      weight: 25,
      messageFa: 'این سفارش به دلیل مبلغ بالا نیاز به بررسی دستی تیم پشتیبانی دارد.',
    });
  }

  // ── Many distinct high-denomination lines ───────────────────
  const highDenomLines = input.lines.filter((l) => l.unitPriceToman >= highDenomToman).length;
  if (highDenomLines >= highDenomLineCount) {
    flags.push({
      code: 'MANY_HIGH_DENOM',
      weight: 15,
      messageFa: 'سفارش شامل چند کالای پرمبلغ است و برای تکمیل نیاز به بررسی دارد.',
    });
  }

  // ── Repeated failed payments from this IP ───────────────────
  if (input.ip && input.ip !== '0.0.0.0') {
    const since = new Date(Date.now() - failedPaymentWindowMinutes * 60_000);
    const failedCount = await db.payment.count({
      where: {
        status: { in: ['VERIFICATION_FAILED', 'FAILED'] },
        startedAt: { gte: since },
        order: { ip: input.ip },
      },
    });
    if (failedCount >= failedPaymentThreshold) {
      flags.push({
        code: 'REPEATED_FAILED_PAYMENTS',
        weight: 25,
        messageFa: 'به دلیل تلاش‌های ناموفق پرداخت اخیر، این سفارش نیاز به تأیید هویت دارد.',
      });
    }
  }

  // ── New account ──────────────────────────────────────────────
  if (input.user) {
    const ageHours = (Date.now() - input.user.createdAt.getTime()) / 3600_000;
    if (ageHours <= newAccountHours) {
      flags.push({
        code: 'NEW_ACCOUNT',
        weight: 10,
        messageFa: 'حساب کاربری شما تازه ایجاد شده و این سفارش نیاز به بررسی دارد.',
      });
    }
  }

  // ── Several accounts sharing this IP recently ───────────────
  if (input.ip && input.ip !== '0.0.0.0') {
    const since = new Date(Date.now() - sharedIpWindowHours * 3600_000);
    const distinctUsers = await db.order.findMany({
      where: { ip: input.ip, createdAt: { gte: since }, userId: { not: null } },
      distinct: ['userId'],
      select: { userId: true },
    });
    if (distinctUsers.length >= sharedIpAccountThreshold) {
      flags.push({
        code: 'SHARED_IP_MULTI_ACCOUNT',
        weight: 20,
        messageFa: 'چند حساب کاربری اخیراً از این اتصال سفارش ثبت کرده‌اند؛ این سفارش نیاز به بررسی دارد.',
      });
    }
  }

  // ── Order velocity vs. history ──────────────────────────────
  if (input.user) {
    const since = new Date(Date.now() - velocityWindowMinutes * 60_000);
    const recentOrders = await db.order.count({ where: { userId: input.user.id, createdAt: { gte: since } } });
    if (recentOrders >= velocityOrderCount) {
      flags.push({
        code: 'VELOCITY_ANOMALY',
        weight: 20,
        messageFa: 'تعداد سفارش‌های اخیر شما بیش از حد معمول است و این سفارش نیاز به بررسی دارد.',
      });
    }
  }

  const score = Math.min(100, flags.reduce((acc, f) => acc + f.weight, 0));
  return { score, flags };
}

export async function requiresVerification(score: number): Promise<boolean> {
  const threshold = await riskSetting('risk.verificationScore', 30);
  return score >= threshold;
}

export async function requiresManualReview(score: number): Promise<boolean> {
  const threshold = await riskSetting('risk.manualReviewScore', 60);
  return score >= threshold;
}

/** Joins every flag's explanation into one customer-facing Persian message. */
export function explainFa(flags: RiskFlag[]): string {
  if (flags.length === 0) return '';
  const unique = Array.from(new Set(flags.map((f) => f.messageFa)));
  return unique.join(' ');
}
