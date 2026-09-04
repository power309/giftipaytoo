'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Field, Input, Select, Switch, Modal, Badge, EmptyState, Alert } from '@/components/ui';
import { Panel, Money } from '@/components/admin/kit';
import { saveRule, deleteRule, toggleRuleActive, calculateVariantPrice, runRecalculate, type CalculatorBreakdown, type RecalcSummary } from './actions';

export type PricingRuleRow = {
  id: string;
  nameFa: string;
  scope: string;
  targetId: string | null;
  targetName: string | null;
  customerGroupId: string | null;
  marginType: string;
  marginValue: number;
  minProfitToman: number;
  roundingMode: string;
  roundingStep: number;
  priority: number;
  isActive: boolean;
};

export type PricingRefData = {
  categories: { id: string; nameFa: string }[];
  brands: { id: string; nameFa: string }[];
  products: { id: string; nameFa: string }[];
  variants: { id: string; nameFa: string; sku: string }[];
  suppliers: { id: string; nameFa: string }[];
  customerGroups: { id: string; nameFa: string }[];
};

const SCOPE_LABELS: Record<string, string> = {
  GLOBAL: 'سراسری',
  CATEGORY: 'دسته',
  BRAND: 'برند',
  PRODUCT: 'محصول',
  VARIANT: 'تنوع',
  SUPPLIER: 'تأمین‌کننده',
  CUSTOMER_GROUP: 'گروه مشتری',
};

function targetOptionsFor(scope: string, refData: PricingRefData) {
  switch (scope) {
    case 'CATEGORY': return refData.categories.map((c) => ({ value: c.id, label: c.nameFa }));
    case 'BRAND': return refData.brands.map((b) => ({ value: b.id, label: b.nameFa }));
    case 'PRODUCT': return refData.products.map((p) => ({ value: p.id, label: p.nameFa }));
    case 'VARIANT': return refData.variants.map((v) => ({ value: v.id, label: `${v.nameFa} (${v.sku})` }));
    case 'SUPPLIER': return refData.suppliers.map((s) => ({ value: s.id, label: s.nameFa }));
    default: return [];
  }
}

const emptyRuleForm = {
  id: undefined as string | undefined,
  nameFa: '',
  scope: 'GLOBAL',
  targetId: '',
  customerGroupId: '',
  marginType: 'PERCENT' as 'PERCENT' | 'FIXED',
  marginValue: 20,
  minProfitToman: 0,
  roundingMode: 'NEAREST' as 'NONE' | 'UP' | 'DOWN' | 'NEAREST',
  roundingStep: 1000,
  priority: 0,
  isActive: true,
};

