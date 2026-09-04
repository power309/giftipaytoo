'use client';

import * as React from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui';

export default function StorefrontError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="grid size-20 place-items-center rounded-2xl bg-danger-soft text-danger">
        <TriangleAlert className="size-9" aria-hidden />
      </span>
      <h1 className="text-2xl font-extrabold text-fg">مشکلی پیش آمد</h1>
      <p className="max-w-sm text-sm leading-7 text-fg-muted">
        بارگذاری این صفحه با خطا مواجه شد. لطفاً دوباره تلاش کنید؛ اگر مشکل ادامه داشت با پشتیبانی تماس بگیرید.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => reset()}>تلاش دوباره</Button>
        <a href="/contact">
          <Button variant="outline">تماس با پشتیبانی</Button>
        </a>
      </div>
    </div>
  );
}
