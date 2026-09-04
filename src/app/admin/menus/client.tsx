'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, CornerDownLeft } from 'lucide-react';
import { Button, Modal, Field, Input, Checkbox, Select, Tabs } from '@/components/ui';
import { saveMenuItem, deleteMenuItem, moveMenuItem } from './actions';

export type MenuItemRow = { id: string; menuKey: string; label: string; href: string; iconKey: string | null; parentId: string | null; sortOrder: number; isActive: boolean };

const MENUS = [
  { key: 'main', label: 'منوی اصلی' },
  { key: 'footer-1', label: 'فوتر — ستون ۱' },
  { key: 'footer-2', label: 'فوتر — ستون ۲' },
];

const EMPTY = { label: '', href: '', iconKey: '', parentId: '', isActive: true };

export function MenusClient({ items }: { items: MenuItemRow[] }) {
  const router = useRouter();
  const [menuKey, setMenuKey] = React.useState('main');
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MenuItemRow | null>(null);
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const menuItems = items.filter((i) => i.menuKey === menuKey);
  const roots = menuItems.filter((i) => !i.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
  const childrenOf = (id: string) => menuItems.filter((i) => i.parentId === id).sort((a, b) => a.sortOrder - b.sortOrder);

  function openCreate(parentId?: string) {
    setEditing(null);
    setForm({ ...EMPTY, parentId: parentId ?? '' });
    setError(null);
    setOpen(true);
  }
  function openEdit(i: MenuItemRow) {
    setEditing(i);
    setForm({ label: i.label, href: i.href, iconKey: i.iconKey ?? '', parentId: i.parentId ?? '', isActive: i.isActive });
    setError(null);
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await saveMenuItem({ id: editing?.id, menuKey, label: form.label, href: form.href, iconKey: form.iconKey || undefined, parentId: form.parentId || null, isActive: form.isActive });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setOpen(false);
      router.refresh();
    }
  }

  async function remove(id: string) {
    if (!window.confirm('این آیتم منو حذف شود؟')) return;
    const res = await deleteMenuItem({ id });
    if (!res.ok) window.alert(res.error);
    else router.refresh();
  }

  async function move(id: string, direction: 'up' | 'down') {
    await moveMenuItem({ id, direction });
    router.refresh();
  }

  function Row({ item, isChild }: { item: MenuItemRow; isChild?: boolean }) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-border-base p-2.5 ${isChild ? 'ms-6' : ''} ${!item.isActive ? 'opacity-60' : ''}`}>
        {isChild && <CornerDownLeft className="size-3.5 shrink-0 text-fg-faint" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{item.label}</p>
          <p className="truncate text-xs text-fg-muted" dir="ltr">{item.href}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="xs" variant="ghost" onClick={() => move(item.id, 'up')} aria-label="جابه‌جایی به بالا">
            <ArrowUp className="size-3.5" aria-hidden />
          </Button>
          <Button size="xs" variant="ghost" onClick={() => move(item.id, 'down')} aria-label="جابه‌جایی به پایین">
            <ArrowDown className="size-3.5" aria-hidden />
          </Button>
          {!isChild && (
            <Button size="xs" variant="ghost" onClick={() => openCreate(item.id)} aria-label="افزودن زیرمنو">
              <Plus className="size-3.5" aria-hidden />
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => openEdit(item)}>
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          <Button size="xs" variant="ghost" onClick={() => remove(item.id)}>
            <Trash2 className="size-3.5 text-danger" aria-hidden />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Tabs tabs={MENUS.map((m) => ({ key: m.key, label: m.label }))} active={menuKey} onChange={setMenuKey} className="mb-4" />

      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => openCreate()}>
          <Plus className="size-4" aria-hidden />
          آیتم جدید
        </Button>
      </div>

      <div className="space-y-2">
        {roots.map((r) => (
          <div key={r.id} className="space-y-2">
            <Row item={r} />
            {childrenOf(r.id).map((c) => (
              <Row key={c.id} item={c} isChild />
            ))}
          </div>
        ))}
        {roots.length === 0 && <p className="py-8 text-center text-sm text-fg-muted">آیتمی در این منو ثبت نشده است.</p>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'ویرایش آیتم منو' : 'آیتم منو جدید'}>
        <div className="space-y-3">
          <Field label="عنوان" required>
            <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          </Field>
          <Field label="لینک" required>
            <Input value={form.href} onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))} dir="ltr" placeholder="/category/gift-cards" />
          </Field>
          <Field label="آیکون (نام آیکون Lucide، اختیاری)">
            <Input value={form.iconKey} onChange={(e) => setForm((f) => ({ ...f, iconKey: e.target.value }))} dir="ltr" />
          </Field>
          <Field label="والد">
            <Select value={form.parentId} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}>
              <option value="">— بدون والد (سطح اول) —</option>
              {roots.filter((r) => r.id !== editing?.id).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          </Field>
          <Checkbox checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} label="فعال" />
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>انصراف</Button>
          <Button size="sm" loading={busy} disabled={form.label.trim().length < 1 || form.href.trim().length < 1} onClick={submit}>
            {editing ? 'ذخیره تغییرات' : 'ایجاد آیتم'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