export function PricingManager({ initialRules, refData }: { initialRules: PricingRuleRow[]; refData: PricingRefData }) {
  const router = useRouter();
  const [rules, setRules] = React.useState(initialRules);
  React.useEffect(() => setRules(initialRules), [initialRules]);

  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyRuleForm);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function openCreate() {
    setForm(emptyRuleForm);
    setError(null);
    setFormOpen(true);
  }
  function openEdit(r: PricingRuleRow) {
    setForm({
      id: r.id,
      nameFa: r.nameFa,
      scope: r.scope,
      targetId: r.targetId ?? '',
      customerGroupId: r.customerGroupId ?? '',
      marginType: r.marginType as 'PERCENT' | 'FIXED',
      marginValue: r.marginValue,
      minProfitToman: r.minProfitToman,
      roundingMode: r.roundingMode as 'NONE' | 'UP' | 'DOWN' | 'NEAREST',
      roundingStep: r.roundingStep,
      priority: r.priority,
      isActive: r.isActive,
    });
    setError(null);
    setFormOpen(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await saveRule({
      id: form.id,
      nameFa: form.nameFa.trim(),
      scope: form.scope,
      targetId: form.targetId || null,
      customerGroupId: form.customerGroupId || null,
      marginType: form.marginType,
      marginValue: form.marginValue,
      minProfitToman: form.minProfitToman,
      roundingMode: form.roundingMode,
      roundingStep: form.roundingStep,
      priority: form.priority,
      isActive: form.isActive,
    });
    setBusy(false);
    if (res.ok) {
      setFormOpen(false);
      router.refresh();
    } else setError(res.error);
  }

  return (
    <div className="space-y-6">
      <Panel
        title="قواعد سود"
        description="قاعده با محدوده اختصاصی‌تر و اولویت بالاتر برنده می‌شود."
        actions={
          <Button type="button" size="sm" onClick={openCreate}>
            <Icons.Plus className="size-4" aria-hidden /> قاعده جدید
          </Button>
        }
      >
        {rules.length === 0 ? (
          <EmptyState icon={<Icons.Calculator className="size-7" aria-hidden />} title="قاعده‌ای ثبت نشده" action={<Button size="sm" onClick={openCreate}>افزودن قاعده</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-muted">
                <tr>
                  <th className="p-2 text-start">نام</th>
                  <th className="p-2 text-start">محدوده</th>
                  <th className="p-2 text-start">هدف</th>
                  <th className="p-2 text-start">سود</th>
                  <th className="p-2 text-start">حداقل سود</th>
                  <th className="p-2 text-start">گرد کردن</th>
                  <th className="p-2 text-start">اولویت</th>
                  <th className="p-2 text-start">وضعیت</th>
                  <th className="p-2 text-start"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-t border-border-base">
                    <td className="p-2 font-medium text-fg">{r.nameFa}</td>
                    <td className="p-2"><Badge tone="primary" size="sm">{SCOPE_LABELS[r.scope] ?? r.scope}</Badge></td>
                    <td className="p-2 text-fg-muted">{r.targetName ?? '—'}</td>
                    <td className="p-2 tnum">{r.marginType === 'PERCENT' ? `${r.marginValue.toLocaleString('fa-IR')}٪` : <Money value={r.marginValue} />}</td>
                    <td className="p-2"><Money value={r.minProfitToman} /></td>
                    <td className="p-2 text-fg-faint">{r.roundingMode !== 'NONE' ? `${r.roundingMode} / ${r.roundingStep.toLocaleString('fa-IR')}` : '—'}</td>
                    <td className="p-2 tnum">{r.priority.toLocaleString('fa-IR')}</td>
                    <td className="p-2">
                      <Switch
                        checked={r.isActive}
                        onChange={async (v) => {
                          const res = await toggleRuleActive(r.id, v);
                          if (res.ok) router.refresh();
                        }}
                        label=""
                        id={`rule-active-${r.id}`}
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <Button type="button" size="xs" variant="ghost" onClick={() => openEdit(r)}><Icons.Pencil className="size-3.5" aria-hidden /></Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="text-danger"
                          onClick={async () => {
                            if (!window.confirm('این قاعده حذف شود؟')) return;
                            const res = await deleteRule(r.id);
                            if (res.ok) router.refresh();
                            else alert(res.error);
                          }}
                        >
                          <Icons.Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <LiveCalculator refData={refData} />
        <BulkRecalculate refData={refData} />
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? 'ویرایش قاعده' : 'قاعده جدید'}
        size="lg"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>انصراف</Button>
            <Button type="button" loading={busy} onClick={submit}>ذخیره</Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          <Field label="نام قاعده" htmlFor="rule-name" required>
            <Input id="rule-name" value={form.nameFa} onChange={(e) => setForm((f) => ({ ...f, nameFa: e.target.value }))} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="محدوده" htmlFor="rule-scope">
              <Select id="rule-scope" value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value, targetId: '', customerGroupId: '' }))}>
                {Object.entries(SCOPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            {form.scope === 'CUSTOMER_GROUP' ? (
              <Field label="گروه مشتری" htmlFor="rule-group">
                <Select id="rule-group" value={form.customerGroupId} onChange={(e) => setForm((f) => ({ ...f, customerGroupId: e.target.value }))}>
                  <option value="">— انتخاب کنید —</option>
                  {refData.customerGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.nameFa}</option>
                  ))}
                </Select>
              </Field>
            ) : form.scope !== 'GLOBAL' ? (
              <Field label="هدف" htmlFor="rule-target">
                <Select id="rule-target" value={form.targetId} onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}>
                  <option value="">— انتخاب کنید —</option>
                  {targetOptionsFor(form.scope, refData).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="نوع سود" htmlFor="rule-margin-type">
              <Select id="rule-margin-type" value={form.marginType} onChange={(e) => setForm((f) => ({ ...f, marginType: e.target.value as 'PERCENT' | 'FIXED' }))}>
                <option value="PERCENT">درصدی</option>
                <option value="FIXED">مبلغ ثابت</option>
              </Select>
            </Field>
            <Field label={form.marginType === 'PERCENT' ? 'درصد سود' : 'مبلغ سود (تومان)'} htmlFor="rule-margin-value">
              <Input id="rule-margin-value" type="number" value={form.marginValue} onChange={(e) => setForm((f) => ({ ...f, marginValue: Math.trunc(Number(e.target.value) || 0) }))} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="حداقل سود (تومان)" htmlFor="rule-min-profit">
              <Input id="rule-min-profit" type="number" min={0} value={form.minProfitToman} onChange={(e) => setForm((f) => ({ ...f, minProfitToman: Math.max(0, Math.trunc(Number(e.target.value) || 0)) }))} />
            </Field>
            <Field label="حالت گرد کردن" htmlFor="rule-round-mode">
              <Select id="rule-round-mode" value={form.roundingMode} onChange={(e) => setForm((f) => ({ ...f, roundingMode: e.target.value as typeof form.roundingMode }))}>
                <option value="NONE">بدون گرد کردن</option>
                <option value="UP">به بالا</option>
                <option value="DOWN">به پایین</option>
                <option value="NEAREST">نزدیک‌ترین</option>
              </Select>
            </Field>
            <Field label="پله گرد کردن (تومان)" htmlFor="rule-round-step">
              <Input id="rule-round-step" type="number" min={1} value={form.roundingStep} onChange={(e) => setForm((f) => ({ ...f, roundingStep: Math.max(1, Math.trunc(Number(e.target.value) || 1)) }))} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اولویت (در تساوی محدوده)" htmlFor="rule-priority" hint="عدد بزرگ‌تر اولویت بالاتر دارد.">
              <Input id="rule-priority" type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: Math.trunc(Number(e.target.value) || 0) }))} />
            </Field>
            <div className="flex items-end">
              <Switch checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} label="فعال" id="rule-active" />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function LiveCalculator({ refData }: { refData: PricingRefData }) {
  const [variantId, setVariantId] = React.useState('');
  const [result, setResult] = React.useState<CalculatorBreakdown | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    if (!variantId) return;
    setBusy(true);
    setError(null);
    const res = await calculateVariantPrice(variantId);
    setBusy(false);
    if (res.ok) setResult(res.data!);
    else setError(res.error);
  }

  return (
    <Panel title="محاسبه‌گر زنده قیمت" description="مسیر محاسبه قیمت را برای یک تنوع مشخص، مرحله‌به‌مرحله ببینید.">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="تنوع محصول" htmlFor="calc-variant" className="min-w-[14rem] flex-1">
          <Select id="calc-variant" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            <option value="">— انتخاب کنید —</option>
            {refData.variants.map((v) => (
              <option key={v.id} value={v.id}>{v.nameFa} ({v.sku})</option>
            ))}
          </Select>
        </Field>
        <Button type="button" size="sm" loading={busy} disabled={!variantId} onClick={run}>محاسبه</Button>
      </div>

      {error && <Alert tone="danger" className="mt-3">{error}</Alert>}

      {result && (
        <div className="mt-4 space-y-2">
          <StepRow label="۱. قیمت تمام‌شده" value={<Money value={result.costToman} />} hint={result.rateUsed ? `نرخ ارز: ${result.rateUsed.toLocaleString('fa-IR')} تومان${result.isStale ? ' — قدیمی' : ''}` : undefined} />
          <StepRow label="۲. سود (قاعده)" value={<Money value={result.marginToman} />} hint={result.ruleSource ? `منبع قاعده: ${SCOPE_LABELS[result.ruleSource] ?? result.ruleSource}` : 'بدون قاعده'} />
          <StepRow label="۳. قیمت خام" value={<Money value={result.rawPriceToman} />} />
          <StepRow label="۴. کف حداقل سود" value={result.minProfitApplied ? 'اعمال شد' : 'لازم نبود'} tone={result.minProfitApplied ? 'warn' : undefined} />
          <StepRow label="۵. قیمت نهایی (پس از گرد کردن)" value={<Money value={result.listPriceToman} className="text-base font-bold" />} tone="primary" />
          <StepRow label="سود نهایی" value={<span className="tnum">{<Money value={result.profitToman} />} ({result.profitPercent.toLocaleString('fa-IR')}٪)</span>} />
          <StepRow label="قیمت فعلی ثبت‌شده" value={<Money value={result.currentBasePriceToman} />} hint={result.currentBasePriceToman !== result.listPriceToman ? 'با نتیجه محاسبه‌شده فرق دارد — برای اعمال از «بازمحاسبه گروهی» استفاده کنید.' : undefined} />
        </div>
      )}
    </Panel>
  );
}

