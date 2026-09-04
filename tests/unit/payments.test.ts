import { describe, it, expect, afterEach, vi } from 'vitest';

// `server-only` throws when imported outside a react-server bundle (see
// node_modules/server-only) — vitest runs plain Node, so stub it before any
// server module is imported. Scoped to this file only.
vi.mock('server-only', () => ({}));

import { ZarinPalGateway, zarinpalGateway, tomanToRial, rialToToman, isSuccessCode, messageFor } from '@/server/payments/zarinpal';
import { walletGateway } from '@/server/payments/wallet';
import { manualGateway } from '@/server/payments/manual';
import { amountsMatch, isOrderPayable } from '@/server/payments/service';
import { verifyWebhookSignature } from '@/server/payments/webhook';
import { hmacHex } from '@/lib/crypto';

const ORIGINAL_ENV = { ...process.env };
function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

// ── Toman → Rial conversion ────────────────────────────────────────────────

describe('zarinpal: Toman/Rial conversion', () => {
  it('multiplies Toman by 10 to get Rial (ZarinPal v4 always takes Rial)', () => {
    expect(tomanToRial(1000)).toBe(10_000);
    expect(tomanToRial(1)).toBe(10);
    expect(tomanToRial(0)).toBe(0);
  });

  it('divides Rial by 10 to get Toman back', () => {
    expect(rialToToman(10_000)).toBe(1000);
    expect(rialToToman(10)).toBe(1);
  });

  it('round-trips exactly for whole-Toman amounts', () => {
    for (const toman of [1, 100, 1500, 250_000, 999_999]) {
      expect(rialToToman(tomanToRial(toman))).toBe(toman);
    }
  });

  it('rejects non-integer or negative Toman amounts rather than silently truncating', () => {
    expect(() => tomanToRial(10.5)).toThrow();
    expect(() => tomanToRial(-5)).toThrow();
    expect(() => rialToToman(-10)).toThrow();
  });
});

// ── Status-code mapping ─────────────────────────────────────────────────────

describe('zarinpal: status-code mapping', () => {
  it('treats 100 (fresh) and 101 (already verified) as success', () => {
    expect(isSuccessCode(100)).toBe(true);
    expect(isSuccessCode(101)).toBe(true);
  });

  it('treats documented failure codes as non-success', () => {
    for (const code of [-9, -10, -11, -33, -50, -51, -52, -53, -54]) {
      expect(isSuccessCode(code)).toBe(false);
    }
  });

  it('maps each documented code to a distinct Persian message', () => {
    expect(messageFor(100)).toMatch(/موفقیت/);
    expect(messageFor(101)).toMatch(/قبلاً/);
    expect(messageFor(-9)).toMatch(/اعتبارسنجی/);
    expect(messageFor(-11)).toMatch(/یافت نشد/);
    expect(messageFor(-51)).toMatch(/لغو|ناموفق/);
    expect(messageFor(-53)).toMatch(/پذیرنده/);
    expect(messageFor(-54)).toMatch(/بایگانی/);
  });

  it('falls back to a generic (but still Persian, still code-bearing) message for unknown codes', () => {
    const msg = messageFor(-123456);
    expect(msg).toContain('-123456');
    expect(msg).toMatch(/[؀-ۿ]/); // contains Persian/Arabic-range characters
  });
});

// ── isConfigured() / no fabricated success ─────────────────────────────────

describe('zarinpal gateway: isConfigured()', () => {
  afterEach(restoreEnv);

  it('is false when ZARINPAL_MERCHANT_ID is empty', () => {
    process.env.ZARINPAL_MERCHANT_ID = '';
    expect(new ZarinPalGateway().isConfigured()).toBe(false);
  });

  it('is true once a merchant id is present', () => {
    process.env.ZARINPAL_MERCHANT_ID = 'merchant-123';
    expect(new ZarinPalGateway().isConfigured()).toBe(true);
  });
});

