import 'server-only';
import { z } from 'zod';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { retry } from '@/lib/utils';
import type { PaymentGateway, PaymentInitInput, PaymentInitResult, PaymentVerifyInput, PaymentVerifyResult } from './types';

/**
 * ZarinPal REST API (v4) adapter.
 *
 * ── THE RIAL/TOMAN GOTCHA ────────────────────────────────────────────────
 * Every amount in this codebase is an integer number of **Toman**
 * (see `src/lib/money.ts`). ZarinPal's v4 API, however, always takes
 * `amount` in **Rial** (1 Toman = 10 Rial). Every amount sent to or read
 * back from ZarinPal in this file is converted with `tomanToRial` /
 * `rialToToman` — never send `amountToman` to ZarinPal directly.
 * Getting this wrong either overcharges customers 10x or undercharges 10x,
 * so both conversion points are isolated in the two functions below and
 * covered by unit tests.
 *
 * ── SANDBOX / PRODUCTION SEPARATION ──────────────────────────────────────
 * The host is picked strictly from `ZARINPAL_MODE`. Sandbox and production
 * hosts (and therefore merchant IDs/credentials) must never mix — sending a
 * sandbox authority to the production verify endpoint (or vice versa) always
 * fails, so accidental cross-talk fails closed rather than silently charging
 * the wrong account.
 */

const RIAL_PER_TOMAN = 10;

export function tomanToRial(amountToman: number): number {
  if (!Number.isInteger(amountToman) || amountToman < 0) {
    throw new Error('مبلغ برای تبدیل به ریال باید عدد صحیح و غیرمنفی باشد.');
  }
  return amountToman * RIAL_PER_TOMAN;
}

export function rialToToman(amountRial: number): number {
  if (!Number.isInteger(amountRial) || amountRial < 0) {
    throw new Error('مبلغ ریالی نامعتبر است.');
  }
  return Math.round(amountRial / RIAL_PER_TOMAN);
}

const HOSTS = {
  production: 'https://payment.zarinpal.com',
  sandbox: 'https://sandbox.zarinpal.com',
} as const;

/**
 * ZarinPal status-code → Persian message map.
 * https://docs.zarinpal.com — codes are shared between request.json and verify.json.
 * 100 and 101 are the only success-shaped codes; 101 means "already verified",
 * which is treated as success by `verify()` and flagged via `alreadyVerified`.
 */
export const ZARINPAL_STATUS_MESSAGES: Record<number, string> = {
  100: 'پرداخت با موفقیت تأیید شد.',
  101: 'این تراکنش قبلاً تأیید شده است.',
  [-9]: 'خطای اعتبارسنجی. اطلاعات ارسالی نامعتبر است.',
  [-10]: 'شناسه پذیرنده (merchant id) یا آی‌پی سرور نامعتبر است.',
  [-11]: 'تراکنش مورد نظر یافت نشد.',
  [-12]: 'امکان ویرایش این تراکنش وجود ندارد.',
  [-15]: 'درگاه پرداخت فعال نیست.',
  [-16]: 'سطح تأیید پذیرنده کافی نیست.',
  [-17]: 'درگاه پرداخت به دلیل تخلف، محدود شده است.',
  [-30]: 'اجازه دسترسی به این متد برای این پذیرنده وجود ندارد.',
  [-31]: 'حساب بانکی متصل به این پذیرنده معتبر نیست.',
  [-32]: 'مقادیر ارسالی نامعتبر است.',
  [-33]: 'مبلغ تراکنش با مبلغ پرداخت‌شده مطابقت ندارد.',
  [-34]: 'سقف تراکنش تعیین‌شده برای پذیرنده رد شده است.',
  [-40]: 'اجازه دسترسی به اطلاعات این تراکنش وجود ندارد.',
  [-41]: 'اطلاعات ارسالی (metadata) نامعتبر است.',
  [-42]: 'مدت زمان اعتبار authority نامعتبر است.',
  [-50]: 'مبلغ پرداخت‌شده با مبلغ درخواست مطابقت ندارد.',
  [-51]: 'پرداخت توسط کاربر ناموفق بود یا لغو شد.',
  [-52]: 'خطای پیش‌بینی‌نشده در سمت درگاه پرداخت رخ داد.',
  [-53]: 'این تراکنش متعلق به این پذیرنده نیست.',
  [-54]: 'این authority نامعتبر یا بایگانی‌شده است.',
};