function StepRow({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: 'warn' | 'primary' }) {
  return (
    <div className={cn('rounded-lg border p-2.5 text-sm', tone === 'primary' ? 'border-primary/40 bg-primary-soft/30' : tone === 'warn' ? 'border-warn/40 bg-warn-soft/40' : 'border-border-base')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-fg-muted">{label}</span>
        <span className="font-medium text-fg">{value}</span>
      </div>
      {hint && <p className="mt-0.5 text-xs text-fg-faint">{hint}</p>}
    </div>
  );
}

function BulkRecalculate({ refData }: { refData: PricingRefData }) {
  const router = useRouter();
  const [scope, setScope] = React.useState<'ALL' | 'CATEGORY' | 'BRAND' | 'PRODUCT' | 'VARIANT' | 'SUPPLIER'>('ALL');
  const [targetId, setTargetId] = React.useState('');
  const [preview, setPreview] = React.useState<RecalcSummary | null>(null);
  const [busy, setBusy] = React.useState<'preview' | 'apply' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function runDryRun() {
    setBusy('preview');
    setError(null);
    const res = await runRecalculate({ scope, targetId: targetId || null, dryRun: true });
    setBusy(null);
    if (res.ok) setPreview(res.data!);
    else setError(res.error);
  }

  async function apply() {
    if (!window.confirm('قیمت‌های تغییریافته اعمال می‌شود (تغییرات بزرگ به صف تأیید می‌رود). ادامه می‌دهید؟')) return;
    setBusy('apply');
    setError(null);
    const res = await runRecalculate({ scope, targetId: targetId || null, dryRun: false });
    setBusy(null);
    if (res.ok) {
      setPreview(res.data!);
      router.refresh();
    } else setError(res.error);
  }

  const changed = preview?.rows.filter((r) => r.action !== 'unchanged' && r.action !== 'skipped_no_rate') ?? [];

  return (
    <Panel title="بازمحاسبه گروهی" description="قیمت‌ها را از نرخ ارز و قواعد فعلی دوباره محاسبه کنید — با پیش‌نمایش قبل از اعمال.">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="محدوده" htmlFor="recalc-scope">
          <Select id="recalc-scope" value={scope} onChange={(e) => { setScope(e.target.value as typeof scope); setTargetId(''); setPreview(null); }}>
            <option value="ALL">همه محصولات</option>
            <option value="CATEGORY">دسته</option>
            <option value="BRAND">برند</option>
            <option value="PRODUCT">محصول</option>
            <option value="VARIANT">تنوع</option>
            <option value="SUPPLIER">تأمین‌کننده</option>
          </Select>
        </Field>
        {scope !== 'ALL' && (
          <Field label="هدف" htmlFor="recalc-target" className="min-w-[12rem] flex-1">
            <Select id="recalc-target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">— انتخاب کنید —</option>
              {targetOptionsFor(scope, refData).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
        )}
        <Button type="button" size="sm" variant="secondary" loading={busy === 'preview'} disabled={scope !== 'ALL' && !targetId} onClick={runDryRun}>
          پیش‌نمایش (Dry-run)
        </Button>
      </div>

      {error && <Alert tone="danger" className="mt-3">{error}</Alert>}

      {preview && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{preview.totalConsidered.toLocaleString('fa-IR')} بررسی‌شده</Badge>
            <Badge tone="success">{preview.applied.toLocaleString('fa-IR')} تغییر مستقیم</Badge>
            <Badge tone="warn">{preview.pendingApproval.toLocaleString('fa-IR')} نیازمند تأیید</Badge>
            <Badge tone="neutral">{preview.unchanged.toLocaleString('fa-IR')} بدون تغییر</Badge>
            <Badge tone="danger">{preview.skipped.toLocaleString('fa-IR')} بدون نرخ ارز</Badge>
          </div>

          {changed.length > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border-base">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-muted">
                  <tr>
                    <th className="p-2 text-start">SKU</th>
                    <th className="p-2 text-end">قیمت فعلی</th>
                    <th className="p-2 text-end">قیمت پیشنهادی</th>
                    <th className="p-2 text-end">تغییر</th>
                    <th className="p-2 text-start">اقدام</th>
                  </tr>
                </thead>
                <tbody>
                  {changed.map((r) => (
                    <tr key={r.variantId} className="border-t border-border-base">
                      <td className="p-2" dir="ltr">{r.sku}</td>
                      <td className="p-2 text-end"><Money value={r.oldPriceToman} /></td>
                      <td className="p-2 text-end"><Money value={r.newPriceToman} /></td>
                      <td className={cn('p-2 text-end tnum', r.deltaPercentX100 >= 0 ? 'text-accent' : 'text-danger')}>
                        {(r.deltaPercentX100 / 100).toLocaleString('fa-IR')}٪
                      </td>
                      <td className="p-2">
                        {r.action === 'pending_approval' ? <Badge tone="warn" size="sm">صف تأیید</Badge> : <Badge tone="success" size="sm">اعمال مستقیم</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!preview.dryRun ? (
            <Alert tone="success">تغییرات اعمال شد.</Alert>
          ) : (
            <Button type="button" size="sm" loading={busy === 'apply'} disabled={changed.length === 0} onClick={apply}>
              اعمال {changed.length.toLocaleString('fa-IR')} تغییر
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}
