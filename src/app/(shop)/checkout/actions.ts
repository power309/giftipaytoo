'use server';

import { z } from 'zod';
import { checkoutInputSchema, firstZodMessage } from '@/lib/schemas';
import { getSessionUser, clientIp } from '@/server/auth/session';
import { SEAM, callSeam } from '../_lib/seams';
import { grantGuestOrderAccess, type GuestContact } from '../_lib/order-access';
import { fetchOrderResult } from '../_lib/order-data';
import type { SubmitOrderInput, SubmitOrderResult } from '../_lib/types';

/**
 * `@/server/orders` and `@/server/payments/service` both exist now (they
 * were being written concurrently when this file was first drafted — see
 * docs/CHECKOUT.md "Seams" for the two real gaps this had to adapt to):
 *
 *   createOrderFromCart(input)  — ONE argument, exactly `checkoutInputSchema`'s
 *                                  shape. No `ctx` — it resolves the session/cart
 *                                  itself. No OTP/otpCode concept: an unverified,
 *                                  high-risk *signed-in* account is a hard
 *                                  rejection (`error` already explains what to
 *                                  verify); `needsReview` never blocks — the
 *                                  order is created and flagged for staff.
 *
 *   startPayment({orderId, gatewayKey, userId, ip}) — `userId` is REQUIRED
 *                                  (non-nullable). Guest checkout can create an
 *                                  order but currently has no way to pay for it
 *                                  through this seam. We surface that honestly
 *                                  (`GUEST_PAYMENT_UNSUPPORTED`) instead of
 *                                  forcing an empty string through and letting
 *                                  it come back as a confusing "no permission".
 *
 * Server Actions are already origin-checked by Next.js itself (see
 * `src/server/csrf.ts`'s docstring), so this needs no separate CSRF token —
 * unlike the REST routes under `src/app/api/cart/**`.
 */

const submitSchema = checkoutInputSchema.refine((v) => !!v.gatewayKey, {
  message: 'روش پرداخت را انتخاب کنید.',
  path: ['gatewayKey'],
});

type CreateOrderResult =
  | { ok: true; orderId: string; orderNumber: string; payableToman: number; needsReview: boolean; riskMessage: string }
  | { ok: false; error: string; shortage?: { productNameFa: string; requested: number; available: number }[] };

type StartPaymentResult = { ok: true; redirectUrl: string; paymentId: string } | { ok: false; code: string; messageFa: string };

function fail(code: Exclude<SubmitOrderResult, { ok: true }>['code'], messageFa: string, extra: Record<string, unknown> = {}): SubmitOrderResult {
  return { ok: false, code, messageFa, ...extra } as SubmitOrderResult;
}

