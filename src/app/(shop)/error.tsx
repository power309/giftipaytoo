'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui';
import { logger } from '@/lib/logger';

/**
 * Shared fallback for any uncaught error inside cart / checkout / track that
 * doesn't have its own error.tsx. Never shows a raw stack to the customer.
 */
export default function ShopError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error('shop route error boundary', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-danger-soft text-danger">
        <TriangleAlert className="size-8" aria-hidden />
      </span>
      <div className="space-y-1.5">
        <h1 className="text-lg font-bold text-fg">مشکلی پیش آمد</h1>
        <p className="max-w-sm text-sm leading-7 text-fg-muted">
          در بارگذاری این صفحه خطایی رخ داد. اطلاعات پرداخت یا سبد خرید شما از بین نرفته است — می‌توانید دوباره
          تلاش کنید.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => reset()}>تلاش دوباره</Button>
        <Link href="/">
          <Button variant="outline">بازگشت به فروشگاه</Button>
        </Link>
      </div>
    </div>
  );
}
