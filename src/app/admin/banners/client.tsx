'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Plus, Pencil, Trash2, ImageOff } from 'lucide-react';
import { Button, Modal, Field, Input, Checkbox } from '@/components/ui';
import { StatusPill } from '@/components/admin/kit';
import { formatJalali } from '@/lib/persian';
import { saveBanner, deleteBanner } from './actions';

export type BannerRow = {
  id: string; titleFa: string; subtitleFa: string | null; ctaLabel: string | null; href: string | null;
  imageDesktop: string | null; imageMobile: string | null; bgColor: string | null; position: string; sortOrder: number;
  startsAt: Date | null; endsAt: Date | null; isActive: boolean;
};

const EMPTY = {
  titleFa: '', subtitleFa: '', ctaLabel: '', href: '', imageDesktop: '', imageMobile: '', bgColor: '',
  position: 'home-hero', sortOrder: 0, startsAt: '', endsAt: '', isActive: true,
};

function toDateInput(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : '';
}

export function BannersClient({ banners }: { banners: BannerRow[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BannerRow | null>(null);
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }
  function openEdit(b: BannerRow) {
    setEditing(b);
    setForm({
      titleFa: b.titleFa, subtitleFa: b.subtitleFa ?? '', ctaLabel: b.ctaLabel ?? '', href: b.href ?? '',
      imageDesktop: b.imageDesktop ?? '', imageMobile: b.imageMobile ?? '', bgColor: b.bgColor ?? '',
      position: b.position, sortOrder: b.sortOrder, startsAt: toDateInput(b.startsAt), endsAt: toDateInput(b.endsAt), isActive: b.isActive,
    });
    setError(null);
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await saveBanner({
      id: editing?.id, ...form,
      subtitleFa: form.subtitleFa || undefined, ctaLabel: form.ctaLabel || undefined, href: form.href || undefined,
      imageDesktop: form.imageDesktop || undefined, imageMobile: form.imageMobile || undefined, bgColor: form.bgColor || undefined,
      startsAt: form.startsAt || undefined, endsAt: form.endsAt || undefined,
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setOpen(false);
      router.refresh();
    }
  }

  async function remove(id: string) {
    if (!window.confirm('این بنر حذف شود؟')) return;
    const res = await deleteBanner({ id });
    if (!res.ok) window.alert(res.error);
    else router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          بنر جدید
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {banners.map((b) => (
          <div key={b.id} className="overflow-hidden rounded-xl border border-border-base bg-surface">
            <div className="relative aspect-[16/7] bg-surface-muted">
              {b.imageDesktop ? (
                <Image src={b.imageDesktop} alt="" fill sizes="320px" className="object-cover" />
              ) : (
                <div className="grid size-full place-items-center text-fg-faint"><ImageOff className="size-6" aria-hidden /></div>
              )}
            </div>
            <div className="p-3">
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="font-medium text-fg">{b.titleFa}</p>
                <StatusPill status={b.isActive ? 'ACTIVE' : 'INACTIVE'} />
              </div>
              <p className="text-xs text-fg-faint">موقعیت: {b.position} — ترتیب: {b.sortOrder}</p>
              {(b.startsAt || b.endsAt) && (
                <p className="text-xs text-fg-faint">{b.startsAt ? formatJalali(b.startsAt) : '—'} تا {b.endsAt ? formatJalali(b.endsAt) : '—'}</p>
              )}
              <div className="mt-2 flex gap-1.5">
                <Button size="xs" variant="secondary" onClick={() => openEdit(b)}>
                  <Pencil className="size-3.5" aria-hidden />
                  ویرایش
                </Button>
                <Button size="xs" variant="ghost" onClick={() => remove(b.id)}>
                  <Trash2 className="size-3.5 text-danger" aria-hidden />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {banners.length === 0 && <p className="col-span-full py-8 text-center text-sm text-fg-muted">بنری ثبت نشده است.</p>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'ویرایش بنر' : 'بنر جدید'} size="lg">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="عنوان" required>
            <Input value={form.titleFa} onChange={(e) => setForm((f) => ({ ...f, titleFa: e.target.value }))} />
          </Field>
          <Field label="زیرعنوان">
            <Input value={form.subtitleFa} onChange={(e) => setForm((f) => ({ ...f, subtitleFa: e.target.value }))} />
          </Field>
          <Field label="متن دکمه">
            <Input value={form.ctaLabel} onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))} />
          </Field>
          <Field label="لینک مقصد">
            <Input value={form.href} onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))} dir="ltr" />
          </Field>
          <Field label="تصویر دسکتاپ">
            <Input value={form.imageDesktop} onChange={(e) => setForm((f) => ({ ...f, imageDesktop: e.target.value }))} dir="ltr" placeholder="/media/banners/…" />
          </Field>
          <Field label="تصویر موبایل">
            <Input value={form.imageMobile} onChange={(e) => setForm((f) => ({ ...f, imageMobile: e.target.value }))} dir="ltr" placeholder="/media/banners/…" />
          </Field>
          <Field label="رنگ پس‌زمینه">
            <Input value={form.bgColor} onChange={(e) => setForm((f) => ({ ...f, bgColor: e.target.value }))} dir="ltr" placeholder="#5b3df5" />
          </Field>
          <Field label="موقعیت نمایش" hint="مثلاً home-hero یا home-strip">
            <Input value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} dir="ltr" />
          </Field>
          <Field label="ترتیب نمایش">
            <Input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} />
          </Field>
          <div />
          <Field label="تاریخ شروع">
            <Input type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
          </Field>
          <Field label="تاریخ پایان">
            <Input type="date" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} label="فعال" />
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>انصراف</Button>
          <Button size="sm" loading={busy} disabled={form.titleFa.trim().length < 1} onClick={submit}>
            {editing ? 'ذخیره تغییرات' : 'ایجاد بنر'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
