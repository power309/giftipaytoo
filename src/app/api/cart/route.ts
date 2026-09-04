import { NextResponse } from 'next/server';
import { getSessionUser, readCartKey } from '@/server/auth/session';
import { fetchCart } from '@/app/(shop)/_lib/cart-data';
import { EMPTY_CART } from '@/app/(shop)/_lib/types';

export const dynamic = 'force-dynamic';

/** GET current cart as JSON — used by the cart/checkout client components. */
export async function GET() {
  const user = await getSessionUser();
  const cartKey = await readCartKey();

  if (!user && !cartKey) {
    return NextResponse.json({ ok: true, cart: EMPTY_CART });
  }

  const outcome = await fetchCart({ userId: user?.id ?? null, sessionKey: cartKey });
  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, unavailable: outcome.reason === 'unavailable', error: outcome.messageFa, cart: EMPTY_CART },
      { status: outcome.reason === 'unavailable' ? 503 : 500 },
    );
  }
  return NextResponse.json({ ok: true, cart: outcome.data });
}
