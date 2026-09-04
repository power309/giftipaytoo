'use client';

import { MarkdownField } from '../markdown-field';
import type { ProductFormValue } from '../types';
import { Field, Textarea } from '@/components/ui';

export function DescriptionsTab({
  value,
  onChange,
  errors,
}: {
  value: ProductFormValue;
  onChange: (patch: Partial<ProductFormValue>) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      <Field
        label="توضیح کوتاه"
        htmlFor="pf-short-desc"
        hint={`${(value.shortDescriptionFa ?? '').length.toLocaleString('fa-IR')}/۳۰۰ — در کارت محصول و نتایج جست‌وجو نمایش داده می‌شود.`}
        error={errors.shortDescriptionFa}
      >
        <Textarea
          id="pf-short-desc"
          rows={2}
          maxLength={300}
          value={value.shortDescriptionFa ?? ''}
          onChange={(e) => onChange({ shortDescriptionFa: e.target.value })}
        />
      </Field>

      <MarkdownField
        id="pf-desc"
        label="توضیحات کامل"
        value={value.descriptionFa ?? ''}
        onChange={(v) => onChange({ descriptionFa: v })}
        rows={8}
        error={errors.descriptionFa}
        hint="از **پررنگ**، *مورب*، تیتر و فهرست پشتیبانی می‌شود."
      />

      <MarkdownField
        id="pf-activation"
        label="راهنمای فعال‌سازی"
        value={value.activationGuideFa ?? ''}
        onChange={(v) => onChange({ activationGuideFa: v })}
        rows={6}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <MarkdownField
          id="pf-restrictions"
          label="محدودیت‌ها"
          value={value.restrictionsFa ?? ''}
          onChange={(v) => onChange({ restrictionsFa: v })}
          rows={5}
        />
        <MarkdownField
          id="pf-warnings"
          label="هشدارها"
          value={value.warningsFa ?? ''}
          onChange={(v) => onChange({ warningsFa: v })}
          rows={5}
        />
      </div>

      <MarkdownField
        id="pf-refund-policy"
        label="سیاست بازگشت وجه"
        value={value.refundPolicyFa ?? ''}
        onChange={(v) => onChange({ refundPolicyFa: v })}
        rows={5}
      />
    </div>
  );
}
