import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { getSessionUser, readCartKey } from '@/server/auth/session';
import { fetchCartOrEmpty } from '../_lib/cart-data';
import { fetchGateways } from '../_lib/gateways';
import { isGuestCheckoutEnabled } from '../_lib/checkout-settings';
import { CheckoutClient } from './checkout-client';
import { submitOrder } from './actions';

export const metadata: Metadata = { title: 'تسویه حساب | گیفتی‌پی' };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const user = await getSessionUser();
  const cartKey = await readCartKey();

  const [{ cart, unavailable: cartUnavailable, errorFa: cartErrorFa }, { gateways, unavailable: gatewaysUnavailable }, guestCheckoutEnabled] =
    await Promise.all([
      fetchCartOrEmpty({ userId: user?.id ?? null, sessionKey: cartKey }),
      fetchGateways(),
      isGuestCheckoutEnabled(),
    ]);

  return (
    <div className="container-page py-6 sm:py-8">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <CheckoutClient
          initialCart={cart}
          cartUnavailable={cartUnavailable}
          cartErrorFa={cartErrorFa}
          gateways={gateways}
          gatewaysUnavailable={gatewaysUnavailable}
          guestCheckoutEnabled={guestCheckoutEnabled}
          isSignedIn={!!user}
          userContact={{
            email: user?.email ?? null,
            mobile: user?.phone ?? null,
            emailVerified: !!user?.emailVerified,
            mobileVerified: !!user?.phoneVerified,
          }}
          submitOrder={submitOrder}
        />
      </Suspense>
    </div>
  );
}
