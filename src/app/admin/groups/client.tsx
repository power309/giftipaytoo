'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button, Modal, Field, Input, Textarea, Checkbox } from '@/components/ui';
import { saveCustomerGroup, deleteCustomerGroup } from './actions';

export type GroupRow = {
  id: string;
  nameFa: string;
  description: string | null;
  discountPercent: number;
  isReseller: boolean;
  minSpendToman: number;
  priority: number;
  isActive: boolean;
  memberCount: number;
};

const EMPTY: Omit<GroupRow, 'id' | 'memberCount'> = {
  nameFa: '', description: '', discountPercent: 0, isReseller: false, minSpendToman: 0, priority: 0, isActive: true,
};

export function GroupsClient({ groups }: { groups: GroupRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<GroupRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(EMPTY);

  function openCreate() {
    setForm(EMPTY);
    setError(null);
    setCreating(true);
  }
  function openEdit(g: GroupRow) {
    setForm({ nameFa: g.nameFa, description: g.description ?? '', discountPercent: g.discountPercent, isReseller: g.isReseller, minSpendToman: g.minSpendToman, priority: g.priority, isActive: g.isActive });
    setError(null);
    setEditing(g);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await saveCustomerGroup({ id: editing?.id, ...form, description: form.description || undefined });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setEditing(null);
      setCreating(false);
      router.refresh();
    }
  }

  async function remove(id: string) {
    if (!window.confirm('این گروه حذف شود؟')) return;
    setBusy(true);
    const res = await deleteCustomerGroup({ id });
    setBusy(false);
    if (!res.ok) window.alert(res.error);
    else router.refresh();
  }

  const open = creating || !!editing;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          گروه جدید
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-base bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-base bg-surface-muted text-xs text-fg-muted">
              <th className="p-3 text-start font-medium">نام</th>
              <th className="p-3 text-start font-medium">تخفیف</th>
              <th className="p-3 text-start font-medium">حداقل خرید</th>
              <th className="p-3 text-center font-medium">نمایندگی</th>
              <th className="p-3 text-center font-medium">اعضا</th>
              <th className="p-3 text-center font-medium">فعال</th>
              <th className="p-3 text-end font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-b border-border-base last:border-0">
                <td className="p-3">
                  <p className="font-medium text-fg">{g.nameFa}</p>
                  {g.description && <p className="text-xs text-fg-muted">{g.description}</p>}
                </td>
                <td className="p-3 tnum">{g.discountPercent.toLocaleString('fa-IR')}٪</td>
                <td className="p-3 tnum">{g.minSpendToman.toLocaleString('fa-IR')}</td>
                <td className="p-3 text-center">{g.isReseller ? 'بله' : 'خیر'}</td>
                <td className="p-3 text-center tnum">{g.memberCount.toLocaleString('fa-IR')}</td>
                <td className="p-3 text-center">{g.isActive ? 'بله' : 'خیر'}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1.5">
                    <Button size="xs" variant="ghost" onClick={() => openEdit(g)}>
                      <Pencil className="size-3.5" aria-hidden />
                    </Button>
                    <Button size="xs" variant="ghost" loading={busy} onClick={() => remove(g.id)}>
                      <Trash2 className="size-3.5 text-danger" aria-hidden />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-sm text-fg-muted">
                  گروهی تعریف نشده است.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'ویرایش گروه' : 'گروه جدید'}>
        <div className="space-y-3">
          <Field label="نام گروه" required>
            <Input value={form.nameFa} onChange={(e) => setForm((f) => ({ ...f, nameFa: e.target.value }))} />
          </Field>
          <Field label="توضیحات">
            <Textarea value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="درصد تخفیف">
              <Input type="number" min={0} max={100} value={form.discountPercent} onChange={(e) => setForm((f) => ({ ...f, discountPercent: Number(e.target.value) }))} />
            </Field>
            <Field label="حداقل خرید (تومان)">
              <Input type="number" min={0} value={form.minSpendToman} onChange={(e) => setForm((f) => ({ ...f, minSpendToman: Number(e.target.value) }))} />
            </Field>
            <Field label="اولویت">
              <Input type="number" min={0} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))} />
            </Field>
          </div>
          <Checkbox checked={form.isReseller} onChange={(e) => setForm((f) => ({ ...f, isReseller: e.target.checked }))} label="گروه نمایندگی (Reseller)" />
          <Checkbox checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} label="فعال" />
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setEditing(null); }}>
            انصراف
          </Button>
          <Button size="sm" loading={busy} disabled={form.nameFa.trim().length < 2} onClick={submit}>
            {editing ? 'ذخیره تغییرات' : 'ایجاد گروه'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