describe('zarinpal gateway: never fabricates a response when unconfigured', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnv();
  });

  it('init() returns NOT_CONFIGURED without ever calling fetch', async () => {
    process.env.ZARINPAL_MERCHANT_ID = '';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await new ZarinPalGateway().init({
      orderId: 'o1',
      orderNumber: 'GP-1',
      amountToman: 1000,
      description: 'x',
      callbackUrl: 'https://x.test/callback',
      idempotencyKey: 'k1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_CONFIGURED');
      expect(result.messageFa).toContain('پیکربندی نشده');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('verify() returns NOT_CONFIGURED without ever calling fetch', async () => {
    process.env.ZARINPAL_MERCHANT_ID = '';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await new ZarinPalGateway().verify({ authority: 'A1', amountToman: 1000, params: {} });

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── init()/verify() wiring: Rial amount, sandbox/production hosts ─────────

describe('zarinpal gateway: init() request shape', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnv();
  });

  it('sends amountToman*10 as `amount` and returns the StartPay redirect on code 100', async () => {
    process.env.ZARINPAL_MERCHANT_ID = 'merchant-1';
    process.env.ZARINPAL_MODE = 'sandbox';
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain('sandbox.zarinpal.com');
      const body = JSON.parse(String(init?.body));
      expect(body.amount).toBe(12_340); // 1234 Toman * 10
      expect(body.merchant_id).toBe('merchant-1');
      return new Response(JSON.stringify({ data: { code: 100, authority: 'AUTH123' }, errors: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new ZarinPalGateway().init({
      orderId: 'o1',
      orderNumber: 'GP-1',
      amountToman: 1234,
      description: 'test',
      callbackUrl: 'https://x.test/callback',
      idempotencyKey: 'k1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authority).toBe('AUTH123');
      expect(result.redirectUrl).toBe('https://sandbox.zarinpal.com/pg/StartPay/AUTH123');
    }
  });

  it('strictly separates sandbox and production hosts by ZARINPAL_MODE', async () => {
    process.env.ZARINPAL_MERCHANT_ID = 'merchant-1';
    process.env.ZARINPAL_MODE = 'production';
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain('payment.zarinpal.com');
      expect(String(url)).not.toContain('sandbox');
      return new Response(JSON.stringify({ data: { code: 100, authority: 'AUTH999' }, errors: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new ZarinPalGateway().init({
      orderId: 'o2',
      orderNumber: 'GP-2',
      amountToman: 5000,
      description: 'test',
      callbackUrl: 'https://x.test/callback',
      idempotencyKey: 'k2',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.redirectUrl).toBe('https://payment.zarinpal.com/pg/StartPay/AUTH999');
  });
});

describe('zarinpal gateway: verify() maps gateway codes through', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnv();
  });

  it('returns ok:false with the mapped Persian message for a failure code (-51)', async () => {
    process.env.ZARINPAL_MERCHANT_ID = 'merchant-1';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: { code: -51 }, errors: [] }), { status: 200 })),
    );

    const result = await new ZarinPalGateway().verify({ authority: 'A1', amountToman: 1000, params: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('-51');
      expect(result.messageFa).toMatch(/لغو|ناموفق/);
    }
  });

  it('treats code 101 (already verified) as success and still returns a refId', async () => {
    process.env.ZARINPAL_MERCHANT_ID = 'merchant-1';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ data: { code: 101, ref_id: 555, card_pan: '402055******0518' }, errors: [] }),
            { status: 200 },
          ),
      ),
    );

    const result = await new ZarinPalGateway().verify({ authority: 'A1', amountToman: 1000, params: {} });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.refId).toBe('555');
  });
});

// ── Callback parsing ────────────────────────────────────────────────────────

describe('parseCallback()', () => {
  it('zarinpal: extracts Authority, Status=OK is not canceled', () => {
    expect(zarinpalGateway.parseCallback(new URLSearchParams('Authority=A123&Status=OK'))).toEqual({
      authority: 'A123',
      canceled: false,
    });
  });

  it('zarinpal: Status=NOK is canceled', () => {
    expect(zarinpalGateway.parseCallback(new URLSearchParams('Authority=A123&Status=NOK')).canceled).toBe(true);
  });

  it('zarinpal: missing Authority yields a null authority', () => {
    expect(zarinpalGateway.parseCallback(new URLSearchParams('')).authority).toBeNull();
  });

  it('wallet: same Authority/Status shape as every other gateway', () => {
    expect(walletGateway.parseCallback(new URLSearchParams('Authority=wallet:o1:k1&Status=OK'))).toEqual({
      authority: 'wallet:o1:k1',
      canceled: false,
    });
  });

  it('manual: same Authority/Status shape as every other gateway', () => {
    expect(manualGateway.parseCallback(new URLSearchParams('Authority=manual:o1:k1&Status=OK'))).toEqual({
      authority: 'manual:o1:k1',
      canceled: false,
    });
  });
});

