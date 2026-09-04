'use server';

import { checkoutInputSchema, otpSchema, firstZodMessage } from '@/lib/schemas';
import { env } from '@/lib/env';
import { getSessionUser, readCartKey, clientIp, clientUserAgent } from '@/server/auth/session';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { SEAM, callSeam } from '../_lib/seams';
import { grantGuestOrderAccess } from '../_lib/order-access';
import type { SubmitOrderInput, SubmitOrderResult } from '../_lib/types';

/**
 * Expected contract for `createOrderFromCart` (from `@/server/orders`) and
 * `startPayment` (from `@/server/payments/service`) — documented in full in
 * docs/CHECKOUT.md. Both are read defensively below (this module owns the
 * *interpretation* of their result, not their implementation), and every
 * failure — missing module or a rejected order — turns into one of the
 * honest `SubmitOrderResult` variants the checkout page already knows how
 * to render. Nothing here ever fabricates a redirect or a "paid" state.
 *
 * Server Actions are already origin-checked by Next.js itself (see
 * `src/server/csrf.ts`'s docstring), so this needs no separate CSRF token —
 * unlike the REST routes under `src/app/api/cart/**`.
 */

const submitSchema = checkoutInputSchema
  .extend({ otpCode: otpSchema.optional() })
  .refine((v) => !!v.gatewayKey, { message: 'روش پرداخت را انتخاب کنید.', path: ['gatewayKey'] });

function fail(code: Exclude<SubmitOrderResult, { ok: true }>['code'], messageFa: string): SubmitOrderResult {
  return { ok: false, code, messageFa } as SubmitOrderResult;
}

export async function submitOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return fail('VALIDATION', firstZodMessage(parsed.error));
  }
  const data = parsed.data;
  const isGuest = !!data.guestContact;

  const user = await getSessionUser();
  if (!isGuest && !user) {
    return fail('VALIDATION', 'برای تکمیل خرید با حساب کاربری، ابتدا وارد شوید.');
  }

  const sessionKey = await readCartKey();
  const ip = await clientIp();
  const userAgent = await clientUserAgent();

  try {
    await enforceRateLimit('checkout.create', user?.id ?? ip);
  } catch (err) {
    if (err instanceof RateLimitError) return fail('VALIDATION', err.message);
    throw err;
  }

  const createOutcome = await callSeam(
    SEAM.orders,
    async (mod) => {
      const createOrderFromCart = mod.createOrderFromCart as
        | ((ctx: unknown, input: unknown) => Promise<Record<string, unknown>>)
        | undefined;
      if (typeof createOrderFromCart !== 'function') throw new Error('ماژول ثبت سفارش کامل نیست.');
      return createOrderFromCart(
        { userId: user?.id ?? null, sessionKey },
        {
          isGuest,
          contactEmail: data.guestContact?.email || null,
          contactMobile: data.guestContact?.mobile || null,
          useWallet: data.useWallet,
          termsAccepted: data.termsAccepted,
          regionAckAll: data.regionAcknowledged,
          otpCode: data.otpCode ?? null,
          ip,
          userAgent,
        },
      );
    },
    { unavailableMessageFa: 'ثبت سفارش هنوز در سرور راه‌اندازی نشده است. کمی بعد دوباره تلاش کنید.' },
  );

  if (!createOutcome.ok) {
    if (createOutcome.reason === 'unavailable') return fail('SERVICE_UNAVAILABLE', createOutcome.messageFa);
    return interpretOrderError(createOutcome.code, createOutcome.messageFa);
  }

  const result = createOutcome.data;
  const status = typeof result.status === 'string' ? result.status : undefined;
  const needsVerification =
    result.needsVerification === true || status === 'NEEDS_VERIFICATION' || status === 'UNDER_REVIEW';

  if (needsVerification) {
    const orderNumber = typeof result.orderNumber === 'string' ? result.orderNumber : undefined;
    if (orderNumber && isGuest) await grantGuestOrderAccess(orderNumber);
    return {
      ok: true,
      needsVerification: true,
      orderNumber,
      channel: result.channel === 'email' ? 'email' : 'sms',
      destinationMasked: typeof result.destinationMasked === 'string' ? result.destinationMasked : '••••',
      messageFa:
        typeof result.messageFa === 'string' ? result.messageFa : 'برای تکمیل خرید، کد ارسال‌شده را وارد کنید.',
    };
  }

  const orderId = typeof result.orderId === 'string' ? result.orderId : undefined;
  const orderNumber = typeof result.orderNumber === 'string' ? result.orderNumber : undefined;
  if (!orderId || !orderNumber) {
    return fail('UNKNOWN', 'سفارش ثبت شد اما شماره سفارش دریافت نشد. با پشتیبانی تماس بگیرید.');
  }

  if (isGuest) await grantGuestOrderAccess(orderNumber);

  try {
    await enforceRateLimit('payment.start', user?.id ?? ip);
  } catch (err) {
    if (err instanceof RateLimitError) return fail('VALIDATION', err.message);
    throw err;
  }

  const paymentOutcome = await callSeam(
    SEAM.paymentsService,
    async (mod) => {
      const startPayment = mod.startPayment as ((input: unknown) => Promise<Record<string, unknown>>) | undefined;
      if (typeof startPayment !== 'function') throw new Error('ماژول درگاه پرداخت کامل نیست.');
      return startPayment({
        orderId,
        orderNumber,
        gatewayKey: data.gatewayKey,
        callbackUrl: `${env.appUrl}/checkout/result/${orderNumber}`,
      });
    },
    { unavailableMessageFa: 'اتصال به درگاه پرداخت هنوز فعال نشده است.' },
  );

  if (!paymentOutcome.ok) {
    if (paymentOutcome.reason === 'unavailable') return fail('SERVICE_UNAVAILABLE', paymentOutcome.messageFa);
    return fail('GATEWAY_UNAVAILABLE', paymentOutcome.messageFa);
  }

  const redirectUrl = paymentOutcome.data.redirectUrl;
  if (typeof redirectUrl !== 'string' || !redirectUrl) {
    return fail(
      'GATEWAY_UNAVAILABLE',
      'سفارش ثبت شد اما آدرس بازگشت درگاه پرداخت دریافت نشد. سفارش شما در «سفارش‌های من» قابل پیگیری است.',
    );
  }

  return { ok: true, redirectUrl, orderNumber };
}

function interpretOrderError(code: string | undefined, messageFa: string): SubmitOrderResult {
  switch (code) {
    case 'OUT_OF_STOCK':
    case 'InsufficientStockError':
      return fail('OUT_OF_STOCK', messageFa);
    case 'STALE_PRICING':
    case 'PriceStaleError':
      return fail('STALE_PRICING', messageFa);
    case 'WALLET_INSUFFICIENT':
    case 'InsufficientWalletError':
      return fail('WALLET_INSUFFICIENT', messageFa);
    case 'RISK_REJECTED':
    case 'RiskRejectedError':
      return fail('RISK_REJECTED', messageFa);
    case 'INVALID_OTP':
    case 'InvalidOtpError':
      return fail('INVALID_OTP', messageFa);
    case 'EMPTY_CART':
    case 'EmptyCartError':
      return fail('EMPTY_CART', messageFa);
    default:
      return fail('UNKNOWN', messageFa);
  }
}