export async function submitOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return fail('VALIDATION', firstZodMessage(parsed.error));
  const data = parsed.data;
  const guestContact: GuestContact | undefined = data.guestContact
    ? { email: data.guestContact.email || undefined, mobile: data.guestContact.mobile || undefined }
    : undefined;

  const createOutcome = await callSeam(
    SEAM.orders,
    async (mod) => {
      const createOrderFromCart = mod.createOrderFromCart as ((input: unknown) => Promise<CreateOrderResult>) | undefined;
      if (typeof createOrderFromCart !== 'function') throw new Error('ماژول ثبت سفارش کامل نیست.');
      return createOrderFromCart(data);
    },
    { unavailableMessageFa: 'ثبت سفارش هنوز در سرور راه‌اندازی نشده است. کمی بعد دوباره تلاش کنید.' },
  );

  if (!createOutcome.ok) {
    return createOutcome.reason === 'unavailable'
      ? fail('SERVICE_UNAVAILABLE', createOutcome.messageFa)
      : fail('REJECTED', createOutcome.messageFa);
  }

  const result = createOutcome.data;
  if (!result.ok) {
    if (result.shortage && result.shortage.length > 0) {
      return fail(
        'OUT_OF_STOCK',
        result.error,
        { lines: result.shortage.map((s) => `${s.productNameFa} (${s.available} از ${s.requested} عدد موجود)`) },
      );
    }
    return fail('REJECTED', result.error);
  }

  const user = await getSessionUser();
  if (guestContact) await grantGuestOrderAccess(result.orderNumber, guestContact);

  if (result.payableToman <= 0) {
    // Fully covered by wallet (or a 100% coupon) — nothing left to pay.
    return { ok: true, paidByWallet: true, orderNumber: result.orderNumber };
  }

  if (!user) {
    // The order exists (and the guest can already track/view it), but
    // `startPayment` requires a signed-in userId — see the module docstring.
    return fail('GUEST_PAYMENT_UNSUPPORTED', 'برای تکمیل پرداخت این سفارش، لطفاً وارد حساب کاربری خود شوید یا ثبت‌نام کنید.', {
      orderNumber: result.orderNumber,
    });
  }

  const ip = await clientIp();
  const paymentOutcome = await callSeam(
    SEAM.paymentsService,
    async (mod) => {
      const startPayment = mod.startPayment as ((input: unknown) => Promise<StartPaymentResult>) | undefined;
      if (typeof startPayment !== 'function') throw new Error('ماژول درگاه پرداخت کامل نیست.');
      return startPayment({ orderId: result.orderId, gatewayKey: data.gatewayKey, userId: user.id, ip });
    },
    { unavailableMessageFa: 'اتصال به درگاه پرداخت هنوز فعال نشده است.' },
  );

  if (!paymentOutcome.ok) {
    return paymentOutcome.reason === 'unavailable'
      ? fail('SERVICE_UNAVAILABLE', paymentOutcome.messageFa)
      : fail('GATEWAY_UNAVAILABLE', paymentOutcome.messageFa);
  }
  if (!paymentOutcome.data.ok) {
    return fail('GATEWAY_UNAVAILABLE', paymentOutcome.data.messageFa);
  }

  return { ok: true, redirectUrl: paymentOutcome.data.redirectUrl, orderNumber: result.orderNumber };
}

// ── Retry payment on a still-payable order (AWAITING_PAYMENT/PENDING) ────

const retrySchema = z.object({
  orderNumber: z.string().min(1),
  gatewayKey: z.enum(['zarinpal', 'wallet', 'manual']),
});

export type RetryPaymentResult = { ok: true; redirectUrl: string } | { ok: false; messageFa: string };

/**
 * Starts a fresh payment attempt for an order that already exists. Never
 * trusts a client-supplied order id — it re-resolves ownership exactly like
 * the result page (`fetchOrderResult`) and re-reads the order server-side
 * before calling `startPayment`, so this can't be pointed at someone else's
 * order. Signed-in only, same as `submitOrder` above — see the module
 * docstring on `startPayment`'s required `userId`.
 */
export async function retryPayment(input: { orderNumber: string; gatewayKey: string }): Promise<RetryPaymentResult> {
  const parsed = retrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, messageFa: firstZodMessage(parsed.error) };

  const user = await getSessionUser();
  if (!user) {
    return { ok: false, messageFa: 'برای تکمیل پرداخت این سفارش، لطفاً وارد حساب کاربری خود شوید.' };
  }

  const order = await fetchOrderResult(parsed.data.orderNumber);
  if (order.kind !== 'ok') {
    return { ok: false, messageFa: 'سفارش پیدا نشد یا در حال حاضر در دسترس نیست.' };
  }

  const ip = await clientIp();
  const paymentOutcome = await callSeam(
    SEAM.paymentsService,
    async (mod) => {
      const startPayment = mod.startPayment as ((input: unknown) => Promise<StartPaymentResult>) | undefined;
      if (typeof startPayment !== 'function') throw new Error('ماژول درگاه پرداخت کامل نیست.');
      return startPayment({ orderId: order.order.id, gatewayKey: parsed.data.gatewayKey, userId: user.id, ip });
    },
    { unavailableMessageFa: 'اتصال به درگاه پرداخت هنوز فعال نشده است.' },
  );

  if (!paymentOutcome.ok) return { ok: false, messageFa: paymentOutcome.messageFa };
  if (!paymentOutcome.data.ok) return { ok: false, messageFa: paymentOutcome.data.messageFa };
  return { ok: true, redirectUrl: paymentOutcome.data.redirectUrl };
}
