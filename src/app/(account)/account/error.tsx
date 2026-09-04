'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { logger } from '@/lib/logger';

export default function AccountError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error('account section render error', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center" role="alert">
      <span className="grid size-14 place-items-center rounded-2xl bg-danger-soft text-danger">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <div>
        <p className="font-semibold text-fg">مشکلی در نمایش این صفحه پیش آمد</p>
        <p className="mt-1 text-sm text-fg-muted">لطفاً دوباره تلاش کنید. اگر مشکل ادامه داشت، با پشتیبانی تماس بگیرید.</p>
      </div>
      <Button type="button" onClick={reset}>
        <RotateCw className="size-4" aria-hidden />
        تلاش مجدد
      </Button>
    </div>
  );
}
