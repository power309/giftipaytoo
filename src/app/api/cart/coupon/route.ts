import { NextResponse } from 'next/server';
import { getSessionUser, readCartKey, clientIp } from '@/server/auth/session';
import { assertCsrf, CsrfError } from '@/server/csrf';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { applyCouponSchema, firstZodMessage } from '@/lib/schemas';
import { SEAM } from '@/app/(shop)/_lib/seams';
import { runCartMutation, type CartMutationResponse } from '@/app/(shop)/_lib/cart-data';

export const dynamic = 'force-dynamic';

/**
 * `@/server/cart`'s `evaluateCoupon` already returns one distinct, specific
 * Persian message per failure reason (expired, min order not met, usage
 * limit, not applicable to these products, already used by this account,
 * …) — see `evaluateCoupon` in `src/server/cart.ts`. We surface `.error`
 * verbatim rather than re-deriving our own reason codes on top of it.
 */

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
    const ctx = { userId: user?.id ?? null, sessionKey };

    const result = await runCartMutation(
      SEAM.cart,
      async (mod) => {
        const applyCoupon = mod.applyCoupon as
          | ((c: typeof ctx, input: { code: string }) => Promise<CartMutationResponse>)
          | undefined;
        if (typeof applyCoupon !== 'function') throw new Error('ماژول سبد خرید کامل نیست.');
        return applyCoupon(ctx, { code: parsed.data.code });
      },
      user?.walletBalance ?? 0,
      { unavailableMessageFa: 'اعمال کد تخفیف هنوز فعال نشده است.' },
    );

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, cart: result.cart });
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
    const ctx = { userId: user?.id ?? null, sessionKey };

    const result = await runCartMutation(
      SEAM.cart,
      async (mod) => {
        const removeCoupon = mod.removeCoupon as ((c: typeof ctx) => Promise<CartMutationResponse>) | undefined;
        if (typeof removeCoupon !== 'function') throw new Error('ماژول سبد خرید کامل نیست.');
        return removeCoupon(ctx);
      },
      user?.walletBalance ?? 0,
      { unavailableMessageFa: 'حذف کد تخفیف هنوز فعال نشده است.' },
    );

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, cart: result.cart });
  } catch (err) {
    return errorResponse(err);
  }
}
