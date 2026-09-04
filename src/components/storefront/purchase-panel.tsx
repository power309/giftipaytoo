'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Zap, AlertTriangle, CircleCheck, PackageX, Clock } from 'lucide-react';
import { Button, Checkbox, Badge, useToast } from '@/components/ui';
import { formatToman, formatTomanDigits, formatDenomination } from '@/lib/money';
import { toPersianDigits, formatJalali } from '@/lib/persian';
import { cn } from '@/lib/utils';
import type { ProductVariantDetail } from '@/app/(storefront)/_data';
import { addToCartAction, buyNowAction } from '@/app/(storefront)/_cart-actions';

function denomKey(v: ProductVariantDetail): string {
  return v.denominationMinor != null ? `${v.denominationMinor}-${v.currencyCode ?? ''}` : `variant-${v.id}`;
}

function denomLabel(v: ProductVariantDetail): string {
  if (v.denominationMinor != null && v.currencySymbol) {
    return formatDenomination(v.denominationMinor, v.currencyMinorUnits, v.currencySymbol);
  }
  return v.nameFa;
}

export function PurchasePanel({
  variants,
  requiresRegionAck,
  productWarningsFa,
  cartAvailable,
}: {
  variants: ProductVariantDetail[];
  requiresRegionAck: boolean;
  productWarningsFa: string | null;
  cartAvailable: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();

  const defaultVariant = variants.find((v) => v.isDefault) ?? variants[0] ?? null;

  const [denom, setDenom] = React.useState(defaultVariant ? denomKey(defaultVariant) : '');
  const [region, setRegion] = React.useState(defaultVariant?.regionCode ?? '');
  const [qty, setQty] = React.useState(defaultVariant?.minQty ?? 1);
  const [ack, setAck] = React.useState(false);
  const [submitting, setSubmitting] = React.useState<'cart' | 'buy' | null>(null);

  const denomOptions = React.useMemo(() => {
    const map = new Map<string, ProductVariantDetail>();
    for (const v of variants) if (!map.has(denomKey(v))) map.set(denomKey(v), v);
    return Array.from(map.values());
  }, [variants]);

  const regionOptions = React.useMemo(
    () => variants.filter((v) => denomKey(v) === denom && v.regionCode),
    [variants, denom],
  );

  const activeVariant = React.useMemo(() => {
    if (regionOptions.length > 0) {
      return regionOptions.find((v) => v.regionCode === region) ?? regionOptions[0] ?? null;
    }
    return variants.find((v) => denomKey(v) === denom) ?? null;
  }, [variants, denom, region, regionOptions]);

  // Keep region selection valid when the denomination changes.
  React.useEffect(() => {
    if (regionOptions.length > 0 && !regionOptions.some((v) => v.regionCode === region)) {
      setRegion(regionOptions[0].regionCode ?? '');
    }
  }, [regionOptions, region]);

  // Reset qty/ack whenever the resolved variant changes.
  React.useEffect(() => {
    if (activeVariant) setQty((q) => Math.min(Math.max(q, activeVariant.minQty), Math.max(activeVariant.minQty, activeVariant.maxQty)));
    setAck(false);
  }, [activeVariant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeVariant) {
    return (
      <div className="rounded-2xl border border-border-base bg-surface-muted p-5 text-sm text-fg-muted">
        در حال حاضر گزینه خریدی برای این محصول تعریف نشده است.
      </div>
    );
  }

  const inStock = activeVariant.stockCount > 0;
  const lowStock = inStock && activeVariant.stockCount <= activeVariant.lowStockThreshold;
  const needsAck = requiresRegionAck && !!activeVariant.regionNameFa;
  const canAdd = inStock && (!needsAck || ack) && cartAvailable;

  const changeQty = (delta: number) => {
    setQty((q) => Math.min(activeVariant.maxQty, Math.max(activeVariant.minQty, q + delta)));
  };

  async function submit(kind: 'cart' | 'buy') {
    if (!activeVariant) return;
    setSubmitting(kind);
    const action = kind === 'cart' ? addToCartAction : buyNowAction;
    const result = await action({ variantId: activeVariant.id, qty, regionAcknowledged: ack });
    setSubmitting(null);
    if (!result.ok) {
      push({ tone: 'danger', message: result.error ?? 'انجام نشد. دوباره تلاش کنید.' });
      return;
    }
    if (kind === 'cart') {
      push({ tone: 'success', message: 'به سبد خرید اضافه شد.' });
    } else {
      push({ tone: 'success', message: 'به سبد اضافه شد؛ در حال انتقال به سبد خرید…' });
      router.push('/cart');
    }
  }

  return (
    <div className="space-y-5">
      {denomOptions.length > 1 && (
        <div>
          <span className="mb-2 block text-sm font-semibold text-fg">مبلغ / بسته</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="انتخاب مبلغ">
            {denomOptions.map((v) => {
              const active = denomKey(v) === denom;
              return (
                <button
                  key={denomKey(v)}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDenom(denomKey(v))}
                  className={cn(
                    'rounded-xl border px-3.5 py-2 text-sm font-medium tnum transition-colors',
                    active ? 'border-primary bg-primary-soft text-primary' : 'border-border-base text-fg hover:border-primary/40',
                  )}
                >
                  {denomLabel(v)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {regionOptions.length > 1 && (
        <div>
          <span className="mb-2 block text-sm font-semibold text-fg">ریجن</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="انتخاب ریجن">
            {regionOptions.map((v) => {
              const active = v.regionCode === region;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setRegion(v.regionCode ?? '')}
                  className={cn(
                    'rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
                    active ? 'border-primary bg-primary-soft text-primary' : 'border-border-base text-fg hover:border-primary/40',
                  )}
                >
                  {v.regionNameFa}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Price block */}
      <div className="rounded-2xl border border-border-base bg-surface-muted p-4">
        <div className="flex flex-wrap items-baseline gap-2.5">
          {activeVariant.compareAtToman && activeVariant.discountPercent > 0 && (
            <span className="text-sm text-fg-faint line-through tnum">{formatTomanDigits(activeVariant.compareAtToman)}</span>
          )}
          <span className="text-2xl font-extrabold text-fg tnum">{formatToman(activeVariant.priceToman)}</span>
          {activeVariant.discountPercent > 0 && (
            <Badge tone="danger">{toPersianDigits(activeVariant.discountPercent)}٪ تخفیف</Badge>
          )}
        </div>
        {activeVariant.priceUpdatedAt && (
          <p className="mt-1.5 text-xs text-fg-faint">آخرین بروزرسانی قیمت: {formatJalali(activeVariant.priceUpdatedAt, true)}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {!inStock ? (
            <span className="flex items-center gap-1 rounded-full bg-danger-soft px-2.5 py-1 font-medium text-danger">
              <PackageX className="size-3.5" aria-hidden /> ناموجود
            </span>
          ) : lowStock ? (
            <span className="flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 font-medium text-warn">
              <AlertTriangle className="size-3.5" aria-hidden /> کم‌موجود ({toPersianDigits(activeVariant.stockCount)} عدد)
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent">
              <CircleCheck className="size-3.5" aria-hidden /> موجود
            </span>
          )}
          <span className="flex items-center gap-1 text-fg-muted">
            <Clock className="size-3.5" aria-hidden />
            تحویل معمولاً ظرف چند دقیقه
          </span>
        </div>
      </div>

      {/* Region acknowledgement gate */}
      {needsAck && (
        <div className="rounded-xl border border-warn/30 bg-warn-soft p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-warn">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            هشدار محدودیت ریجن: {activeVariant.regionNameFa}
          </p>
          <p className="mb-3 text-xs leading-6 text-fg-muted">
            {activeVariant.regionNotesFa || productWarningsFa || 'این محصول مخصوص ریجن انتخابی است و ممکن است در سایر مناطق قابل استفاده نباشد.'}
          </p>
          <Checkbox
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            label={`تأیید می‌کنم این کد مخصوص ریجن «${activeVariant.regionNameFa}» است و در صورت استفاده در مناطق دیگر ممکن است کار نکند یا غیرقابل بازگشت باشد.`}
          />
        </div>
      )}

      {/* Quantity */}
      <div>
        <span className="mb-2 block text-sm font-semibold text-fg">تعداد</span>
        <div className="inline-flex items-center rounded-xl border border-border-base">
          <button
            type="button"
            onClick={() => changeQty(-1)}
            disabled={qty <= activeVariant.minQty}
            aria-label="کاهش تعداد"
            className="grid size-11 place-items-center text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
          >
            −
          </button>
          <span className="w-12 text-center text-sm font-semibold tnum" aria-live="polite">
            {toPersianDigits(qty)}
          </span>
          <button
            type="button"
            onClick={() => changeQty(1)}
            disabled={qty >= activeVariant.maxQty}
            aria-label="افزایش تعداد"
            className="grid size-11 place-items-center text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
          >
            +
          </button>
        </div>
        <span className="ms-3 text-xs text-fg-faint">
          حداقل {toPersianDigits(activeVariant.minQty)} و حداکثر {toPersianDigits(activeVariant.maxQty)} عدد در هر سفارش
        </span>
      </div>

      {!cartAvailable && (
        <p className="rounded-xl border border-warn/30 bg-warn-soft p-3 text-xs text-warn" role="status">
          سبد خرید هنوز فعال نشده است — افزودن به سبد و خرید موقتاً غیرفعال است.
        </p>
      )}

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <Button
          size="lg"
          fullWidth
          disabled={!canAdd}
          loading={submitting === 'cart'}
          onClick={() => submit('cart')}
        >
          <ShoppingCart className="size-4.5" aria-hidden />
          افزودن به سبد خرید
        </Button>
        <Button
          size="lg"
          variant="accent"
          fullWidth
          disabled={!canAdd}
          loading={submitting === 'buy'}
          onClick={() => submit('buy')}
        >
          <Zap className="size-4.5" aria-hidden />
          خرید سریع
        </Button>
      </div>
    </div>
  );
}
