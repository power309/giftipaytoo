import 'server-only';
import { SEAM, callSeam, type SeamOutcome } from './seams';
import type { OrderResultDTO, OrderStatusDTO } from './types';
import { resolveOrderAccess } from './order-access';

/**
 * Expected contract for `@/server/orders` (documented in docs/CHECKOUT.md):
 *   getOrderForUser(userId, orderNumber) -> RawOrder | null
 *   getOrderByNumberForGuest(orderNumber, contact?) -> RawOrder | null
 * Both must return `null` (not throw) for "doesn't exist / not yours" so we
 * can show the same honest "not found" state without leaking which case it
 * was — see the IDOR notes in order-access.ts and docs/CHECKOUT.md.
 */
type RawDelivery = { id?: string; channel?: string; firstRevealedAt?: string | Date | null };
type RawOrderItem = {
  id?: string;
  productNameFa?: string;
  variantNameFa?: string;
  posterPath?: string | null;
  qty?: number;
  unitPriceToman?: number;
  lineTotalToman?: number;
  fulfilledQty?: number;
  deliveries?: RawDelivery[];
};
type RawPayment = { status?: string; failureReason?: string | null; gateway?: string };
type RawOrder = {
  orderNumber?: string;
  status?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  needsReview?: boolean;
  placedAt?: string | Date;
  paidAt?: string | Date | null;
  subtotalToman?: number;
  discountToman?: number;
  taxToman?: number;
  feeToman?: number;
  walletAppliedToman?: number;
  totalToman?: number;
  couponCode?: string | null;
  items?: RawOrderItem[];
  invoice?: { number?: string } | null;
  payments?: RawPayment[];
};

function normalizeOrder(raw: RawOrder, fallbackOrderNumber: string): OrderResultDTO {
  const items = Array.isArray(raw.items) ? raw.items : [];
  const payments = Array.isArray(raw.payments) ? raw.payments : [];
  const latestPayment = payments[payments.length - 1];

  const failureReasonFa = (() => {
    if (raw.status === 'FAILED' || raw.paymentStatus === 'FAILED' || raw.paymentStatus === 'VERIFICATION_FAILED') {
      return latestPayment?.failureReason ?? 'پرداخت با خطا مواجه شد. مبلغی از حساب شما کسر نشده است.';
    }
    if (raw.status === 'CANCELED' || raw.paymentStatus === 'CANCELED') {
      return 'پرداخت این سفارش لغو شد.';
    }
    if (raw.status === 'EXPIRED' || raw.paymentStatus === 'EXPIRED') {
      return 'مهلت پرداخت این سفارش به پایان رسیده است.';
    }
    return null;
  })();

  return {
    orderNumber: raw.orderNumber ?? fallbackOrderNumber,
    status: raw.status ?? 'PENDING',
    paymentStatus: raw.paymentStatus ?? 'PENDING',
    fulfillmentStatus: raw.fulfillmentStatus ?? 'UNFULFILLED',
    needsReview: !!raw.needsReview,
    placedAt: raw.placedAt ? new Date(raw.placedAt).toISOString() : new Date().toISOString(),
    paidAt: raw.paidAt ? new Date(raw.paidAt).toISOString() : null,
    totals: {
      subtotalToman: raw.subtotalToman ?? 0,
      discountToman: raw.discountToman ?? 0,
      taxToman: raw.taxToman ?? 0,
      feeToman: raw.feeToman ?? 0,
      walletAppliedToman: raw.walletAppliedToman ?? 0,
      totalToman: raw.totalToman ?? 0,
    },
    couponCode: raw.couponCode ?? null,
    items: items.map((it, idx) => ({
      id: it.id ?? `item-${idx}`,
      productName: it.productNameFa ?? 'محصول',
      variantName: it.variantNameFa ?? '',
      posterPath: it.posterPath ?? null,
      qty: it.qty ?? 1,
      unitPriceToman: it.unitPriceToman ?? 0,
      lineTotalToman: it.lineTotalToman ?? (it.unitPriceToman ?? 0) * (it.qty ?? 1),
      fulfilledQty: it.fulfilledQty ?? 0,
      deliveries: (it.deliveries ?? []).map((d, di) => ({
        deliveryId: d.id ?? `delivery-${idx}-${di}`,
        channel: (d.channel as 'ACCOUNT' | 'EMAIL' | 'SMS') ?? 'ACCOUNT',
        revealed: !!d.firstRevealedAt,
      })),
    })),
    invoiceUrl: raw.invoice?.number ? `/account/invoices/${raw.invoice.number}` : null,
    failureReasonFa,
  };
}

export type OrderFetchResult =
  | { kind: 'ok'; order: OrderResultDTO }
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'unavailable'; messageFa: string }
  | { kind: 'error'; messageFa: string };

/** Server-side, ownership-checked order read. Used by the result page. */
export async function fetchOrderResult(orderNumber: string): Promise<OrderFetchResult> {
  const access = await resolveOrderAccess(orderNumber);
  if (!access.ok) return { kind: 'forbidden' };

  const outcome = await callSeam(
    SEAM.orders,
    async (mod) => {
      if (access.mode === 'user') {
        const getOrderForUser = mod.getOrderForUser as
          | ((userId: string, orderNumber: string) => Promise<RawOrder | null>)
          | undefined;
        if (typeof getOrderForUser !== 'function') throw new Error('ماژول سفارش‌ها کامل نیست.');
        return getOrderForUser(access.userId, orderNumber);
      }
      const getOrderByNumberForGuest = mod.getOrderByNumberForGuest as
        | ((orderNumber: string, contact?: string) => Promise<RawOrder | null>)
        | undefined;
      if (typeof getOrderByNumberForGuest !== 'function') throw new Error('ماژول سفارش‌ها کامل نیست.');
      return getOrderByNumberForGuest(orderNumber);
    },
    { unavailableMessageFa: 'سرویس سفارش‌ها هنوز راه‌اندازی نشده است.' },
  );

  if (!outcome.ok) {
    return outcome.reason === 'unavailable'
      ? { kind: 'unavailable', messageFa: outcome.messageFa }
      : { kind: 'error', messageFa: outcome.messageFa };
  }
  if (!outcome.data) return { kind: 'not-found' };
  return { kind: 'ok', order: normalizeOrder(outcome.data, orderNumber) };
}

/** Trimmed status-only projection for the polling endpoint — never includes codes. */
export function toStatusDTO(order: OrderResultDTO): OrderStatusDTO {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    needsReview: order.needsReview,
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchOrderStatus(orderNumber: string): Promise<SeamOutcome<OrderStatusDTO> | { ok: false; reason: 'forbidden' | 'not-found' }> {
  const result = await fetchOrderResult(orderNumber);
  switch (result.kind) {
    case 'ok':
      return { ok: true, data: toStatusDTO(result.order) };
    case 'forbidden':
      return { ok: false, reason: 'forbidden' };
    case 'not-found':
      return { ok: false, reason: 'not-found' };
    case 'unavailable':
      return { ok: false, reason: 'unavailable', messageFa: result.messageFa };
    case 'error':
      return { ok: false, reason: 'error', messageFa: result.messageFa };
  }
}