// ── Amount-mismatch detection (service.ts) ─────────────────────────────────

describe('service: amountsMatch (amount-mismatch detection)', () => {
  it('matches equal integer Toman amounts', () => {
    expect(amountsMatch(150_000, 150_000)).toBe(true);
  });

  it('flags any mismatch', () => {
    expect(amountsMatch(150_000, 140_000)).toBe(false);
    expect(amountsMatch(0, 1)).toBe(false);
  });

  it('fails closed on non-integer input', () => {
    expect(amountsMatch(150_000.5, 150_000)).toBe(false);
  });
});

// ── isOrderPayable (service.ts) ─────────────────────────────────────────────

describe('service: isOrderPayable', () => {
  const base = {
    status: 'AWAITING_PAYMENT',
    paymentStatus: 'PENDING',
    reservationExpiresAt: null as Date | null,
  };

  it('allows a fresh awaiting-payment order', () => {
    expect(isOrderPayable(base)).toEqual({ ok: true });
  });

  it('rejects an order already marked PAID', () => {
    const result = isOrderPayable({ ...base, paymentStatus: 'PAID' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ALREADY_PAID');
  });

  it('rejects an order whose reservation window has passed', () => {
    const result = isOrderPayable({ ...base, reservationExpiresAt: new Date(Date.now() - 60_000) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('RESERVATION_EXPIRED');
  });

  it('allows an order whose reservation window has not passed yet', () => {
    const result = isOrderPayable({ ...base, reservationExpiresAt: new Date(Date.now() + 60_000) });
    expect(result.ok).toBe(true);
  });

  it('rejects a non-payable order status', () => {
    const result = isOrderPayable({ ...base, status: 'COMPLETED' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_PAYABLE');
  });
});

// ── Generic webhook signature verification ─────────────────────────────────

describe('webhook: verifyWebhookSignature', () => {
  const secret = 'unit-test-secret';
  const now = new Date('2026-01-01T00:00:00Z');
  const timestampSec = Math.floor(now.getTime() / 1000);

  it('accepts a correctly-signed, fresh payload', () => {
    const rawBody = JSON.stringify({ eventId: 'evt_1' });
    const signature = hmacHex(secret, `${timestampSec}.${rawBody}`);
    expect(verifyWebhookSignature({ secret, timestampSec, rawBody, signature, now })).toEqual({ ok: true });
  });

  it('rejects a tampered body even with a syntactically valid signature', () => {
    const originalBody = JSON.stringify({ eventId: 'evt_1' });
    const signature = hmacHex(secret, `${timestampSec}.${originalBody}`);
    const tamperedBody = JSON.stringify({ eventId: 'evt_HACKED' });
    const result = verifyWebhookSignature({ secret, timestampSec, rawBody: tamperedBody, signature, now });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad_signature');
  });

  it('rejects a signature computed with the wrong secret', () => {
    const rawBody = JSON.stringify({ eventId: 'evt_1' });
    const signature = hmacHex('wrong-secret', `${timestampSec}.${rawBody}`);
    expect(verifyWebhookSignature({ secret, timestampSec, rawBody, signature, now }).ok).toBe(false);
  });

  it('rejects a timestamp outside the 5-minute replay window', () => {
    const staleTimestamp = timestampSec - 600; // 10 minutes old
    const rawBody = JSON.stringify({ eventId: 'evt_1' });
    const signature = hmacHex(secret, `${staleTimestamp}.${rawBody}`);
    const result = verifyWebhookSignature({ secret, timestampSec: staleTimestamp, rawBody, signature, now });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('stale');
  });

  it('accepts a timestamp just inside the replay window', () => {
    const recentTimestamp = timestampSec - 200; // well within 300s
    const rawBody = JSON.stringify({ eventId: 'evt_1' });
    const signature = hmacHex(secret, `${recentTimestamp}.${rawBody}`);
    const result = verifyWebhookSignature({ secret, timestampSec: recentTimestamp, rawBody, signature, now });
    expect(result.ok).toBe(true);
  });
});
