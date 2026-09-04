'use client';

import * as React from 'react';
import { Check, X, Loader2, Pencil } from 'lucide-react';
import { Field, Input, Select, Switch } from '@/components/ui';
import { slugify } from '@/lib/persian';
import type { ProductFormValue, ProductFormRefData } from '../types';
import { checkSlugAvailable, checkSkuAvailable } from '@/app/admin/products/actions';

const PRODUCT_TYPE_OPTIONS = [
  { value: 'GIFT_CARD', label: 'گیفت‌کارت' },
  { value: 'SUBSCRIPTION', label: 'اشتراک' },
  { value: 'GAME_CURRENCY', label: 'ارز درون‌بازی' },
  { value: 'MOBILE_TOPUP', label: 'شارژ موبایل' },
  { value: 'SOFTWARE_LICENSE', label: 'لایسنس نرم‌افزار' },
  { value: 'ACCOUNT_TOPUP', label: 'شارژ اکانت' },
  { value: 'OTHER', label: 'سایر' },
];
const DELIVERY_TYPE_OPTIONS = [
  { value: 'INSTANT_CODE', label: 'کد آنی (خودکار)' },
  { value: 'MANUAL_CODE', label: 'کد دستی' },
  { value: 'ACCOUNT_TOPUP', label: 'شارژ اکانت' },
  { value: 'SUPPLIER_API', label: 'API تأمین‌کننده' },
];
const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'پیش‌نویس' },
  { value: 'ACTIVE', label: 'فعال' },
  { value: 'INACTIVE', label: 'غیرفعال' },
  { value: 'SCHEDULED', label: 'زمان‌بندی‌شده' },
  { value: 'ARCHIVED', label: 'بایگانی' },
];

function useDebouncedCheck(value: string, ignoreId: string | undefined, checker: (v: string, ignoreId?: string) => Promise<{ available: boolean }>) {
  const [state, setState] = React.useState<'idle' | 'checking' | 'ok' | 'taken'>('idle');
  React.useEffect(() => {
    if (!value.trim()) {
      setState('idle');
      return;
    }
    setState('checking');
    const t = setTimeout(async () => {
      try {
        const res = await checker(value, ignoreId);
        setState(res.available ? 'ok' : 'taken');
      } catch {
        setState('idle');
      }
    }, 450);
    return () => clearTimeout(t);
  }, [value, ignoreId, checker]);
  return state;
}

