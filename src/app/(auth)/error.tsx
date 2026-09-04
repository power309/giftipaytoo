'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { logger } from '@/lib/logger';

export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error('auth section render error', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
      <span className="grid size-14 place-items-center rounded-2xl bg-danger-soft text-danger">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <div>
        <p className="font-semibold text-fg">مشکلی پیش آمد</p>
        <p className="mt-1 text-sm text-fg-muted">لطفاً دوباره تلاش کنید.</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-contrast hover:bg-primary-hover"
        >
          <RotateCw className="size-4" aria-hidden />
          تلاش مجدد
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-xl border border-border-base px-4 text-sm font-medium text-fg hover:bg-surface-muted"
        >
          بازگشت به فروشگاه
        </Link>
      </div>
    </div>
  );
}
