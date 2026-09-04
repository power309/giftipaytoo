import type { Metadata } from 'next';
import { getSessionUser, readCartKey } from '@/server/auth/session';
import { fetchCartOrEmpty } from '../_lib/cart-data';
import { CartClient } from './cart-client';

export const metadata: Metadata = { title: 'سبد خرید | گیفتی‌پی' };
export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const user = await getSessionUser();
  const cartKey = await readCartKey();
  const { cart, unavailable, errorFa } = await fetchCartOrEmpty({ userId: user?.id ?? null, sessionKey: cartKey });

  return (
    <div className="container-page py-6 sm:py-8">
      <h1 className="mb-6 text-xl font-bold text-fg sm:text-2xl">سبد خرید</h1>
      <CartClient initialCart={cart} initialUnavailable={unavailable} initialErrorFa={errorFa} />
    </div>
  );
}
