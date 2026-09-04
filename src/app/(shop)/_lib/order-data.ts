import 'server-only';
import { db } from '@/server/db';
import { SEAM, callSeam } from './seams';
import type { OrderResultDTO, OrderStatusDTO } from './types';
import { resolveOrderAccess } from './order-access';

/**
 * Real contract, read directly from `@/server/orders`:
 *
 *   getOrderForUser(orderId) -> { ok:false; error } | { ok:true; order }
 *   getOrderByNumberForGuest(orderNumber, contact) -> same shape
 *
 * Both take the *database* order id, not the human-facing order number, and
 * both are already fully ownership-checked internally (`getOrderForUser`
 * re-derives the session itself via `assertUser()` and scopes its query to
 * `{ id, userId: user.id }` — it can't be pointed at someone else's order).
 * So resolving `orderNumber -> id` here with a plain, unscoped lookup is
 * safe: worst case an id that isn't the caller's own just comes back
 * "not found" from the real ownership check, never someone else's data.
 *
 * Their `order.items` include has no nested `deliveries` (`items: true`,
 * not `items: { include: { deliveries: true } }`), so delivery/code rows
 * are fetched here as one extra, read-only query.
 */

type RawOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  needsReview: boolean;
  placedAt: Date;
  paidAt: Date | null;
  subtotalToman: number;
  discountToman: number;
  taxToman: number;
  feeToman: number;
  walletAppliedToman: number;
  totalToman: number;
  couponCode: string | null;
  items: {
    id: string;
    productNameFa: string;
    variantNameFa: string;
    posterPath: string | null;
    qty: number;
    unitPriceToman: number;
    lineTotalToman: number;
    fulfilledQty: number;
  }[];
  payments: { status: string }[];
};

async function deliveriesForItems(itemIds: string[]) {
  if (itemIds.length === 0) return new Map<string, { deliveryId: string; inventoryItemId: string | null; channel: string; revealed: boolean }[]>();
  const rows = await db.delivery.findMany({
    where: { orderItemId: { in: itemIds } },
    select: { id: true, orderItemId: true, inventoryItemId: true, channel: true, firstRevealedAt: true },
    orderBy: { deliveredAt: 'asc' },
  });
  const map = new Map<string, { deliveryId: string; inventoryItemId: string | null; channel: string; revealed: boolean }[]>();
  for (const r of rows) {
    const list = map.get(r.orderItemId) ?? [];
    list.push({ deliveryId: r.id, inventoryItemId: r.inventoryItemId, channel: r.channel, revealed: !!r.firstRevealedAt });
    map.set(r.orderItemId, list);
  }
  return map;
}

function classifyFailure(order: RawOrder): string | null {
  if (order.status === 'CANCELED' || order.paymentStatus === 'CANCELED') return 'پرداخت این سفارش لغو شد.';
  if (order.status === 'EXPIRED' || order.paymentStatus === 'EXPIRED') return 'مهلت پرداخت این سفارش به پایان رسیده است.';
  if (order.paymentStatus === 'FAILED' || order.paymentStatus === 'VERIFICATION_FAILED' || order.status === 'FAILED') {
    return 'پرداخت با خطا مواجه شد. مبلغی از حساب شما کسر نشده است.';
  }
  return null;
}

async function normalizeOrder(raw: RawOrder): Promise<OrderResultDTO> {
  const deliveries = await deliveriesForItems(raw.items.map((i) => i.id)).catch(
    () => new Map<string, { deliveryId: string; inventoryItemId: string | null; channel: string; revealed: boolean }[]>(),
  );
  const invoice = await db.invoice
    .findUnique({ where: { orderId: raw.id }, select: { number: true } })
    .catch(() => null);

  return {
    id: raw.id,
    orderNumber: raw.orderNumber,
    status: raw.status,
    paymentStatus: raw.paymentStatus,
    fulfillmentStatus: raw.fulfillmentStatus,
    needsReview: raw.needsReview,
    placedAt: raw.placedAt.toISOString(),
    paidAt: raw.paidAt ? raw.paidAt.toISOString() : null,
    totals: {
      subtotalToman: raw.subtotalToman,
      discountToman: raw.discountToman,
      taxToman: raw.taxToman,
      feeToman: raw.feeToman,
      walletAppliedToman: raw.walletAppliedToman,
      totalToman: raw.totalToman,
    },
    couponCode: raw.couponCode,
    items: raw.items.map((it) => ({
      id: it.id,
      productName: it.productNameFa,
      variantName: it.variantNameFa,
      posterPath: it.posterPath,
      qty: it.qty,
      unitPriceToman: it.unitPriceToman,
      lineTotalToman: it.lineTotalToman,
      fulfilledQty: it.fulfilledQty,
      deliveries: (deliveries.get(it.id) ?? []).map((d) => ({
        deliveryId: d.deliveryId,
        inventoryItemId: d.inventoryItemId,
        channel: (d.channel as 'ACCOUNT' | 'EMAIL' | 'SMS') ?? 'ACCOUNT',
        revealed: d.revealed,
      })),
    })),
    invoiceUrl: invoice?.number ? `/account/invoices/${invoice.number}` : null,
    failureReasonFa: classifyFailure(raw),
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
        const row = await db.order.findUnique({ where: { orderNumber }, select: { id: true } });
        if (!row) return { ok: false as const, error: 'سفارش یافت نشد.' };
        const getOrderForUser = mod.getOrderForUser as
          | ((orderId: string) => Promise<{ ok: true; order: RawOrder } | { ok: false; error: string }>)
          | undefined;
        if (typeof getOrderForUser !== 'function') throw new Error('ماژول سفارش‌ها کامل نیست.');
        return getOrderForUser(row.id);
      }
      const getOrderByNumberForGuest = mod.getOrderByNumberForGuest as
        | ((
            orderNumber: string,
            contact: { email?: string; mobile?: string },
          ) => Promise<{ ok: true; order: RawOrder } | { ok: false; error: string }>)
        | undefined;
      if (typeof getOrderByNumberForGuest !== 'function') throw new Error('ماژول سفارش‌ها کامل نیست.');
      return getOrderByNumberForGuest(orderNumber, access.contact);
    },
    { unavailableMessageFa: 'سرویس سفارش‌ها هنوز راه‌اندازی نشده است.' },
  );

  if (!outcome.ok) {
    return outcome.reason === 'unavailable'
      ? { kind: 'unavailable', messageFa: outcome.messageFa }
      : { kind: 'error', messageFa: outcome.messageFa };
  }
  if (!outcome.data.ok) return { kind: 'not-found' };
  return { kind: 'ok', order: await normalizeOrder(outcome.data.order) };
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

export type OrderStatusFetchResult =
  | { ok: true; data: OrderStatusDTO }
  | { ok: false; reason: 'forbidden' | 'not-found' }
  | { ok: false; reason: 'unavailable' | 'error'; messageFa: string };

export async function fetchOrderStatus(orderNumber: string): Promise<OrderStatusFetchResult> {
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
