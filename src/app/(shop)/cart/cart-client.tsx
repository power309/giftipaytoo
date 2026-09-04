'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShoppingBag, WifiOff } from 'lucide-react';
import { Alert, Button, EmptyState, useToast } from '@/components/ui';
import { useCart } from '@/components/checkout/use-cart';
import { CartLineCard } from '@/components/checkout/cart-line-card';
import { CartSkeleton } from '@/components/checkout/cart-skeleton';
import { CouponForm } from '@/components/checkout/coupon-form';
import { OrderSummary } from '@/components/checkout/order-summary';
import type { CartDTO } from '@/app/(shop)/_lib/types';

export function CartClient({
  initialCart,
  initialUnavailable,
  initialErrorFa,
}: {
  initialCart: CartDTO;
  initialUnavailable: boolean;
  initialErrorFa: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const hasInitial = initialCart.lines.length > 0 || !initialUnavailable;

  const { cart, loading, unavailable, pendingIds, couponPending, updateQty, toggleRegionAck, removeLine, applyCoupon, removeCoupon } =
    useCart({
      initialCart: hasInitial ? initialCart : undefined,
      initialUnavailable,
      onError: (msg) => toast.push({ tone: 'danger', message: msg }),
    });

  if (unavailable && cart.lines.length === 0) {
    return (
      <Alert tone="warn" title="سبد خرید در دسترس نیست">
        {initialErrorFa ?? 'سرویس سبد خرید موقتاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.'}
      </Alert>
    );
  }

  if (loading) return <CartSkeleton />;

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="size-8" aria-hidden />}
        title="سبد خرید شما خالی است"
        description="محصولی به سبد خرید خود اضافه نکرده‌اید. به فروشگاه سر بزنید و گیفت‌کارت مورد نظرتان را پیدا کنید."
        action={
          <Link href="/">
            <Button>مشاهده فروشگاه</Button>
          </Link>
        }
      />
    );
  }

  const canCheckout = cart.blockingIssues.length === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="space-y-4">
        {unavailable && (
          <Alert tone="warn" title="ارتباط با سرور برقرار نیست">
            <span className="flex items-center gap-1.5">
              <WifiOff className="size-4" aria-hidden />
              تغییرات اخیر ممکن است ذخیره نشده باشد. صفحه را تازه‌سازی کنید.
            </span>
          </Alert>
        )}
        <ul className="space-y-3">
          {cart.lines.map((line) => (
            <CartLineCard
              key={line.id}
              line={line}
              busy={pendingIds.has(line.id)}
              onQtyChange={(qty) => void updateQty(line.id, qty)}
              onRemove={() => void removeLine(line.id)}
              onRegionAckChange={(v) => void toggleRegionAck(line.id, v)}
            />
          ))}
        </ul>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24">
        <div className="card p-5">
          <CouponForm coupon={cart.coupon} pending={couponPending} onApply={applyCoupon} onRemove={removeCoupon} />
        </div>

        <OrderSummary
          totals={cart.totals}
          coupon={cart.coupon}
          quoteExpiresAt={cart.quoteExpiresAt}
          isStale={cart.isStale}
          blockingIssues={cart.blockingIssues}
          footer={
            <div className="space-y-2 pt-1">
              <Button
                fullWidth
                size="lg"
                disabled={!canCheckout}
                onClick={() => router.push('/checkout')}
              >
                ادامه فرآیند خرید
                <ArrowLeft className="size-4" aria-hidden />
              </Button>
              {!canCheckout && (
                <p className="text-center text-xs text-fg-muted">
                  برای ادامه، موارد بالا را برطرف کنید.
                </p>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