export function BasicInfoTab({
  value,
  onChange,
  errors,
  refData,
  productId,
}: {
  value: ProductFormValue;
  onChange: (patch: Partial<ProductFormValue>) => void;
  errors: Record<string, string>;
  refData: ProductFormRefData;
  productId?: string;
}) {
  const [slugEditing, setSlugEditing] = React.useState(false);
  const slugState = useDebouncedCheck(value.slug, productId, checkSlugAvailable);
  const skuState = useDebouncedCheck(value.sku, productId, checkSkuAvailable);

  function handleNameChange(nameFa: string) {
    const patch: Partial<ProductFormValue> = { nameFa };
    if (!slugEditing) patch.slug = slugify(nameFa);
    onChange(patch);
  }

  const subcategories = refData.categories.filter((c) => c.parentId === value.categoryId);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نام فارسی" htmlFor="pf-name-fa" required error={errors.nameFa}>
          <Input id="pf-name-fa" value={value.nameFa} onChange={(e) => handleNameChange(e.target.value)} aria-invalid={!!errors.nameFa} />
        </Field>
        <Field label="نام انگلیسی" htmlFor="pf-name-en" error={errors.nameEn}>
          <Input id="pf-name-en" value={value.nameEn ?? ''} onChange={(e) => onChange({ nameEn: e.target.value })} dir="ltr" />
        </Field>
      </div>

      <Field
        label="نامک (Slug)"
        htmlFor="pf-slug"
        required
        error={errors.slug}
        hint={
          slugState === 'checking'
            ? 'در حال بررسی…'
            : slugState === 'taken'
              ? undefined
              : slugState === 'ok'
                ? 'این نامک آزاد است.'
                : undefined
        }
      >
        <div className="flex items-center gap-2">
          <Input
            id="pf-slug"
            value={value.slug}
            dir="ltr"
            disabled={!slugEditing}
            onChange={(e) => onChange({ slug: slugify(e.target.value) })}
            aria-invalid={!!errors.slug || slugState === 'taken'}
          />
          <button
            type="button"
            onClick={() => setSlugEditing((v) => !v)}
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-border-base text-fg-muted hover:bg-surface-muted"
            aria-label={slugEditing ? 'قفل کردن نامک' : 'ویرایش دستی نامک'}
          >
            <Pencil className="size-4" aria-hidden />
          </button>
          {slugState === 'checking' && <Loader2 className="size-4 shrink-0 animate-spin text-fg-faint" aria-hidden />}
          {slugState === 'ok' && <Check className="size-4 shrink-0 text-accent" aria-hidden />}
          {slugState === 'taken' && <X className="size-4 shrink-0 text-danger" aria-hidden />}
        </div>
        {slugState === 'taken' && <p className="mt-1 text-xs text-danger">این نامک قبلاً استفاده شده است.</p>}
      </Field>

      <Field label="SKU" htmlFor="pf-sku" required error={errors.sku}>
        <div className="flex items-center gap-2">
          <Input id="pf-sku" value={value.sku} dir="ltr" onChange={(e) => onChange({ sku: e.target.value.toUpperCase() })} aria-invalid={!!errors.sku || skuState === 'taken'} />
          {skuState === 'checking' && <Loader2 className="size-4 shrink-0 animate-spin text-fg-faint" aria-hidden />}
          {skuState === 'ok' && <Check className="size-4 shrink-0 text-accent" aria-hidden />}
          {skuState === 'taken' && <X className="size-4 shrink-0 text-danger" aria-hidden />}
        </div>
        {skuState === 'taken' && <p className="mt-1 text-xs text-danger">این SKU قبلاً استفاده شده است.</p>}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="برند" htmlFor="pf-brand" required error={errors.brandId}>
          <Select id="pf-brand" value={value.brandId} onChange={(e) => onChange({ brandId: e.target.value })}>
            <option value="">— انتخاب کنید —</option>
            {refData.brands.map((b) => (
              <option key={b.id} value={b.id}>{b.nameFa}</option>
            ))}
          </Select>
        </Field>
        <Field label="دسته" htmlFor="pf-category" required error={errors.categoryId}>
          <Select id="pf-category" value={value.categoryId} onChange={(e) => onChange({ categoryId: e.target.value })}>
            <option value="">— انتخاب کنید —</option>
            {refData.categories.filter((c) => !c.parentId).map((c) => (
              <option key={c.id} value={c.id}>{c.nameFa}</option>
            ))}
          </Select>
        </Field>
      </div>

      {subcategories.length > 0 && (
        <Field label="زیردسته" htmlFor="pf-subcategory" hint="اختیاری — در صورت وجود زیردسته برای دسته انتخاب‌شده.">
          <Select id="pf-subcategory" value="" onChange={(e) => e.target.value && onChange({ categoryId: e.target.value })}>
            <option value="">بدون زیردسته</option>
            {subcategories.map((s) => (
              <option key={s.id} value={s.id}>{s.nameFa}</option>
            ))}
          </Select>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="پلتفرم" htmlFor="pf-platform">
          <Select id="pf-platform" value={value.platformId ?? ''} onChange={(e) => onChange({ platformId: e.target.value || null })}>
            <option value="">— بدون پلتفرم —</option>
            {refData.platforms.map((p) => (
              <option key={p.id} value={p.id}>{p.nameFa}</option>
            ))}
          </Select>
        </Field>
        <Field label="نوع محصول" htmlFor="pf-type" required>
          <Select id="pf-type" value={value.productType} onChange={(e) => onChange({ productType: e.target.value as ProductFormValue['productType'] })}>
            {PRODUCT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نوع تحویل" htmlFor="pf-delivery" required>
          <Select id="pf-delivery" value={value.deliveryType} onChange={(e) => onChange({ deliveryType: e.target.value as ProductFormValue['deliveryType'] })}>
            {DELIVERY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="وضعیت" htmlFor="pf-status" required>
          <Select id="pf-status" value={value.status} onChange={(e) => onChange({ status: e.target.value as ProductFormValue['status'] })}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      {value.status === 'SCHEDULED' && (
        <Field label="تاریخ انتشار" htmlFor="pf-publish-at" required error={errors.publishAt} hint="زمان محلی سرور — پس از این تاریخ محصول به‌صورت خودکار فعال می‌شود.">
          <Input
            id="pf-publish-at"
            type="datetime-local"
            value={value.publishAt ?? ''}
            onChange={(e) => onChange({ publishAt: e.target.value || null })}
          />
        </Field>
      )}

      <Field label="تاریخ انقضا" htmlFor="pf-expires-at" hint="اختیاری — پس از این تاریخ محصول غیرفعال می‌شود.">
        <Input id="pf-expires-at" type="datetime-local" value={value.expiresAt ?? ''} onChange={(e) => onChange({ expiresAt: e.target.value || null })} />
      </Field>

      <Switch checked={value.refundEligible} onChange={(v) => onChange({ refundEligible: v })} label="این محصول قابل استرداد است" id="pf-refund-eligible" />
    </div>
  );
}
