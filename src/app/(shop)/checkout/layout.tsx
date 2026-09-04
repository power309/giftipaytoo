import Link from 'next/link';
import { Suspense } from 'react';
import { ShieldCheck } from 'lucide-react';
import { FocusedCheckoutHeader } from '@/components/checkout/focused-header';
import { getMinimalChromeData } from '../_lib/chrome';

export const dynamic = 'force-dynamic';

/**
 * Focused checkout chrome: logo + step indicator + support link, minimal
 * footer. No mega menu, no search — nothing to distract the customer mid
 * purchase. Cart keeps the full storefront chrome (see cart/layout.tsx).
 */
export default async function CheckoutLayout({ children }: { children: React.ReactNode }) {
  const chrome = await getMinimalChromeData();

  return (
    <div className="flex min-h-dvh flex-col bg-bg-sunken">
      <Suspense fallback={<div className="h-16 border-b border-border-base bg-[var(--header-bg)]" />}>
        <FocusedCheckoutHeader cartCount={chrome.cartCount} />
      </Suspense>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border-base bg-surface py-6">
        <div className="container-page flex flex-col items-center gap-2 text-center text-xs text-fg-muted">
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-accent" aria-hidden />
            پرداخت امن — تأیید سمت سرور، بدون ذخیره اطلاعات کارت
          </p>
          <p>
            با ادامه فرآیند خرید،{' '}
            <Link href="/p/terms" className="text-primary underline underline-offset-4">
              قوانین و مقررات
            </Link>{' '}
            و{' '}
            <Link href="/p/refund-policy" className="text-primary underline underline-offset-4">
              رویه بازگشت وجه
            </Link>{' '}
            را می‌پذیرید.
          </p>
        </div>
      </footer>
    </div>
  );
}
