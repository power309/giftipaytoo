import { NextResponse } from 'next/server';
import { getSessionUser, readCartKey, clientIp } from '@/server/auth/session';
import { assertCsrf, CsrfError } from '@/server/csrf';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { applyCouponSchema, firstZodMessage } from '@/lib/schemas';
import { SEAM, callSeam } from '@/app/(shop)/_lib/seams';
import { fetchCart, couponFailureMessage } from '@/app/(shop)/_lib/cart-data';

export const dynamic = 'force-dynamic';

function errorResponse(err: unknown) {
  if (err instanceof CsrfError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof RateLimitError) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 429, headers: { 'Retry-After': String(err.retryAfterSec) } },
    );
  }
  return NextResponse.json({ ok: false, error: 'درخواست نامعتبر است.' }, { status: 400 });
}

/** Apply a coupon code to the current cart. */
export async function POST(req: Request) {
  try {
    await assertCsrf();
    const user = await getSessionUser();
    await enforceRateLimit('coupon.apply', user?.id ?? (await clientIp()));

    const body = await req.json().catch(() => null);
    const parsed = applyCouponSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: firstZodMessage(parsed.error) }, { status: 400 });
    }

    const sessionKey = await readCartKey();

    const outcome = await callSeam(
      SEAM.cart,
      async (mod) => {
        const applyCoupon = mod.applyCoupon as
          | ((
              ctx: { userId: string | null; sessionKey: string | null },
              input: { code: string },
            ) => Promise<unknown>)
          | undefined;
        if (typeof applyCoupon !== 'function') throw new Error('ماژول سبد خرید کامل نیست.');
        return applyCoupon({ userId: user?.id ?? null, sessionKey }, { code: parsed.data.code });
      },
      { unavailableMessageFa: 'اعمال کد تخفیف هنوز فعال نشده است.' },
    );

    if (!outcome.ok) {
      const reasonMessage =
        outcome.reason === 'error' ? couponFailureMessage(outcome.code) || outcome.messageFa : outcome.messageFa;
      return NextResponse.json(
        { ok: false, error: reasonMessage, code: outcome.reason === 'error' ? outcome.code : undefined },
        { status: outcome.reason === 'unavailable' ? 503 : 422 },
      );
    }

    const cart = await fetchCart({ userId: user?.id ?? null, sessionKey });
    return NextResponse.json({ ok: true, cart: cart.ok ? cart.data : null });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Remove the coupon currently applied to the cart. */
export async function DELETE() {
  try {
    await assertCsrf();
    const user = await getSessionUser();
    await enforceRateLimit('coupon.apply', user?.id ?? (await clientIp()));

    const sessionKey = await readCartKey();

    const outcome = await callSeam(
      SEAM.cart,
      async (mod) => {
        const removeCoupon = mod.removeCoupon as
          | ((ctx: { userId: string | null; sessionKey: string | null }) => Promise<unknown>)
          | undefined;
        if (typeof removeCoupon !== 'function') throw new Error('ماژول سبد خرید کامل نیست.');
        return removeCoupon({ userId: user?.id ?? null, sessionKey });
      },
      { unavailableMessageFa: 'حذف کد تخفیف هنوز فعال نشده است.' },
    );
    if (!outcome.ok) {
      return NextResponse.json(
        { ok: false, error: outcome.messageFa },
        { status: outcome.reason === 'unavailable' ? 503 : 422 },
      );
    }

    const cart = await fetchCart({ userId: user?.id ?? null, sessionKey });
    return NextResponse.json({ ok: true, cart: cart.ok ? cart.data : null });
  } catch (err) {
    return errorResponse(err);
  }
}
