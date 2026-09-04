'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Headphones, ShoppingCart } from 'lucide-react';
import { toPersianDigits } from '@/lib/persian';
import { ThemeToggle } from '@/components/theme-toggle';
import { CHECKOUT_STEPS, StepIndicator, type CheckoutStepKey } from './step-indicator';

/**
 * Minimal, focused checkout chrome: logo, step indicator, support link.
 * No mega menu, no search, no category nav — nothing to pull the customer
 * out of the purchase flow. Reads the current step from `?step=` so it stays
 * in sync with the client-managed steps in checkout/page.tsx without a
 * second data round trip.
 */
export function FocusedCheckoutHeader({ cartCount }: { cartCount: number }) {
  const params = useSearchParams();
  const stepParam = params.get('step');
  const current: CheckoutStepKey = CHECKOUT_STEPS.some((s) => s.key === stepParam)
    ? (stepParam as CheckoutStepKey)
    : 'info';
  const currentIdx = CHECKOUT_STEPS.findIndex((s) => s.key === current);
  const completed = CHECKOUT_STEPS.slice(0, currentIdx).map((s) => s.key);

  return (
    <header className="sticky top-0 z-40 border-b border-border-base bg-[var(--header-bg)] backdrop-blur-lg">
      <div className="container-page flex h-16 items-center gap-3">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="گیفتی‌پی — صفحه اصلی">
          <Image src="/favicon.svg" alt="" width={32} height={32} className="size-8 rounded-lg" priority />
          <span className="hidden text-base font-bold text-fg sm:block">گیفتی‌پی</span>
        </Link>

        <div className="mx-auto min-w-0">
          <StepIndicator current={current} completed={completed} compact />
        </div>

        <div className="ms-auto flex shrink-0 items-center gap-1">
          <ThemeToggle compact />
          <Link
            href="/cart"
            className="relative hidden size-10 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg sm:grid"
            aria-label={`سبد خرید${cartCount ? ` — ${cartCount} کالا` : ''}`}
          >
            <ShoppingCart className="size-5" aria-hidden />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -end-0.5 grid min-w-[16px] place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white tnum">
                {toPersianDigits(cartCount > 99 ? '99+' : cartCount)}
              </span>
            )}
          </Link>
          <Link
            href="/support"
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg sm:text-sm"
          >
            <Headphones className="size-4" aria-hidden />
            <span className="hidden sm:inline">پشتیبانی</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
