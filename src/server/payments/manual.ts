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
 * Offline / bank-transfer gateway.
 *
 * There is no automated proof of payment for a manual bank transfer — a
 * staff member has to look at the bank statement and confirm it. So unlike
 * every other gateway, `verify()` here NEVER reports success: it always
 * returns `AWAITING_MANUAL_REVIEW`, and `service.ts` maps that to
 * `Order.status = 'UNDER_REVIEW'` / `Payment.status = 'PROCESSING'` rather
 * than PAID. The actual PAID transition only happens later, through
 * `confirmManualPayment()` in `service.ts`, which a staff member triggers
 * from the admin order-review screen after checking the bank statement.
 * This file never fabricates a successful payment.
 */

const SETTING_KEY = 'payment.manual.enabled';
const AUTHORITY_PREFIX = 'manual';

function buildAuthority(orderId: string, idempotencyKey: string): string {
  return `${AUTHORITY_PREFIX}:${orderId}:${idempotencyKey}`;
}

function parseAuthority(authority: string): { orderId: string } | null {
  const parts = authority.split(':');
  if (parts.length < 3 || parts[0] !== AUTHORITY_PREFIX) return null;
  const orderId = parts[1];
  if (!orderId) return null;
  return { orderId };
}

async function readEnabledSetting(): Promise<boolean> {
  try {
    const row = await db.setting.findUnique({ where: { key: SETTING_KEY } });
    return row?.value === true;
  } catch (err) {
    logger.error('manual: failed reading payment.manual.enabled setting', {
      err: err instanceof Error ? err.message : String(err),
    });
    return false; // fail closed — never silently allow an unconfigured/unknown state
  }
}

export class ManualGateway implements PaymentGateway {
  readonly key = 'manual';
  readonly labelFa = 'واریز بانکی (آفلاین)';
  readonly mode = 'production' as const;

  /**
   * Best-effort synchronous snapshot for the `PaymentGateway` interface
   * contract (`isConfigured` is sync). The authoritative check is always
   * the async DB read in `init()` / `refreshEnabled()` — this cache exists
   * only so callers that haven't awaited a refresh yet see a safe `false`
   * rather than a stale `true`.
   */
  private cachedEnabled = false;

  isConfigured(): boolean {
    return this.cachedEnabled;
  }

  /** Authoritative async check; also updates the sync cache. Used by the registry. */
  async refreshEnabled(): Promise<boolean> {
    this.cachedEnabled = await readEnabledSetting();
    return this.cachedEnabled;
  }

  async init(input: PaymentInitInput): Promise<PaymentInitResult> {
    const enabled = await this.refreshEnabled();
    if (!enabled) {
      return { ok: false, code: 'NOT_CONFIGURED', messageFa: 'پرداخت واریز بانکی در حال حاضر فعال نیست.' };
    }
    const authority = buildAuthority(input.orderId, input.idempotencyKey);
    const redirectUrl = `${env.appUrl}/api/payments/manual/callback?Authority=${encodeURIComponent(authority)}&Status=OK`;
    return { ok: true, redirectUrl, authority };
  }

  async verify(input: PaymentVerifyInput): Promise<PaymentVerifyResult> {
    const parsed = parseAuthority(input.authority);
    if (!parsed) {
      return { ok: false, code: 'INVALID_AUTHORITY', messageFa: 'شناسه پرداخت واریز بانکی نامعتبر است.' };
    }
    return {
      ok: false,
      code: 'AWAITING_MANUAL_REVIEW',
      messageFa: 'سفارش شما ثبت شد. پس از بررسی و تأیید واریز توسط تیم پشتیبانی، سفارش پردازش خواهد شد.',
    };
  }

  parseCallback(params: URLSearchParams): { authority: string | null; canceled: boolean } {
    const authority = params.get('Authority');
    const status = params.get('Status');
    return { authority, canceled: status !== 'OK' };
  }
}

export const manualGateway = new ManualGateway();
