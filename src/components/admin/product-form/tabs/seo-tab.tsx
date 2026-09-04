'use client';

import * as React from 'react';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';
import { Field, Input, Textarea, Button } from '@/components/ui';
import { ImageUploader } from '../image-uploader';
import type { ProductFormValue } from '../types';

const TITLE_MAX = 60;
const DESC_MAX = 160;

export function SeoTab({
  value,
  onChange,
}: {
  value: ProductFormValue;
  onChange: (patch: Partial<ProductFormValue>) => void;
}) {
  const title = value.seoTitle || value.nameFa || 'عنوان صفحه';
  const description = value.seoDescription || value.shortDescriptionFa || '';
  const titleLen = (value.seoTitle ?? '').length;
  const descLen = (value.seoDescription ?? '').length;

  return (
    <div className="space-y-6">
      <Field
        label="عنوان سئو"
        htmlFor="pf-seo-title"
        hint={`${titleLen.toLocaleString('fa-IR')}/${TITLE_MAX.toLocaleString('fa-IR')} — در صورت خالی بودن، از نام محصول استفاده می‌شود.`}
      >
        <Input
          id="pf-seo-title"
          value={value.seoTitle ?? ''}
          onChange={(e) => onChange({ seoTitle: e.target.value })}
          maxLength={100}
          aria-invalid={titleLen > TITLE_MAX}
        />
      </Field>

      <Field
        label="توضیح سئو"
        htmlFor="pf-seo-desc"
        hint={`${descLen.toLocaleString('fa-IR')}/${DESC_MAX.toLocaleString('fa-IR')}`}
      >
        <Textarea
          id="pf-seo-desc"
          rows={3}
          value={value.seoDescription ?? ''}
          onChange={(e) => onChange({ seoDescription: e.target.value })}
          maxLength={320}
          aria-invalid={descLen > DESC_MAX}
        />
      </Field>

      <div className="rounded-xl border border-border-base bg-surface p-4">
        <p className="mb-2 text-xs font-medium text-fg-muted">پیش‌نمایش در نتایج گوگل</p>
        <div className="max-w-xl" dir="ltr">
          <p className="truncate text-[13px] text-[#1a0dab]">giftipay.ir › products › {value.slug || 'product-slug'}</p>
          <p className={cn('mt-0.5 truncate text-lg text-[#1a0dab]')}>{title.slice(0, TITLE_MAX)}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-[#4d5156]">{description.slice(0, DESC_MAX) || 'توضیحی برای این محصول ثبت نشده است.'}</p>
        </div>
      </div>

      <Field label="کلیدواژه‌های جست‌وجو" htmlFor="pf-keywords" hint="با کاما یا فاصله جدا کنید — برای بهبود جست‌وجوی داخلی فروشگاه.">
        <Textarea id="pf-keywords" rows={2} value={value.searchKeywords ?? ''} onChange={(e) => onChange({ searchKeywords: e.target.value })} />
      </Field>

      <div>
        <p className="mb-2 text-sm font-medium text-fg">تصویر OG (اشتراک‌گذاری در شبکه‌های اجتماعی)</p>
        {value.ogImagePath ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.ogImagePath} alt="" className="h-20 w-36 rounded-lg border border-border-base object-cover" />
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ogImagePath: null })}>
              <Icons.Trash2 className="size-3.5" aria-hidden />
              حذف
            </Button>
          </div>
        ) : (
          <ImageUploader folder="og" label="بارگذاری تصویر OG" onUploaded={(r) => onChange({ ogImagePath: r.path })} />
        )}
      </div>
    </div>
  );
}
