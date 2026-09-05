'use client';

import * as React from 'react';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Field, Input, Select, Switch, Checkbox, EmptyState } from '@/components/ui';
import { Money } from '@/components/admin/kit';
import { computeListPrice, resolveCost, type MarginRule } from '@/lib/pricing';
import { toPersianDigits, parsePersianNumber } from '@/lib/persian';
import type { ProductFormValue, ProductFormRefData, VariantFormValue } from '../types';
import { emptyVariant } from '../types';

function marginRuleFrom(v: Pick<VariantFormValue, 'marginType' | 'marginValue' | 'minProfitToman'>): MarginRule {
  return {
    marginType: v.marginType,
    marginValue: v.marginValue,
    minProfitToman: v.minProfitToman,
    roundingMode: 'NEAREST',
    roundingStep: 1000,
    priority: 0,
    scope: 'VARIANT',
  };
}

export function VariantsTab({
  value,
  onChange,
  errors,
  refData,
  baseSku,
}: {
  value: ProductFormValue;
  onChange: (patch: Partial<ProductFormValue>) => void;
  errors: Record<string, string>;
  refData: ProductFormRefData;
  baseSku: string;
}) {
  const [generatorOpen, setGeneratorOpen] = React.useState(false);

  function updateVariant(index: number, patch: Partial<VariantFormValue>) {
    const next = value.variants.map((v, i) => (i === index ? { ...v, ...patch } : v));
    onChange({ variants: next });
  }

  function setDefault(index: number) {
    onChange({ variants: value.variants.map((v, i) => ({ ...v, isDefault: i === index })) });
  }

  function removeVariant(index: number) {
    const wasDefault = value.variants[index]?.isDefault;
    const next = value.variants.filter((_, i) => i !== index);
    if (wasDefault && next.length > 0) next[0] = { ...next[0], isDefault: true };
    onChange({ variants: next });
  }

  function addVariant() {
    onChange({ variants: [...value.variants, emptyVariant(value.variants.length)] });
  }

  function applyComputedPrice(index: number) {
    const v = value.variants[index];
    const breakdown = computeListPrice(v.costPriceToman, marginRuleFrom(v));
    updateVariant(index, { basePriceToman: breakdown.listPriceToman });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          {value.variants.length.toLocaleString('fa-IR')} تنوع — یکی باید به‌عنوان پیش‌فرض علامت‌گذاری شود.
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setGeneratorOpen((v) => !v)}>
            <Icons.Wand2 className="size-4" aria-hidden />
            تولید تنوع‌ها
          </Button>
          <Button type="button" size="sm" onClick={addVariant}>
            <Icons.Plus className="size-4" aria-hidden />
            افزودن تنوع
          </Button>
        </div>
      </div>

      {typeof errors.variants === 'string' && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{errors.variants}</p>
      )}

      {generatorOpen && (
        <VariantGenerator
          refData={refData}
          baseSku={baseSku}
          existingSkus={new Set(value.variants.map((v) => v.sku))}
          onGenerate={(rows) => onChange({ variants: [...value.variants, ...rows] })}
          onClose={() => setGeneratorOpen(false)}
        />
      )}

      {value.variants.length === 0 ? (
        <EmptyState icon={<Icons.Layers className="size-7" aria-hidden />} title="هنوز تنوعی اضافه نشده" description="حداقل یک تنوع لازم است." />
      ) : (
        <div className="space-y-4">
          {value.variants.map((v, i) => {
            const breakdown = computeListPrice(v.costPriceToman, marginRuleFrom(v));
            const actualProfit = v.basePriceToman - v.costPriceToman;
            const err = (field: string) => errors[`variants.${i}.${field}`];
            return (
              <div key={i} className={cn('rounded-xl border p-4', v.isDefault ? 'border-primary/50 bg-primary-soft/20' : 'border-border-base')}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-fg">{v.nameFa || `تنوع ${toPersianDigits(i + 1)}`}</span>
                  {v.isDefault && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-contrast">پیش‌فرض</span>}
                  <div className="ms-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDefault(i)}
                      disabled={v.isDefault}
                      className="text-xs text-primary hover:underline disabled:pointer-events-none disabled:text-fg-faint"
                    >
                      تنظیم به‌عنوان پیش‌فرض
                    </button>
                    <Switch checked={v.isActive} onChange={(val) => updateVariant(i, { isActive: val })} label="فعال" id={`variant-active-${i}`} />
                    <Button type="button" size="xs" variant="danger" onClick={() => removeVariant(i)} aria-label="حذف تنوع">
                      <Icons.Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="نام تنوع" htmlFor={`v-name-${i}`} required error={err('nameFa')}>
                    <Input id={`v-name-${i}`} value={v.nameFa} onChange={(e) => updateVariant(i, { nameFa: e.target.value })} />
                  </Field>
                  <Field label="SKU" htmlFor={`v-sku-${i}`} required error={err('sku')}>
                    <Input id={`v-sku-${i}`} value={v.sku} dir="ltr" onChange={(e) => updateVariant(i, { sku: e.target.value.toUpperCase() })} />
                  </Field>
                  <Field label="مقدار (واحد خرد ارز)" htmlFor={`v-denom-${i}`} hint="مثلاً ۵۰۰۰ برای ۵۰٫۰۰ دلار">
                    <Input
                      id={`v-denom-${i}`}
                      type="number"
                      value={v.denominationMinor ?? ''}
                      onChange={(e) => updateVariant(i, { denominationMinor: e.target.value === '' ? null : Math.trunc(Number(e.target.value)) })}
                    />
                  </Field>
                  <Field label="ارز" htmlFor={`v-currency-${i}`}>
                    <Select id={`v-currency-${i}`} value={v.currencyCode ?? ''} onChange={(e) => updateVariant(i, { currencyCode: e.target.value || null })}>
                      <option value="">— تومان مستقیم —</option>
                      {refData.currencies.map((c) => (
                        <option key={c.code} value={c.code}>{c.nameFa} ({c.symbol})</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="منطقه" htmlFor={`v-region-${i}`}>
                    <Select id={`v-region-${i}`} value={v.regionId ?? ''} onChange={(e) => updateVariant(i, { regionId: e.target.value || null })}>
                      <option value="">— بدون منطقه —</option>
                      {refData.regions.map((r) => (
                        <option key={r.id} value={r.id}>{r.nameFa}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="پلتفرم" htmlFor={`v-platform-${i}`}>
                    <Select id={`v-platform-${i}`} value={v.platformId ?? ''} onChange={(e) => updateVariant(i, { platformId: e.target.value || null })}>
                      <option value="">— بدون پلتفرم —</option>
                      {refData.platforms.map((p) => (
                        <option key={p.id} value={p.id}>{p.nameFa}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="تأمین‌کننده" htmlFor={`v-supplier-${i}`}>
                    <Select id={`v-supplier-${i}`} value={v.supplierId ?? ''} onChange={(e) => updateVariant(i, { supplierId: e.target.value || null })}>
                      <option value="">— تعیین‌نشده —</option>
                      {refData.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.nameFa}</option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="قیمت تمام‌شده (تومان)" htmlFor={`v-cost-${i}`} required error={err('costPriceToman')}>
                    <Input id={`v-cost-${i}`} type="number" value={v.costPriceToman} onChange={(e) => updateVariant(i, { costPriceToman: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} />
                  </Field>
                  <Field label="نوع سود" htmlFor={`v-margin-type-${i}`}>
                    <Select id={`v-margin-type-${i}`} value={v.marginType} onChange={(e) => updateVariant(i, { marginType: e.target.value as VariantFormValue['marginType'] })}>
                      <option value="PERCENT">درصدی</option>
                      <option value="FIXED">مبلغ ثابت</option>
                    </Select>
                  </Field>
                  <Field label={v.marginType === 'PERCENT' ? 'درصد سود' : 'مبلغ سود (تومان)'} htmlFor={`v-margin-value-${i}`}>
                    <Input id={`v-margin-value-${i}`} type="number" value={v.marginValue} onChange={(e) => updateVariant(i, { marginValue: Math.trunc(Number(e.target.value) || 0) })} />
                  </Field>
                  <Field label="حداقل سود (تومان)" htmlFor={`v-min-profit-${i}`}>
                    <Input id={`v-min-profit-${i}`} type="number" value={v.minProfitToman} onChange={(e) => updateVariant(i, { minProfitToman: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} />
                  </Field>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="قیمت پایه (تومان)" htmlFor={`v-base-${i}`} required error={err('basePriceToman')}>
                    <div className="flex items-center gap-1.5">
                      <Input id={`v-base-${i}`} type="number" value={v.basePriceToman} onChange={(e) => updateVariant(i, { basePriceToman: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} />
                      <Button type="button" size="xs" variant="ghost" onClick={() => applyComputedPrice(i)} title="اعمال قیمت پیشنهادی">
                        <Icons.Sparkles className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  </Field>
                  <Field label="قیمت حراج (اختیاری)" htmlFor={`v-sale-${i}`}>
                    <Input id={`v-sale-${i}`} type="number" value={v.salePriceToman ?? ''} onChange={(e) => updateVariant(i, { salePriceToman: e.target.value === '' ? null : Math.max(0, Math.trunc(Number(e.target.value))) })} />
                  </Field>
                  <Field label="قیمت مقایسه‌ای (اختیاری)" htmlFor={`v-compare-${i}`}>
                    <Input id={`v-compare-${i}`} type="number" value={v.compareAtToman ?? ''} onChange={(e) => updateVariant(i, { compareAtToman: e.target.value === '' ? null : Math.max(0, Math.trunc(Number(e.target.value))) })} />
                  </Field>
                  <div className="rounded-xl border border-border-base bg-surface-muted/50 p-2.5 text-xs">
                    <p className="mb-1 font-medium text-fg-muted">سود لحظه‌ای</p>
                    <p className={cn('font-bold tnum', actualProfit >= 0 ? 'text-accent' : 'text-danger')}>
                      <Money value={actualProfit} />
                    </p>
                    <p className="mt-1 text-fg-faint">
                      پیشنهاد سیستم: <Money value={breakdown.listPriceToman} className="font-medium text-fg" />
                      {breakdown.minProfitApplied && ' (کف حداقل سود اعمال شد)'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  <Field label="حداقل تعداد سفارش" htmlFor={`v-minqty-${i}`}>
                    <Input id={`v-minqty-${i}`} type="number" min={1} value={v.minQty} onChange={(e) => updateVariant(i, { minQty: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} />
                  </Field>
                  <Field label="حداکثر تعداد سفارش" htmlFor={`v-maxqty-${i}`} error={err('maxQty')}>
                    <Input id={`v-maxqty-${i}`} type="number" min={1} value={v.maxQty} onChange={(e) => updateVariant(i, { maxQty: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} />
                  </Field>
                  <Field label="آستانه هشدار موجودی کم" htmlFor={`v-low-${i}`}>
                    <Input id={`v-low-${i}`} type="number" min={0} value={v.lowStockThreshold} onChange={(e) => updateVariant(i, { lowStockThreshold: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} />
                  </Field>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VariantGenerator({
  refData,
  baseSku,
  existingSkus,
  onGenerate,
  onClose,
}: {
  refData: ProductFormRefData;
  baseSku: string;
  existingSkus: Set<string>;
  onGenerate: (rows: VariantFormValue[]) => void;
  onClose: () => void;
}) {
  const [denomText, setDenomText] = React.useState('10, 25, 50, 100');
  const [currencyCode, setCurrencyCode] = React.useState(refData.currencies[0]?.code ?? '');
  const [selectedRegionIds, setSelectedRegionIds] = React.useState<Set<string>>(new Set());
  const [marginType, setMarginType] = React.useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [marginValue, setMarginValue] = React.useState(20);
  const [minProfitToman, setMinProfitToman] = React.useState(0);

  const currency = refData.currencies.find((c) => c.code === currencyCode);
  const rate = refData.exchangeRates.find((r) => r.currencyCode === currencyCode);

  // Both are memoised: they feed the `preview` useMemo below, and a fresh array
  // on every render would make that memo recompute every time.
  const denominations = React.useMemo(
    () =>
      denomText
        .split(',')
        .map((s) => parsePersianNumber(s.trim()))
        .filter((n): n is number => n !== null && n > 0),
    [denomText],
  );

  const regions = React.useMemo(
    () =>
      selectedRegionIds.size > 0 ? refData.regions.filter((r) => selectedRegionIds.has(r.id)) : [null],
    [selectedRegionIds, refData.regions],
  );

  const preview = React.useMemo(() => {
    if (!currency) return [];
    const scale = Math.pow(10, currency.minorUnits);
    return denominations.flatMap((face) => {
      const denominationMinor = Math.round(face * scale);
      const cost = rate ? resolveCost({ kind: 'foreign', denominationMinor, minorUnitScale: currency.minorUnits, tomanPerUnit: rate.tomanPerUnit }) : 0;
      const breakdown = computeListPrice(cost, {
        marginType,
        marginValue,
        minProfitToman,
        roundingMode: 'NEAREST',
        roundingStep: 1000,
        priority: 0,
        scope: 'VARIANT',
      });
      return regions.map((region) => ({ face, denominationMinor, cost, breakdown, region }));
    });
  }, [denominations, currency, rate, marginType, marginValue, minProfitToman, regions]);

  function toggleRegion(id: string) {
    setSelectedRegionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function generate() {
    if (!currency) return;
    const rows: VariantFormValue[] = [];
    for (const item of preview) {
      const regionPart = item.region ? `-${item.region.code}` : '';
      let sku = `${baseSku || 'SKU'}-${item.face}${currency.code}${regionPart}`.toUpperCase();
      let n = 1;
      while (existingSkus.has(sku) || rows.some((r) => r.sku === sku)) {
        n += 1;
        sku = `${baseSku || 'SKU'}-${item.face}${currency.code}${regionPart}-${n}`.toUpperCase();
      }
      rows.push({
        ...emptyVariant(0),
        sku,
        nameFa: `${toPersianDigits(item.face)} ${currency.symbol}${item.region ? ` — ${item.region.nameFa}` : ''}`,
        denominationMinor: item.denominationMinor,
        currencyCode: currency.code,
        regionId: item.region?.id ?? null,
        costPriceToman: item.cost,
        basePriceToman: item.breakdown.listPriceToman,
        marginType,
        marginValue,
        minProfitToman,
        isDefault: false,
      });
    }
    onGenerate(rows);
    onClose();
  }

  return (
    <div className="space-y-4 rounded-xl border border-primary/30 bg-primary-soft/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-fg">تولید تنوع‌ها (ضرب دکارتی)</p>
        <button type="button" onClick={onClose} aria-label="بستن" className="text-fg-muted hover:text-fg">
          <Icons.X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="مقادیر اسمی (جدا شده با کاما)" htmlFor="gen-denoms" hint="مثال: 10, 25, 50, 100">
          <Input id="gen-denoms" value={denomText} onChange={(e) => setDenomText(e.target.value)} dir="ltr" />
        </Field>
        <Field label="ارز" htmlFor="gen-currency">
          <Select id="gen-currency" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
            {refData.currencies.map((c) => (
              <option key={c.code} value={c.code}>{c.nameFa} ({c.symbol})</option>
            ))}
          </Select>
        </Field>
      </div>

      {!rate && currencyCode && (
        <p className="text-xs text-warn">نرخ فعالی برای این ارز ثبت نشده — قیمت‌ها بر پایه نرخ صفر محاسبه می‌شود؛ پس از تولید، در نرخ ارز یک نرخ ثبت کنید.</p>
      )}

      <div>
        <p className="mb-1.5 text-sm font-medium text-fg">مناطق (اختیاری — خالی یعنی بدون منطقه)</p>
        <div className="flex flex-wrap gap-3">
          {refData.regions.map((r) => (
            <Checkbox key={r.id} checked={selectedRegionIds.has(r.id)} onChange={() => toggleRegion(r.id)} label={r.nameFa} />
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="نوع سود" htmlFor="gen-margin-type">
          <Select id="gen-margin-type" value={marginType} onChange={(e) => setMarginType(e.target.value as 'PERCENT' | 'FIXED')}>
            <option value="PERCENT">درصدی</option>
            <option value="FIXED">مبلغ ثابت</option>
          </Select>
        </Field>
        <Field label={marginType === 'PERCENT' ? 'درصد سود' : 'مبلغ سود (تومان)'} htmlFor="gen-margin-value">
          <Input id="gen-margin-value" type="number" value={marginValue} onChange={(e) => setMarginValue(Math.trunc(Number(e.target.value) || 0))} />
        </Field>
        <Field label="حداقل سود (تومان)" htmlFor="gen-min-profit">
          <Input id="gen-min-profit" type="number" value={minProfitToman} onChange={(e) => setMinProfitToman(Math.max(0, Math.trunc(Number(e.target.value) || 0)))} />
        </Field>
      </div>

      {preview.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border-base">
          <table className="w-full min-w-[32rem] text-xs">
            <thead className="bg-surface-muted">
              <tr>
                <th className="p-2 text-start">مقدار</th>
                <th className="p-2 text-start">منطقه</th>
                <th className="p-2 text-end">قیمت تمام‌شده</th>
                <th className="p-2 text-end">قیمت پیشنهادی</th>
                <th className="p-2 text-end">سود</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p, i) => (
                <tr key={i} className="border-t border-border-base">
                  <td className="p-2 tnum">{toPersianDigits(p.face)} {currency?.symbol}</td>
                  <td className="p-2">{p.region?.nameFa ?? '—'}</td>
                  <td className="p-2 text-end"><Money value={p.cost} /></td>
                  <td className="p-2 text-end"><Money value={p.breakdown.listPriceToman} /></td>
                  <td className="p-2 text-end"><Money value={p.breakdown.profitToman} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>انصراف</Button>
        <Button type="button" size="sm" disabled={preview.length === 0} onClick={generate}>
          افزودن {preview.length.toLocaleString('fa-IR')} تنوع
        </Button>
      </div>
    </div>
  );
}
