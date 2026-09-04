import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { getSessionUser, readCartKey, getOrCreateCartKey, clientIp } from '@/server/auth/session';
import { assertCsrf, CsrfError } from '@/server/csrf';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { addToCartSchema, removeCartItemSchema, quantitySchema, firstZodMessage } from '@/lib/schemas';
import { SEAM } from '@/app/(shop)/_lib/seams';
import { fetchCart, runCartMutation, type CartMutationResponse } from '@/app/(shop)/_lib/cart-data';

export const dynamic = 'force-dynamic';

/**
 * Line-item mutations. Every handler is zod-validated (shared vocabulary
 * from `@/lib/schemas`), CSRF-checked and rate-limited, and — critically —
 * never accepts a price from the client: the request bodies below only ever
 * carry `variantId`/`cartItemId` + `qty` (+ a boolean acknowledgement). The
 * unit price is always resolved server-side inside `@/server/cart`, never
 * echoed back from the request body.
 *
 * `@/server/cart`'s `updateQty` only ever touches qty/price — there is no
 * dedicated mutation there for toggling `CartItem.regionAcknowledged` on an
 * existing line (only `addToCart` sets it, at insert time). So a
 * region-ack-only PATCH is applied here directly with a narrowly-scoped,
 * ownership-checked `updateMany` — never touching price/qty — rather than
 * inventing a call the real module doesn't expose.
 */

const patchQtySchema = z.object({ cartItemId: z.string().min(1), qty: quantitySchema });
const patchAckSchema = z.object({ cartItemId: z.string().min(1), regionAcknowledged: z.boolean() });

async function identify() {
  const user = await getSessionUser();
  return { userId: user?.id ?? null, walletBalanceToman: user?.walletBalance ?? 0 };
}

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

export async function POST(req: Request) {
  try {
    await assertCsrf();
    const { userId, walletBalanceToman } = await identify();
    await enforceRateLimit('api.generic', userId ?? (await clientIp()));

    const body = await req.json().catch(() => null);
    const parsed = addToCartSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: firstZodMessage(parsed.error) }, { status: 400 });
    }

    const sessionKey = userId ? await readCartKey() : await getOrCreateCartKey();

    const result = await runCartMutation(
      SEAM.cart,
      async (mod) => {
        const addToCart = mod.addToCart as
          | ((ctx: { userId: string | null; sessionKey: string | null }, input: typeof parsed.data) => Promise<CartMutationResponse>)
          | undefined;
        if (typeof addToCart !== 'function') throw new Error('ماژول سبد خرید کامل نیست.');
        return addToCart({ userId, sessionKey }, parsed.data);
      },
      walletBalanceToman,
      { unavailableMessageFa: 'افزودن به سبد خرید هنوز فعال نشده است.' },
    );

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, cart: result.cart });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request) {
  try {
    await assertCsrf();
    const { userId, walletBalanceToman } = await identify();
    await enforceRateLimit('api.generic', userId ?? (await clientIp()));

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'درخواست نامعتبر است.' }, { status: 400 });
    }

    const sessionKey = await readCartKey();
    const ctx = { userId, sessionKey };

    if ('regionAcknowledged' in body && !('qty' in body)) {
      const parsed = patchAckSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ ok: false, error: firstZodMessage(parsed.error) }, { status: 400 });
      }
      const cart = await db.cart.findFirst({
        where: userId ? { userId } : { sessionKey: sessionKey ?? '__none__' },
        select: { id: true },
      });
      if (!cart) {
        return NextResponse.json({ ok: false, error: 'سبد خرید یافت نشد.' }, { status: 404 });
      }
      const updated = await db.cartItem.updateMany({
        where: { id: parsed.data.cartItemId, cartId: cart.id },
        data: { regionAcknowledged: parsed.data.regionAcknowledged },
      });
      if (updated.count === 0) {
        return NextResponse.json({ ok: false, error: 'این کالا در سبد خرید شما یافت نشد.' }, { status: 404 });
      }
      const fresh = await fetchCart(ctx, walletBalanceToman);
      return NextResponse.json({ ok: true, cart: fresh.ok ? fresh.data : null });
    }

    const parsed = patchQtySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: firstZodMessage(parsed.error) }, { status: 400 });
    }

    const result = await runCartMutation(
      SEAM.cart,
      async (mod) => {
        const updateQty = mod.updateQty as
          | ((c: typeof ctx, input: { cartItemId: string; qty: number }) => Promise<CartMutationResponse>)
          | undefined;
        if (typeof updateQty !== 'function') throw new Error('ماژول سبد خرید کامل نیست.');
        return updateQty(ctx, parsed.data);
      },
      walletBalanceToman,
      { unavailableMessageFa: 'ویرایش سبد خرید هنوز فعال نشده است.' },
    );

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, cart: result.cart });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await assertCsrf();
    const { userId, walletBalanceToman } = await identify();
    await enforceRateLimit('api.generic', userId ?? (await clientIp()));

    const body = await req.json().catch(() => null);
    const parsed = removeCartItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: firstZodMessage(parsed.error) }, { status: 400 });
    }

    const sessionKey = await readCartKey();

    const result = await runCartMutation(
      SEAM.cart,
      async (mod) => {
        const removeItem = mod.removeItem as
          | ((
              ctx: { userId: string | null; sessionKey: string | null },
              input: { cartItemId: string },
            ) => Promise<CartMutationResponse>)
          | undefined;
        if (typeof removeItem !== 'function') throw new Error('ماژول سبد خرید کامل نیست.');
        return removeItem({ userId, sessionKey }, parsed.data);
      },
      walletBalanceToman,
      { unavailableMessageFa: 'حذف کالا از سبد خرید هنوز فعال نشده است.' },
    );

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, cart: result.cart });
  } catch (err) {
    return errorResponse(err);
  }
}
