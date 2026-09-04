'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button, Modal, Field, Input, Textarea, Select, Checkbox } from '@/components/ui';
import { toPersianDigits } from '@/lib/persian';
import { saveFaq, deleteFaq } from './actions';

export type FaqRow = {
  id: string; questionFa: string; answerFa: string; categoryId: string | null; group: string; sortOrder: number; isActive: boolean;
  category: { nameFa: string } | null;
};

const EMPTY = { questionFa: '', answerFa: '', categoryId: '', group: 'general', sortOrder: 0, isActive: true };

export function FaqsClient({ faqs, categories }: { faqs: FaqRow[]; categories: { id: string; nameFa: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FaqRow | null>(null);
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }
  function openEdit(f: FaqRow) {
    setEditing(f);
    setForm({ questionFa: f.questionFa, answerFa: f.answerFa, categoryId: f.categoryId ?? '', group: f.group, sortOrder: f.sortOrder, isActive: f.isActive });
    setError(null);
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await saveFaq({ id: editing?.id, ...form, categoryId: form.categoryId || undefined });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setOpen(false);
      router.refresh();
    }
  }

  async function remove(id: string) {
    if (!window.confirm('این سؤال حذف شود؟')) return;
    const res = await deleteFaq({ id });
    if (!res.ok) window.alert(res.error);
    else router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          سؤال جدید
        </Button>
      </div>

      <ul className="space-y-2">
        {faqs.map((f) => (
          <li key={f.id} className="rounded-xl border border-border-base bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-fg">{f.questionFa}</p>
                <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{f.answerFa}</p>
                <p className="mt-1 text-[11px] text-fg-faint">
                  گروه: {f.group} {f.category && `— دسته: ${f.category.nameFa}`} — ترتیب: {toPersianDigits(f.sortOrder)} {!f.isActive && '— غیرفعال'}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button size="xs" variant="ghost" onClick={() => openEdit(f)}>
                  <Pencil className="size-3.5" aria-hidden />
                </Button>
                <Button size="xs" variant="ghost" onClick={() => remove(f.id)}>
                  <Trash2 className="size-3.5 text-danger" aria-hidden />
                </Button>
              </div>
            </div>
          </li>
        ))}
        {faqs.length === 0 && <p className="py-8 text-center text-sm text-fg-muted">سؤالی ثبت نشده است.</p>}
      </ul>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'ویرایش سؤال' : 'سؤال جدید'} size="lg">
        <div className="space-y-3">
          <Field label="سؤال" required>
            <Input value={form.questionFa} onChange={(e) => setForm((f) => ({ ...f, questionFa: e.target.value }))} />
          </Field>
          <Field label="پاسخ" required>
            <Textarea value={form.answerFa} onChange={(e) => setForm((f) => ({ ...f, answerFa: e.target.value }))} rows={5} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="دسته‌بندی (اختیاری)">
              <Select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.nameFa}</option>)}
              </Select>
            </Field>
            <Field label="گروه">
              <Input value={form.group} onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))} dir="ltr" />
            </Field>
            <Field label="ترتیب نمایش">
              <Input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} />
            </Field>
          </div>
          <Checkbox checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} label="فعال" />
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>انصراف</Button>
          <Button size="sm" loading={busy} disabled={form.questionFa.trim().length < 3 || form.answerFa.trim().length < 1} onClick={submit}>
            {editing ? 'ذخیره تغییرات' : 'ایجاد سؤال'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
