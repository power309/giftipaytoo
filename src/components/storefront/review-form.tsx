'use client';

import * as React from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { Button, Textarea, Input, Alert } from '@/components/ui';
import { cn } from '@/lib/utils';
import { submitReviewAction } from '@/app/(storefront)/_review-actions';

export function ReviewForm({
  productId,
  productSlug,
  isSignedIn,
}: {
  productId: string;
  productSlug: string;
  isSignedIn: boolean;
}) {
  const [rating, setRating] = React.useState(0);
  const [hover, setHover] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; error?: string; pending?: boolean } | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  if (!isSignedIn) {
    return (
      <Alert tone="info" title="برای ثبت دیدگاه وارد شوید">
        <Link href={`/auth/login?next=${encodeURIComponent(`/product/${productSlug}`)}`} className="underline">
          ورود یا ثبت‌نام
        </Link>
      </Alert>
    );
  }

  if (result?.ok) {
    return (
      <Alert tone="success" title="دیدگاه شما ثبت شد">
        پس از بررسی توسط تیم گیفتی‌پی نمایش داده می‌شود.
      </Alert>
    );
  }

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        if (rating === 0) {
          setResult({ ok: false, error: 'امتیاز را انتخاب کنید.' });
          return;
        }
        formData.set('rating', String(rating));
        setPending(true);
        const res = await submitReviewAction(formData);
        setPending(false);
        setResult(res);
        if (res.ok) formRef.current?.reset();
      }}
      className="space-y-3 rounded-2xl border border-border-base p-4"
    >
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="productSlug" value={productSlug} />

      <p className="text-sm font-semibold text-fg">ثبت دیدگاه</p>

      <div className="flex items-center gap-1" role="radiogroup" aria-label="امتیاز">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} ستاره`}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="p-0.5"
          >
            <Star
              className={cn('size-6 transition-colors', (hover || rating) >= n ? 'fill-gold text-gold' : 'text-border-strong')}
              aria-hidden
            />
          </button>
        ))}
      </div>

      <Input name="titleFa" placeholder="عنوان دیدگاه (اختیاری)" maxLength={120} />
      <Textarea name="bodyFa" required minLength={10} maxLength={2000} placeholder="تجربه خود از این محصول را بنویسید…" rows={3} />

      {result?.error && (
        <p className="text-xs text-danger" role="alert">
          {result.error}
        </p>
      )}

      <Button type="submit" loading={pending} size="sm">
        ثبت دیدگاه
      </Button>
    </form>
  );
}
