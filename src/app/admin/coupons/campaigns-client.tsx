'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button, Modal, Field, Input, Textarea, Checkbox } from '@/components/ui';
import { StatusPill } from '@/components/admin/kit';
import { formatJalali, toPersianDigits } from '@/lib/persian';
import { saveCampaign, deleteCampaign } from './actions';

export type CampaignRow = {
  id: string; nameFa: string; descriptionFa: string | null; discountPercent: number;
  bannerDesktop: string | null; bannerMobile: string | null; startsAt: Date; endsAt: Date;
  isActive: boolean; productIds: string[];
};
type ProductOpt = { id: string; nameFa: string; slug: string };

function toDateInput(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

const EMPTY = { nameFa: '', descriptionFa: '', discountPercent: 10, bannerDesktop: '', bannerMobile: '', startsAt: '', endsAt: '', isActive: true, productIds: [] as string[] };

export function CampaignsClient({ campaigns, products }: { campaigns: CampaignRow[]; products: ProductOpt[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CampaignRow | null>(null);
  const [form, setForm] = React.useState(EMPTY);
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setQuery('');
    setError(null);
    setOpen(true);
  }
  function openEdit(c: CampaignRow) {
    setEditing(c);
    setForm({
      nameFa: c.nameFa, descriptionFa: c.descriptionFa ?? '', discountPercent: c.discountPercent,
      bannerDesktop: c.bannerDesktop ?? '', bannerMobile: c.bannerMobile ?? '',
      startsAt: toDateInput(c.startsAt), endsAt: toDateInput(c.endsAt), isActive: c.isActive, productIds: c.productIds,
    });
    setQuery('');
    setError(null);
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await saveCampaign({
      id: editing?.id,
      nameFa: form.nameFa,
      descriptionFa: form.descriptionFa || undefined,
      discountPercent: form.discountPercent,
      bannerDesktop: form.bannerDesktop || undefined,
      bannerMobile: form.bannerMobile || undefined,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      isActive: form.isActive,
      productIds: form.productIds,
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setOpen(false);
      router.refresh();
    }
  }

  async function remove(id: string) {
    if (!window.confirm('این کمپین حذف شود؟')) return;
    const res = await deleteCampaign({ id });
    if (!res.ok) window.alert(res.error);
    else router.refresh();
  }

  function toggleProduct(id: string) {
    setForm((f) => ({ ...f, productIds: f.productIds.includes(id) ? f.productIds.filter((p) => p !== id) : [...f.productIds, id] }));
  }

  const filteredProducts = query ? products.filter((p) => p.nameFa.includes(query) || p.slug.includes(query)) : products.slice(0, 60);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          کمپین جدید
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((c) => (
          <div key={c.id} className="rounded-xl border border-border-base bg-surface p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="font-medium text-fg">{c.nameFa}</p>
              <StatusPill status={c.isActive ? 'ACTIVE' : 'INACTIVE'} />
            </div>
            {c.descriptionFa && <p className="mb-2 text-xs text-fg-muted line-clamp-2">{c.descriptionFa}</p>}
            <p className="mb-2 text-xs text-fg-muted">تخفیف: <span className="tnum">{toPersianDigits(c.discountPercent)}٪</span></p>
            <p className="mb-3 text-xs text-fg-faint">{formatJalali(c.startsAt)} تا {formatJalali(c.endsAt)}</p>
            <p className="mb-3 text-xs text-fg-faint">{toPersianDigits(c.productIds.length)} محصول</p>
            <div className="flex gap-1.5">
              <Button size="xs" variant="secondary" onClick={() => openEdit(c)}>
                <Pencil className="size-3.5" aria-hidden />
                ویرایش
              </Button>
              <Button size="xs" variant="ghost" onClick={() => remove(c.id)}>
                <Trash2 className="size-3.5 text-danger" aria-hidden />
              </Button>
            </div>
          </div>
        ))}
        {campaigns.length === 0 && <p className="col-span-full py-8 text-center text-sm text-fg-muted">کمپینی ثبت نشده است.</p>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'ویرایش کمپین' : 'کمپین جدید'} size="lg">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نام کمپین" required className="sm:col-span-2">
            <Input value={form.nameFa} onChange={(e) => setForm((f) => ({ ...f, nameFa: e.target.value }))} />
          </Field>
          <Field label="توضیحات" className="sm:col-span-2">
            <Textarea value={form.descriptionFa} onChange={(e) => setForm((f) => ({ ...f, descriptionFa: e.target.value }))} rows={2} />
          </Field>
          <Field label="درصد تخفیف">
            <Input type="number" min={0} max={100} value={form.discountPercent} onChange={(e) => setForm((f) => ({ ...f, discountPercent: Number(e.target.value) }))} />
          </Field>
          <div />
          <Field label="تاریخ شروع" required>
            <Input type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
          </Field>
          <Field label="تاریخ پایان" required>
            <Input type="date" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
          </Field>
          <Field label="بنر دسکتاپ (مسیر تصویر)">
            <Input value={form.bannerDesktop} onChange={(e) => setForm((f) => ({ ...f, bannerDesktop: e.target.value }))} dir="ltr" placeholder="/media/banners/…" />
          </Field>
          <Field label="بنر موبایل (مسیر تصویر)">
            <Input value={form.bannerMobile} onChange={(e) => setForm((f) => ({ ...f, bannerMobile: e.target.value }))} dir="ltr" placeholder="/media/banners/…" />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} label="فعال" />
          </div>
          <Field label="محصولات کمپین" className="sm:col-span-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جست‌وجوی محصول…" className="mb-2" />
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border-base p-2">
              {filteredProducts.map((p) => (
                <Checkbox key={p.id} checked={form.productIds.includes(p.id)} onChange={() => toggleProduct(p.id)} label={p.nameFa} className="py-1" />
              ))}
              {filteredProducts.length === 0 && <p className="p-2 text-xs text-fg-muted">محصولی یافت نشد.</p>}
            </div>
            <p className="mt-1 text-xs text-fg-faint">{toPersianDigits(form.productIds.length)} محصول انتخاب شده</p>
          </Field>
        </div>
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>انصراف</Button>
          <Button size="sm" loading={busy} disabled={form.nameFa.trim().length < 2 || !form.startsAt || !form.endsAt} onClick={submit}>
            {editing ? 'ذخیره تغییرات' : 'ایجاد کمپین'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
