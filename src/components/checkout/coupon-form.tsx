'use client';

import * as React from 'react';
import { Tag, X } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { formatToman } from '@/lib/money';
import type { CouponStateDTO } from '@/app/(shop)/_lib/types';

export function CouponForm({
  coupon,
  pending,
  onApply,
  onRemove,
}: {
  coupon: CouponStateDTO;
  pending: boolean;
  onApply: (code: string) => Promise<{ ok: boolean; error?: string }>;
  onRemove: () => void;
}) {
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const inputId = React.useId();

  if (coupon.applied) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft p-3">
        <div className="flex min-w-0 items-center gap-2 text-sm text-accent">
          <Tag className="size-4 shrink-0" aria-hidden />
          <span className="truncate">
            کد «{coupon.code}» اعمال شد — {formatToman(coupon.discountToman)} تخفیف
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove} disabled={pending} aria-label="حذف کد تخفیف">
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) {
          setError('کد تخفیف را وارد کنید.');
          return;
        }
        setError(null);
        const result = await onApply(value.trim());
        if (!result.ok) setError(result.error ?? 'اعمال کد تخفیف با خطا مواجه شد.');
        else setValue('');
      }}
    >
      <Field label="کد تخفیف" htmlFor={inputId} error={error}>
        <div className="flex gap-2">
          <Input
            id={inputId}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="مثلاً GIFT10"
            dir="ltr"
            className="text-start"
            aria-invalid={!!error}
            disabled={pending}
          />
          <Button type="submit" variant="secondary" loading={pending} disabled={pending}>
            اعمال
          </Button>
        </div>
      </Field>
    </form>
  );
}