export function messageFor(code: number): string {
  return ZARINPAL_STATUS_MESSAGES[code] ?? `خطای نامشخص درگاه پرداخت زرین‌پال (کد ${code}).`;
}

/** ZarinPal reports success either as 100 (fresh) or 101 (already verified). */
export function isSuccessCode(code: number): boolean {
  return code === 100 || code === 101;
}

const requestResponseSchema = z.object({
  data: z
    .object({
      code: z.number(),
      message: z.string().optional(),
      authority: z.string().optional(),
      fee_type: z.string().optional(),
      fee: z.number().optional(),
    })
    .nullable()
    .optional(),
  errors: z
    .union([z.object({ code: z.number().optional(), message: z.string().optional() }), z.array(z.unknown())])
    .nullable()
    .optional(),
});

const verifyResponseSchema = z.object({
  data: z
    .object({
      code: z.number(),
      message: z.string().optional(),
      card_hash: z.string().optional(),
      card_pan: z.string().optional(),
      ref_id: z.union([z.number(), z.string()]).optional(),
      fee_type: z.string().optional(),
      fee: z.number().optional(),
    })
    .nullable()
    .optional(),
  errors: z
    .union([z.object({ code: z.number().optional(), message: z.string().optional() }), z.array(z.unknown())])
    .nullable()
    .optional(),
});

const TIMEOUT_MS = 15_000;

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`پاسخ نامعتبر (غیر JSON) از درگاه پرداخت — وضعیت HTTP ${res.status}`);
  }
  // ZarinPal returns 4xx/5xx with a JSON error body for some failures too —
  // we still try to parse it above so callers can read `errors`/`data.code`.
  if (!res.ok && (json === null || typeof json !== 'object')) {
    throw new Error(`درگاه پرداخت با وضعیت HTTP ${res.status} پاسخ داد.`);
  }
  return json;
}

export class ZarinPalGateway implements PaymentGateway {
  readonly key = 'zarinpal';
  readonly labelFa = 'درگاه زرین‌پال';

  get mode(): 'sandbox' | 'production' {
    return env.zarinpal.mode === 'production' ? 'production' : 'sandbox';
  }

  isConfigured(): boolean {
    return env.zarinpal.configured;
  }

  private host(): string {
    return HOSTS[this.mode];
  }

  private startPayUrl(authority: string): string {
    return `${HOSTS[this.mode]}/pg/StartPay/${authority}`;
  }

