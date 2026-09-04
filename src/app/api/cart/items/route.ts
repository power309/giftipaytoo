import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, readCartKey, getOrCreateCartKey } from '@/server/auth/session';
import { assertCsrf, CsrfError } from '@/server/csrf';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { clientIp } from '@/server/auth/session';
import { SEAM, callSeam } from '@/app/(shop)/_lib/seams';
import { fetchCart } from '@/app/(shop)/_lib/cart-data';

export const dynamic = 'force-dynamic';

/**
 * Line-item mutations. Every handler here is zod-validated, CSRF-checked and
 * rate-limited, and — critically — never accepts a price from the client.
 * The request bodies below carry `variantId` + `qty` (and a boolean
 * acknowledgement) only; the unit price is always resolved server-side by
 * `@/server/cart`'s own functions, never echoed back from the request.
 */

const addSchema = z.object({
  variantId: z.string().min(1),
  qty: z.number().int().min(1).max(999),
});

const patchSchema = z.object({
  itemId: z.string().min(1),
  qty: z.number().int().min(1).max(999).optional(),
  regionAcknowledged: z.boolean().optional(),
});

const deleteSchema = z.object({
  itemId: z.string().min(1),
});

async function identify() {
  const user = await getSessionUser();
  return { userId: user?.id ?? null, isGuest: !user };
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
    const { userId } = await identify();
    await enforceRateLimit('api.generic', userId ?? (await clientIp()));

    const body = await req.json().catch(() => null);
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'تعداد یا کالای انتخابی نامعتبر است.' }, { status: 400 });
    }

    const sessionKey = userId ? await readCartKey() : await getOrCreateCartKey();

    const outcome = await callSeam(
      SEAM.cart,
      async (mod) => {
        const addToCart = mod.addToCart as
          | ((ctx: { userId: string | null; sessionKey: string | null }, input: { variantId: string; qty: number }) => Promise<unknown>)
          | undefined;
        if (typeof addToCart !== 'function') throw new Error('ماژول سبد خرید کامل نیست.');
        return addToCart({ userId, sessionKey }, { variantId: parsed.data.variantId, qty: parsed.data.qty });
      },
      { unavailableMessageFa: 'افزودن به سبد خرید هنوز فعال نشده است.' },
    );
    if (!outcome.ok) {
      return NextResponse.json(
        { ok: false, error: outcome.messageFa },
        { status: outcome.reason === 'unavailable' ? 503 : 422 },
      );
    }

    const cart = await fetchCart({ userId, sessionKey });
    return NextResponse.json({ ok: true, cart: cart.ok ? cart.data : null });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request) {
  try {
    await assertCsrf();
    const { userId } = await identify();
    await enforceRateLimit('api.generic', userId ?? (await clientIp()));

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'مقدار وارد شده نامعتبر است.' }, { status: 400 });
    }
    if (parsed.data.qty === undefined && parsed.data.regionAcknowledged === undefined) {
      return NextResponse.json({ ok: false, error: 'هیچ تغییری ارسال نشده است.' }, { status: 400 });
    }

    const sessionKey = await readCartKey();

    const outcome = await callSeam(
      SEAM.cart,
      async (mod) => {
        const updateQty = mod.updateQty as
          | ((
              ctx: { userId: string | null; sessionKey: string | null },
              input: { itemId: string; qty?: number; regionAcknowledged?: boolean },
            ) => Promise<unknown>)
          | undefined;
        if (typeof updateQty !== 'function') throw new Error('ماژول سبد خرید کامل نیست.');
        return updateQty({ userId, sessionKey }, parsed.data);
      },
      { unavailableMessageFa: 'ویرایش سبد خرید هنوز فعال نشده است.' },
    );
    if (!outcome.ok) {
      return NextResponse.json(
        { ok: false, error: outcome.messageFa },
        { status: outcome.reason === 'unavailable' ? 503 : 422 },
      );
    }

    const cart = await fetchCart({ userId, sessionKey });
    return NextResponse.json({ ok: true, cart: cart.ok ? cart.data : null });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await assertCsrf();
    const { userId } = await identify();
    await enforceRateLimit('api.generic', userId ?? (await clientIp()));

    const body = await req.json().catch(() => null);
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'کالای انتخابی نامعتبر است.' }, { status: 400 });
    }

    const sessionKey = await readCartKey();

    const outcome = await callSeam(
      SEAM.cart,
      async (mod) => {
        const removeItem = mod.removeItem as
          | ((ctx: { userId: string | null; sessionKey: string | null }, input: { itemId: string }) => Promise<unknown>)
          | undefined;
        if (typeof removeItem !== 'function') throw new Error('ماژول سبد خرید کامل نیست.');
        return removeItem({ userId, sessionKey }, parsed.data);
      },
      { unavailableMessageFa: 'حذف کالا از سبد خرید هنوز فعال نشده است.' },
    );
    if (!outcome.ok) {
      return NextResponse.json(
        { ok: false, error: outcome.messageFa },
        { status: outcome.reason === 'unavailable' ? 503 : 422 },
      );
    }

    const cart = await fetchCart({ userId, sessionKey });
    return NextResponse.json({ ok: true, cart: cart.ok ? cart.data : null });
  } catch (err) {
    return errorResponse(err);
  }
}
