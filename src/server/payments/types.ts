/**
 * Payment gateway abstraction.
 *
 * Every gateway (ZarinPal, internal wallet, manual bank transfer, ...) implements
 * `PaymentGateway`. Nothing outside `src/server/payments/**` should talk to a
 * gateway's SDK/HTTP API directly — always go through `service.ts`, which is
 * the only place allowed to transition a `Payment`/`Order` row.
 */

export type PaymentInitInput = {
  orderId: string;
  orderNumber: string;
  amountToman: number;
  description: string;
  callbackUrl: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  /** Deterministic per-attempt key, e.g. `${orderId}:${gatewayKey}:${attempt}`. */
  idempotencyKey: string;
};

export type PaymentInitResult =
  | { ok: true; redirectUrl: string; authority: string; raw?: unknown }
  | { ok: false; code: string; messageFa: string; raw?: unknown };

export type PaymentVerifyInput = {
  authority: string;
  amountToman: number;
  params: Record<string, string>;
};

export type PaymentVerifyResult =
  | { ok: true; refId: string; cardPanMasked?: string | null; raw?: unknown }
  | {
      ok: false;
      code: string;
      messageFa: string;
      /** True when the gateway itself reports this authority as already verified/paid. */
      alreadyVerified?: boolean;
      raw?: unknown;
    };

export interface PaymentGateway {
  /** Stable slug persisted on `Payment.gateway` — e.g. 'zarinpal' | 'wallet' | 'manual'. */
  readonly key: string;
  readonly labelFa: string;
  readonly mode: 'sandbox' | 'production';

  /** False when required credentials/settings are missing. Never fabricate success. */
  isConfigured(): boolean;

  init(input: PaymentInitInput): Promise<PaymentInitResult>;

  verify(input: PaymentVerifyInput): Promise<PaymentVerifyResult>;

  refund?(input: {
    refId: string;
    amountToman: number;
    reason: string;
  }): Promise<{ ok: boolean; messageFa: string; raw?: unknown }>;

  /** Extract the gateway's identifier + cancel/status flag from a callback query string. */
  parseCallback(params: URLSearchParams): { authority: string | null; canceled: boolean };
}
