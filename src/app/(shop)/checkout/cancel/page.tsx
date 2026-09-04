import type { Metadata } from 'next';
import Link from 'next/link';
import { XCircle } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';

export const metadata: Metadata = { title: 'پرداخت لغو شد | گیفتی‌پی' };

/**
 * Landing spot for a gateway's own "cancel" redirect (distinct from
 * checkout/result, which reflects a real order's server-verified status).
 * No money ever moves here — it's purely informational.
 */
export default async function CheckoutCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;

  return (
    <div className="container-page py-10">
      <EmptyState
        icon={<XCircle className="size-8" aria-hidden />}
        title="پرداخت لغو شد"
        description="شما فرآیند پرداخت را لغو کردید. هیچ مبلغی از حساب شما کسر نشده است. سبد خرید شما همچنان محفوظ است."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/checkout">
              <Button>تلاش دوباره برای پرداخت</Button>
            </Link>
            {order && (
              <Link href={`/checkout/result/${order}`}>
                <Button variant="outline">مشاهده وضعیت سفارش</Button>
              </Link>
            )}
            <Link href="/cart">
              <Button variant="ghost">بازگشت به سبد خرید</Button>
            </Link>
          </div>
        }
      />
    </div>
  );
}