  async init(input: PaymentInitInput): Promise<PaymentInitResult> {
    if (!this.isConfigured()) {
      logger.warn('zarinpal.init called while not configured');
      return { ok: false, code: 'NOT_CONFIGURED', messageFa: 'درگاه پرداخت پیکربندی نشده است.' };
    }

    const amountRial = tomanToRial(input.amountToman);
    const payload = {
      merchant_id: env.zarinpal.merchantId,
      amount: amountRial,
      description: input.description,
      callback_url: input.callbackUrl,
      metadata: {
        ...(input.customerEmail ? { email: input.customerEmail } : {}),
        ...(input.customerPhone ? { mobile: input.customerPhone } : {}),
        order_id: input.orderNumber,
      },
    };

    try {
      // Init (payment request) is NOT idempotent on ZarinPal's side — retrying
      // it can mint a second authority for the same order. We only retry on
      // network-level failures (thrown before we get a response), and the
      // caller (service.ts) guards against double-init with `idempotencyKey`
      // by never calling init twice for a payment already carrying an authority.
      const raw = await retry(() => postJson(`${this.host()}/pg/v4/payment/request.json`, payload), {
        attempts: 2,
        baseMs: 400,
      });
      const parsed = requestResponseSchema.safeParse(raw);
      if (!parsed.success) {
        logger.error('zarinpal.init: unexpected response shape');
        return { ok: false, code: 'BAD_RESPONSE', messageFa: 'پاسخ درگاه پرداخت قابل تشخیص نبود.', raw };
      }

      const code = parsed.data.data?.code;
      const authority = parsed.data.data?.authority;
      if (code !== undefined && isSuccessCode(code) && authority) {
        logger.info('zarinpal.init success', { orderNumber: input.orderNumber, mode: this.mode });
        return { ok: true, redirectUrl: this.startPayUrl(authority), authority, raw };
      }

      const errCode =
        code ??
        (Array.isArray(parsed.data.errors) ? undefined : parsed.data.errors?.code) ??
        -1;
      logger.warn('zarinpal.init failed', { code: errCode, orderNumber: input.orderNumber });
      return { ok: false, code: String(errCode), messageFa: messageFor(errCode), raw };
    } catch (err) {
      logger.error('zarinpal.init network error', { err: err instanceof Error ? err.message : String(err) });
      return {
        ok: false,
        code: 'NETWORK_ERROR',
        messageFa: 'ارتباط با درگاه پرداخت زرین‌پال برقرار نشد. لطفاً دوباره تلاش کنید.',
      };
    }
  }

  async verify(input: PaymentVerifyInput): Promise<PaymentVerifyResult> {
    if (!this.isConfigured()) {
      return { ok: false, code: 'NOT_CONFIGURED', messageFa: 'درگاه پرداخت پیکربندی نشده است.' };
    }

    const amountRial = tomanToRial(input.amountToman);
    const payload = {
      merchant_id: env.zarinpal.merchantId,
      amount: amountRial,
      authority: input.authority,
    };

    try {
      // Verify IS idempotent on ZarinPal's side: calling it again for an
      // authority that was already verified returns code 101 rather than
      // charging or re-charging anything, so retrying on transient network
      // failure here can never double-charge the customer.
      const raw = await retry(() => postJson(`${this.host()}/pg/v4/payment/verify.json`, payload), {
        attempts: 2,
        baseMs: 400,
      });
      const parsed = verifyResponseSchema.safeParse(raw);
      if (!parsed.success) {
        logger.error('zarinpal.verify: unexpected response shape');
        return { ok: false, code: 'BAD_RESPONSE', messageFa: 'پاسخ درگاه پرداخت قابل تشخیص نبود.', raw };
      }

      const code = parsed.data.data?.code;
      if (code !== undefined && isSuccessCode(code)) {
        const refId = String(parsed.data.data?.ref_id ?? '');
        if (!refId) {
          logger.error('zarinpal.verify: success code without ref_id');
          return { ok: false, code: 'NO_REF_ID', messageFa: 'پاسخ درگاه پرداخت فاقد شماره پیگیری بود.', raw };
        }
        logger.info('zarinpal.verify success', { code, alreadyVerified: code === 101 });
        return {
          ok: true,
          refId,
          cardPanMasked: parsed.data.data?.card_pan ?? null,
          raw,
        };
      }

      const errCode =
        code ??
        (Array.isArray(parsed.data.errors) ? undefined : parsed.data.errors?.code) ??
        -1;
      logger.warn('zarinpal.verify failed', { code: errCode });
      return { ok: false, code: String(errCode), messageFa: messageFor(errCode), raw };
    } catch (err) {
      logger.error('zarinpal.verify network error', { err: err instanceof Error ? err.message : String(err) });
      return {
        ok: false,
        code: 'NETWORK_ERROR',
        messageFa: 'تأیید پرداخت با درگاه زرین‌پال ممکن نشد. لطفاً با پشتیبانی تماس بگیرید.',
      };
    }
  }

  parseCallback(params: URLSearchParams): { authority: string | null; canceled: boolean } {
    const authority = params.get('Authority');
    const status = params.get('Status'); // 'OK' | 'NOK'
    return { authority, canceled: status !== 'OK' };
  }
}

export const zarinpalGateway = new ZarinPalGateway();
