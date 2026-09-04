'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button, Field, Input, Textarea, Select, Checkbox, Modal } from '@/components/ui';
import { Panel } from '@/components/admin/kit';
import { toPersianDigits } from '@/lib/persian';
import { saveSeoDefaults, saveOgDefaults, saveRobotsTxt, saveRedirect, deleteRedirect } from './actions';

export function SeoDefaultsForm({ defaultTitle, defaultDescription }: { defaultTitle: string; defaultDescription: string }) {
  const router = useRouter();
  const [title, setTitle] = React.useState(defaultTitle);
  const [description, setDescription] = React.useState(defaultDescription);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await saveSeoDefaults({ defaultTitle: title, defaultDescription: description });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <Panel title="قالب پیش‌فرض متادیتا">
      <div className="space-y-3">
        <Field label="عنوان پیش‌فرض">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="توضیحات پیش‌فرض">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </Field>
        {error && <p className="text-xs text-danger">{error}</p>}
        {saved && !error && <p className="text-xs text-accent">ذخیره شد.</p>}
        <Button size="sm" loading={busy} onClick={submit}>ذخیره</Button>
      </div>
    </Panel>
  );
}

export function OgDefaultsForm({ og }: { og: { title: string; description: string; image: string } }) {
  const router = useRouter();
  const [title, setTitle] = React.useState(og.title);
  const [description, setDescription] = React.useState(og.description);
  const [image, setImage] = React.useState(og.image);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await saveOgDefaults({ title, description, image });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <Panel title="پیش‌فرض‌های Open Graph">
      <div className="space-y-3">
        <Field label="عنوان OG">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="توضیحات OG">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
        <Field label="تصویر OG (مسیر)">
          <Input value={image} onChange={(e) => setImage(e.target.value)} dir="ltr" placeholder="/media/og-default.jpg" />
        </Field>
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button size="sm" loading={busy} onClick={submit}>ذخیره</Button>
      </div>
    </Panel>
  );
}

export function RobotsTxtForm({ content }: { content: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState(content);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await saveRobotsTxt({ content: value });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <Panel title="robots.txt">
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={8} dir="ltr" className="font-mono text-xs" />
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <Button size="sm" className="mt-2" loading={busy} onClick={submit}>ذخیره</Button>
    </Panel>
  );
}

export type RedirectRow = { id: string; fromPath: string; toPath: string; statusCode: number; isActive: boolean; hitCount: number };

const EMPTY_REDIRECT = { fromPath: '', toPath: '', statusCode: 301, isActive: true };

export function RedirectsPanel({ redirects }: { redirects: RedirectRow[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RedirectRow | null>(null);
  const [form, setForm] = React.useState(EMPTY_REDIRECT);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_REDIRECT);
    setError(null);
    setOpen(true);
  }
  function openEdit(r: RedirectRow) {
    setEditing(r);
    setForm({ fromPath: r.fromPath, toPath: r.toPath, statusCode: r.statusCode, isActive: r.isActive });
    setError(null);
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await saveRedirect({ id: editing?.id, ...form });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setOpen(false);
      router.refresh();
    }
  }

  async function remove(id: string) {
    if (!window.confirm('این ریدایرکت حذف شود؟')) return;
    const res = await deleteRedirect({ id });
    if (!res.ok) window.alert(res.error);
    else router.refresh();
  }

  return (
    <Panel
      title="مدیریت ریدایرکت‌ها"
      actions={<Button size="sm" onClick={openCreate}><Plus className="size-4" aria-hidden />ریدایرکت جدید</Button>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-base text-xs text-fg-muted">
              <th className="p-2 text-start font-medium">از</th>
              <th className="p-2 text-start font-medium">به</th>
              <th className="p-2 text-center font-medium">کد</th>
              <th className="p-2 text-center font-medium">بازدید</th>
              <th className="p-2 text-center font-medium">فعال</th>
              <th className="p-2 text-end font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {redirects.map((r) => (
              <tr key={r.id} className="border-b border-border-base last:border-0">
                <td className="p-2 tnum" dir="ltr">{r.fromPath}</td>
                <td className="p-2 tnum" dir="ltr">{r.toPath}</td>
                <td className="p-2 text-center tnum">{toPersianDigits(r.statusCode)}</td>
                <td className="p-2 text-center tnum">{toPersianDigits(r.hitCount)}</td>
                <td className="p-2 text-center">{r.isActive ? 'بله' : 'خیر'}</td>
                <td className="p-2">
                  <div className="flex justify-end gap-1.5">
                    <Button size="xs" variant="ghost" onClick={() => openEdit(r)}><Pencil className="size-3.5" aria-hidden /></Button>
                    <Button size="xs" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="size-3.5 text-danger" aria-hidden /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {redirects.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-sm text-fg-muted">ریدایرکتی ثبت نشده است.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'ویرایش ریدایرکت' : 'ریدایرکت جدید'}>
        <div className="space-y-3">
          <Field label="مسیر مبدأ" required hint="مثلاً /old-page">
            <Input value={form.fromPath} onChange={(e) => setForm((f) => ({ ...f, fromPath: e.target.value }))} dir="ltr" />
          </Field>
          <Field label="مسیر مقصد" required hint="فقط مسیرهای داخلی سایت مجاز است.">
            <Input value={form.toPath} onChange={(e) => setForm((f) => ({ ...f, toPath: e.target.value }))} dir="ltr" />
          </Field>
          <Field label="کد وضعیت">
            <Select value={form.statusCode} onChange={(e) => setForm((f) => ({ ...f, statusCode: Number(e.target.value) }))}>
              <option value={301}>۳۰۱ — دائمی</option>
              <option value={302}>۳۰۲ — موقت</option>
              <option value={307}>۳۰۷ — موقت (روش حفظ می‌شود)</option>
              <option value={308}>۳۰۸ — دائمی (روش حفظ می‌شود)</option>
            </Select>
          </Field>
          <Checkbox checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} label="فعال" />
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>انصراف</Button>
          <Button size="sm" loading={busy} disabled={!form.fromPath || !form.toPath} onClick={submit}>
            {editing ? 'ذخیره تغییرات' : 'ایجاد ریدایرکت'}
          </Button>
        </div>
      </Modal>
    </Panel>
  );
}
