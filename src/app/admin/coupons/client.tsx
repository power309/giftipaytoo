'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Dices } from 'lucide-react';
import { Button, Modal, Field, Input, Select, Checkbox } from '@/components/ui';
import { Money, StatusPill, DemoBadge } from '@/components/admin/kit';
import { formatJalali } from '@/lib/persian';
import { COUPON_SCOPE_OPTIONS, randomCouponCode } from './_lib';
import { saveCoupon, toggleCouponActive, deleteCoupon } from './actions';
import type { Coupon } from '@prisma/client';

export type CouponRow = Coupon & { uses: number; discountGiven: number; revenue: number };
type Pick = { id: string; nameFa: string };

const EMPTY = {
  code: '', nameFa: '', type: 'PERCENT' as 'PERCENT' | 'FIXED', value: 10, maxDiscountToman: '', minOrderToman: 0,
  usageLimit: '', perUserLimit: 1, scope: 'GLOBAL' as string, targetId: '', customerGroupId: '',
  firstOrderOnly: false, startsAt: '', endsAt: '', isActive: true,
};

function toDateInput(d: Date | null): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

export function CouponsClient({
  coupons, groups, categories, brands, suppliers, products,
}: {
  coupons: CouponRow[];
  groups: Pick[];
  categories: Pick[];
  brands: Pick[];
  suppliers: Pick[];
  products: { id: string; nameFa: string; slug: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CouponRow | null>(null);
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }
  function openEdit(c: CouponRow) {
    setEditing(c);
    setForm({
      code: c.code, nameFa: c.nameFa, type: c.type, value: c.value,
      maxDiscountToman: c.maxDiscountToman?.toString() ?? '', minOrderToman: c.minOrderToman,
      usageLimit: c.usageLimit?.toString() ?? '', perUserLimit: c.perUserLimit, scope: c.scope,
      targetId: c.targetId ?? '', customerGroupId: c.customerGroupId ?? '', firstOrderOnly: c.firstOrderOnly,
      startsAt: toDateInput(c.startsAt), endsAt: toDateInput(c.endsAt), isActive: c.isActive,
    });
    setError(null);
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await saveCoupon({
      id: editing?.id,
      code: form.code,
      nameFa: form.nameFa,
      type: form.type,
      value: form.value,
      maxDiscountToman: form.maxDiscountToman ? Number(form.maxDiscountToman) : undefined,
      minOrderToman: form.minOrderToman,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
      perUserLimit: form.perUserLimit,
      scope: form.scope as never,
      targetId: form.targetId || undefined,
      customerGroupId: form.customerGroupId || undefined,
      firstOrderOnly: form.firstOrderOnly,
      startsAt: form.startsAt || undefined,
      endsAt: form.endsAt || undefined,
      isActive: form.isActive,
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setOpen(false);
      router.refresh();
    }
  }

  async function toggle(c: CouponRow) {
    setBusy(true);
    await toggleCouponActive({ id: c.id, isActive: !c.isActive });
    setBusy(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm('این کد تخفیف حذف شود؟')) return;
    const res = await deleteCoupon({ id });
    if (!res.ok) window.alert(res.error);
    else router.refresh();
  }

  const targetOptions =
    form.scope === 'CATEGORY' ? categories : form.scope === 'BRAND' ? brands : form.scope === 'SUPPLIER' ? suppliers : form.scope === 'PRODUCT' ? products : null;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          کد تخفیف جدید
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-base bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-base bg-surface-muted text-xs text-fg-muted">
              <th className="p-3 text-start font-medium">کد</th>
              <th className="p-3 text-start font-medium">مقدار</th>
              <th className="p-3 text-start font-medium">استفاده</th>
              <th className="p-3 text-start font-medium">درآمد حاصل</th>
              <th className="p-3 text-start font-medium">تخفیف داده‌شده</th>
              <th className="p-3 text-start font-medium">بازه</th>
              <th className="p-3 text-center font-medium">فعال</th>
              <th className="p-3 text-end font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-b border-border-base last:border-0">
                <td className="p-3">
                  <p className="font-mono font-medium text-fg tnum" dir="ltr">{c.code}</p>
                  <p className="flex items-center gap-1 text-xs text-fg-muted">
                    {c.nameFa}
                    {c.isDemo && <DemoBadge />}
                  </p>
                </td>
                <td className="p-3 tnum">{c.type === 'PERCENT' ? `${c.value.toLocaleString('fa-IR')}٪` : c.value.toLocaleString('fa-IR') + ' ت'}</td>
                <td className="p-3 tnum">{c.uses.toLocaleString('fa-IR')}{c.usageLimit ? ` / ${c.usageLimit.toLocaleString('fa-IR')}` : ''}</td>
                <td className="p-3"><Money value={c.revenue} /></td>
                <td className="p-3"><Money value={c.discountGiven} /></td>
                <td className="p-3 text-xs text-fg-muted">
                  {c.startsAt ? formatJalali(c.startsAt) : '—'} تا {c.endsAt ? formatJalali(c.endsAt) : '—'}
                </td>
                <td className="p-3 text-center">
                  <StatusPill status={c.isActive ? 'ACTIVE' : 'INACTIVE'} />
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1.5">
                    <Button size="xs" variant="ghost" loading={busy} onClick={() => toggle(c)}>
                      {c.isActive ? 'غیرفعال' : 'فعال'}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => openEdit(c)}>
                      <Pencil className="size-3.5" aria-hidden />
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => remove(c.id)}>
                      <Trash2 className="size-3.5 text-danger" aria-hidden />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {coupons.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-sm text-fg-muted">کد تخفیفی ثبت نشده است.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'ویرایش کد تخفیف' : 'کد تخفیف جدید'} size="lg">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="کد تخفیف" required className="sm:col-span-2">
            <div className="flex gap-2">
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} dir="ltr" className="font-mono" />
              <Button type="button" variant="secondary" size="md" onClick={() => setForm((f) => ({ ...f, code: randomCouponCode() }))}>
                <Dices className="size-4" aria-hidden />
              </Button>
            </div>
          </Field>
          <Field label="نام" required className="sm:col-span-2">
            <Input value={form.nameFa} onChange={(e) => setForm((f) => ({ ...f, nameFa: e.target.value }))} />
          </Field>
          <Field label="نوع تخفیف" required>
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as typeof form.type }))}>
              <option value="PERCENT">درصدی</option>
              <option value="FIXED">مبلغ ثابت (تومان)</option>
            </Select>
          </Field>
          <Field label={form.type === 'PERCENT' ? 'درصد تخفیف' : 'مبلغ تخفیف (تومان)'} required>
            <Input type="number" min={1} value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))} />
          </Field>
          {form.type === 'PERCENT' && (
            <Field label="سقف تخفیف (تومان، اختیاری)">
              <Input type="number" min={0} value={form.maxDiscountToman} onChange={(e) => setForm((f) => ({ ...f, maxDiscountToman: e.target.value }))} />
            </Field>
          )}
          <Field label="حداقل مبلغ سفارش">
            <Input type="number" min={0} value={form.minOrderToman} onChange={(e) => setForm((f) => ({ ...f, minOrderToman: Number(e.target.value) }))} />
          </Field>
          <Field label="سقف کل استفاده (اختیاری)">
            <Input type="number" min={0} value={form.usageLimit} onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))} />
          </Field>
          <Field label="سقف استفاده هر کاربر">
            <Input type="number" min={1} value={form.perUserLimit} onChange={(e) => setForm((f) => ({ ...f, perUserLimit: Number(e.target.value) }))} />
          </Field>
          <Field label="محدوده اعمال تخفیف">
            <Select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value, targetId: '' }))}>
              {COUPON_SCOPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          {targetOptions && (
            <Field label="هدف">
              <Select value={form.targetId} onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}>
                <option value="">انتخاب کنید…</option>
                {targetOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.nameFa}</option>
                ))}
              </Select>
            </Field>
          )}
          {form.scope === 'VARIANT' && (
            <Field label="شناسه متغیر محصول" hint="شناسه (id) متغیر محصول را وارد کنید.">
              <Input value={form.targetId} onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))} dir="ltr" />
            </Field>
          )}
          <Field label="گروه مشتری مجاز (اختیاری)">
            <Select value={form.customerGroupId} onChange={(e) => setForm((f) => ({ ...f, customerGroupId: e.target.value }))}>
              <option value="">همه مشتریان</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.nameFa}</option>
              ))}
            </Select>
          </Field>
          <Field label="تاریخ شروع">
            <Input type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
          </Field>
          <Field label="تاریخ پایان">
            <Input type="date" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
          </Field>
          <div className="sm:col-span-2 flex flex-wrap gap-4">
            <Checkbox checked={form.firstOrderOnly} onChange={(e) => setForm((f) => ({ ...f, firstOrderOnly: e.target.checked }))} label="فقط برای اولین سفارش" />
            <Checkbox checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} label="فعال" />
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>انصراف</Button>
          <Button size="sm" loading={busy} disabled={form.code.trim().length < 3 || form.nameFa.trim().length < 2} onClick={submit}>
            {editing ? 'ذخیره تغییرات' : 'ایجاد کد تخفیف'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
