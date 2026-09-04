/**
 * DTOs owned by the (shop) route group. These are the contract between our
 * API routes / server components and the checkout client components — kept
 * intentionally independent of whatever shape `@/server/cart`, `@/server/orders`
 * etc. end up returning, since those modules are being built concurrently.
 * Every place that reads from a seam module normalizes into these shapes.
 */

export type CartLineAvailability = 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNAVAILABLE';

export type CartLineDTO = {
  id: string;
  variantId: string;
  productSlug: string;
  productName: string;
  variantName: string;
  posterPath: string | null;
  regionLabel: string | null;
  requiresRegionAck: boolean;
  regionAcknowledged: boolean;
  regionWarningFa: string | null;
  unitPriceToman: number;
  qty: number;
  minQty: number;
  maxQty: number;
  lineTotalToman: number;
  availability: CartLineAvailability;
  availabilityMessage: string | null;
  /** True when the server's current price differs from the price stored on the cart line. */
  priceChanged: boolean;
};

export type CartTotalsDTO = {
  subtotalToman: number;
  discountToman: number;
  taxToman: number;
  feeToman: number;
  walletAppliedToman: number;
  totalToman: number;
  payableToman: number;
  walletBalanceToman: number;
  walletApplied: boolean;
};

export type CouponStateDTO =
  | { applied: false }
  | { applied: true; code: string; label: string; discountToman: number };

export type CartDTO = {
  lines: CartLineDTO[];
  totals: CartTotalsDTO;
  coupon: CouponStateDTO;
  /** ISO timestamp — the price quote this cart reflects is valid until this instant. */
  quoteExpiresAt: string | null;
  isStale: boolean;
  itemCount: number;
  /** Human-readable reasons checkout is currently blocked; empty means clear to proceed. */
  blockingIssues: string[];
};

export const EMPTY_CART: CartDTO = {
  lines: [],
  totals: {
    subtotalToman: 0,
    discountToman: 0,
    taxToman: 0,
    feeToman: 0,
    walletAppliedToman: 0,
    totalToman: 0,
    payableToman: 0,
    walletBalanceToman: 0,
    walletApplied: false,
  },
  coupon: { applied: false },
  quoteExpiresAt: null,
  isStale: false,
  itemCount: 0,
  blockingIssues: [],
};

// ── Coupon apply ─────────────────────────────────────────────────────────

export type CouponFailureReason =
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'NOT_STARTED'
  | 'MIN_ORDER'
  | 'USAGE_LIMIT'
  | 'PER_USER_LIMIT'
  | 'NOT_APPLICABLE'
  | 'ALREADY_APPLIED'
  | 'INACTIVE';

export const COUPON_FAILURE_MESSAGES: Record<CouponFailureReason, string> = {
  NOT_FOUND: 'کد تخفیف وارد شده معتبر نیست.',
  EXPIRED: 'مهلت استفاده از این کد تخفیف به پایان رسیده است.',
  NOT_STARTED: 'این کد تخفیف هنوز فعال نشده است.',
  MIN_ORDER: 'مبلغ سبد خرید شما به حداقل مبلغ لازم برای این کد تخفیف نرسیده است.',
  USAGE_LIMIT: 'ظرفیت استفاده از این کد تخفیف تکمیل شده است.',
  PER_USER_LIMIT: 'شما پیش‌تر از این کد تخفیف استفاده کرده‌اید.',
  NOT_APPLICABLE: 'این کد تخفیف برای محصولات موجود در سبد خرید شما قابل استفاده نیست.',
  ALREADY_APPLIED: 'یک کد تخفیف دیگر روی سبد خرید شما فعال است.',
  INACTIVE: 'این کد تخفیف در حال حاضر غیرفعال است.',
};

// ── Payment gateways ─────────────────────────────────────────────────────

export type GatewayDTO = {
  key: string;
  labelFa: string;
  mode: 'sandbox' | 'production';
  available: boolean;
  /** Admin turned it on but it's missing credentials — shown disabled, never fake-working. */
  configured: boolean;
};

// ── Checkout submission ──────────────────────────────────────────────────

export type ContactInput =
  | { mode: 'account' }
  | { mode: 'guest'; email?: string; mobile?: string };

export type SubmitOrderInput = {
  contact: ContactInput;
  useWallet: boolean;
  gatewayKey: string;
  termsAccepted: boolean;
  regionAckAll: boolean;
  otpCode?: string;
};

export type SubmitOrderResult =
  | { ok: true; redirectUrl: string; orderNumber: string }
  | {
      ok: true;
      needsVerification: true;
      orderNumber?: string;
      channel: 'sms' | 'email';
      destinationMasked: string;
      messageFa: string;
    }
  | { ok: false; code: 'OUT_OF_STOCK'; messageFa: string; lines?: string[] }
  | { ok: false; code: 'STALE_PRICING'; messageFa: string }
  | { ok: false; code: 'WALLET_INSUFFICIENT'; messageFa: string }
  | { ok: false; code: 'RISK_REJECTED'; messageFa: string }
  | { ok: false; code: 'INVALID_OTP'; messageFa: string }
  | { ok: false; code: 'VALIDATION'; messageFa: string }
  | { ok: false; code: 'GATEWAY_UNAVAILABLE'; messageFa: string }
  | { ok: false; code: 'EMPTY_CART'; messageFa: string }
  | { ok: false; code: 'SERVICE_UNAVAILABLE'; messageFa: string }
  | { ok: false; code: 'UNKNOWN'; messageFa: string };

// ── Order result / status ────────────────────────────────────────────────

export type OrderItemDeliveryDTO = {
  deliveryId: string;
  channel: 'ACCOUNT' | 'EMAIL' | 'SMS';
  revealed: boolean;
};

export type OrderResultItemDTO = {
  id: string;
  productName: string;
  variantName: string;
  posterPath: string | null;
  qty: number;
  unitPriceToman: number;
  lineTotalToman: number;
  fulfilledQty: number;
  deliveries: OrderItemDeliveryDTO[];
};

export type OrderResultDTO = {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  needsReview: boolean;
  placedAt: string;
  paidAt: string | null;
  totals: {
    subtotalToman: number;
    discountToman: number;
    taxToman: number;
    feeToman: number;
    walletAppliedToman: number;
    totalToman: number;
  };
  couponCode: string | null;
  items: OrderResultItemDTO[];
  invoiceUrl: string | null;
  failureReasonFa: string | null;
};

export type OrderStatusDTO = {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  needsReview: boolean;
  updatedAt: string;
};
