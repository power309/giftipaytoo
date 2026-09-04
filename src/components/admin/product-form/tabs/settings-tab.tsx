'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { Field, Input, Switch, Select, Badge } from '@/components/ui';
import type { ProductFormValue, ProductFormRefData } from '../types';

export function SettingsTab({
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
  function toggleTag(tagId: string) {
    const has = value.tagIds.includes(tagId);
    onChange({ tagIds: has ? value.tagIds.filter((t) => t !== tagId) : [...value.tagIds, tagId] });
  }

  function toggleRelated(id: string) {
    const has = value.relatedProductIds.includes(id);
    onChange({ relatedProductIds: has ? value.relatedProductIds.filter((r) => r !== id) : [...value.relatedProductIds, id] });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="حداقل تعداد سفارش" htmlFor="pf-min-qty" required>
          <Input id="pf-min-qty" type="number" min={1} value={value.minOrderQty} onChange={(e) => onChange({ minOrderQty: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} />
        </Field>
        <Field label="حداکثر تعداد سفارش" htmlFor="pf-max-qty" required error={errors.maxOrderQty}>
          <Input id="pf-max-qty" type="number" min={1} value={value.maxOrderQty} onChange={(e) => onChange({ maxOrderQty: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} />
        </Field>
        <Field label="زمان تقریبی تحویل (دقیقه)" htmlFor="pf-eta" required>
          <Input id="pf-eta" type="number" min={0} value={value.estimatedDeliveryMin} onChange={(e) => onChange({ estimatedDeliveryMin: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Switch
          checked={value.requiresRegionAck}
          onChange={(v) => onChange({ requiresRegionAck: v })}
          label="نیاز به تأیید منطقه توسط مشتری"
          id="pf-region-ack"
        />
        <Switch checked={value.refundEligible} onChange={(v) => onChange({ refundEligible: v })} label="قابل استرداد" id="pf-refund-eligible" />
        <Switch checked={value.isFeatured} onChange={(v) => onChange({ isFeatured: v })} label="محصول ویژه" id="pf-featured" />
        <Switch checked={value.isPopular} onChange={(v) => onChange({ isPopular: v })} label="محصول پرطرفدار" id="pf-popular" />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-fg">برچسب‌ها</p>
        <div className="flex flex-wrap gap-2">
          {refData.tags.length === 0 && <p className="text-xs text-fg-faint">برچسبی ثبت نشده — از صفحه دسته‌بندی‌ها اضافه کنید.</p>}
          {refData.tags.map((t) => {
            const active = value.tagIds.includes(t.id);
            return (
              <button key={t.id} type="button" onClick={() => toggleTag(t.id)}>
                <Badge tone={active ? 'primary' : 'neutral'} className="cursor-pointer">
                  {t.nameFa}
                  {active && <X className="size-3" aria-hidden />}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-fg">محصولات مرتبط</p>
        <Select
          value=""
          onChange={(e) => {
            if (e.target.value) toggleRelated(e.target.value);
          }}
          className="max-w-sm"
        >
          <option value="">— افزودن محصول مرتبط —</option>
          {refData.relatedCandidates
            .filter((c) => c.id !== productId && !value.relatedProductIds.includes(c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>{c.nameFa} ({c.sku})</option>
            ))}
        </Select>
        {value.relatedProductIds.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {value.relatedProductIds.map((id) => {
              const p = refData.relatedCandidates.find((c) => c.id === id);
              if (!p) return null;
              return (
                <button key={id} type="button" onClick={() => toggleRelated(id)}>
                  <Badge tone="primary" className="cursor-pointer">
                    {p.nameFa}
                    <X className="size-3" aria-hidden />
                  </Badge>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
