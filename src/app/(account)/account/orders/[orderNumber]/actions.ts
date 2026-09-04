'use server';

import { redirect } from 'next/navigation';
import { db } from '@/server/db';
import { requireUser } from '@/server/auth/guard';
import { clientIp } from '@/server/auth/session';
import { loadSeam, seamFn, UNAVAILABLE_MESSAGE } from '@/lib/server-seam';
import type { RevealResult } from '@/components/account/reveal-code';

/**
 * Reveals one delivered code. IDOR is prevented twice over: this action
 * first re-checks the delivery belongs to one of the current user's own
 * orders, and `revealCode()` itself independently re-derives ownership from
 * the inventory item's order before decrypting anything.
 */
export async function revealDeliveryAction(deliveryId: string): Promise<RevealResult> {
  const user = await requireUser('/account/orders');

  const delivery = await db.delivery.findFirst({
    where: { id: deliveryId, orderItem: { order: { userId: user.id } } },
    select: { inventoryItemId: true },
  });
  if (!delivery?.inventoryItemId) return { ok: false, error: 'کد یافت نشد.' };

  const mod = await loadSeam('@/server/inventory/codes', () => import('@/server/inventory/codes'));
  type RevealFn = (input: {
    itemId: string;
    actorId: string;
    actorType: 'CUSTOMER';
    ip?: string | null;
  }) => Promise<{ itemId: string; plaintext: string; serial: string | null; pin: string | null; mask: string }>;
  const revealCode = seamFn<Parameters<RevealFn>, Awaited<ReturnType<RevealFn>>>(mod, 'revealCode');
  if (!revealCode) return { ok: false, error: UNAVAILABLE_MESSAGE };

  try {
    const ip = await clientIp();
    const result = await revealCode({ itemId: delivery.inventoryItemId, actorId: user.id, actorType: 'CUSTOMER', ip });
    return { ok: true, plaintext: result.plaintext, serial: result.serial, pin: result.pin };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'نمایش کد ناموفق بود.' };
  }
}

type StartPaymentSeamResult =
  | { ok: true; redirectUrl: string; paymentId: string }
  | { ok: false; code: string; messageFa: string };

/** Starts (or restarts) a payment attempt for an order still owed money. */
export async function payOrderAction(formData: FormData): Promise<void> {
  const user = await requireUser('/account/orders');
  const orderNumber = String(formData.get('orderNumber') ?? '');
  const gatewayKey = String(formData.get('gatewayKey') ?? '');

  const order = await db.order.findFirst({ where: { orderNumber, userId: user.id }, select: { id: true } });
  if (!order) return;

  const mod = await loadSeam('@/server/payments/service', () => import('@/server/payments/service'));
  const startPayment = seamFn<
    [{ orderId: string; gatewayKey: string; userId: string; ip: string }],
    StartPaymentSeamResult
  >(mod, 'startPayment');
  if (!startPayment) {
    redirect(`/account/orders/${orderNumber}?payError=${encodeURIComponent(UNAVAILABLE_MESSAGE)}`);
  }

  const ip = await clientIp();
  const result = await startPayment({ orderId: order.id, gatewayKey, userId: user.id, ip });
  if (!result.ok) {
    redirect(`/account/orders/${orderNumber}?payError=${encodeURIComponent(result.messageFa)}`);
  }
  redirect(result.redirectUrl);
}
