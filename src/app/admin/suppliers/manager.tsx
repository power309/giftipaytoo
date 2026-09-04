'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Field, Input, Select, Switch, Textarea, Modal, Badge, EmptyState, Alert } from '@/components/ui';
import { saveSupplier, deleteSupplier, toggleSupplierActive, toggleSupplierAutoFulfill, testSupplierConnection, type TestConnectionResult } from './actions';

export type SupplierRow = {
  id: string;
  nameFa: string;
  adapterKey: string;
  apiBaseUrl: string | null;
  hasCredentials: boolean;
  isActive: boolean;
  autoFulfill: boolean;
  reliabilityScore: number;
  notesFa: string | null;
  variantCount: number;
  inventoryCount: number;
};

const ADAPTER_LABELS: Record<string, string> = { manual: 'دستی (بدون تحویل خودکار)', 'http-generic': 'HTTP عمومی' };

const emptyForm = {
  id: undefined as string | undefined,
  nameFa: '',
  adapterKey: 'manual' as 'manual' | 'http-generic',
  apiBaseUrl: '',
  apiKey: '',
  changingCredentials: false,
  isActive: true,
  autoFulfill: false,
  notesFa: '',
};

export function SupplierManager({ initialSuppliers }: { initialSuppliers: SupplierRow[] }) {
  const router = useRouter();
  const [suppliers, setSuppliers] = React.useState(initialSuppliers);
  React.useEffect(() => setSuppliers(initialSuppliers), [initialSuppliers]);

  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<SupplierRow | null>(null);
  const [testResults, setTestResults] = React.useState<Record<string, TestConnectionResult>>({});
  const [testing, setTesting] = React.useState<string | null>(null);

  function openCreate() {
    setForm(emptyForm);
    setError(null);
    setFormOpen(true);
  }
  function openEdit(s: SupplierRow) {
    setForm({
      id: s.id,
      nameFa: s.nameFa,
      adapterKey: s.adapterKey as 'manual' | 'http-generic',
      apiBaseUrl: s.apiBaseUrl ?? '',
      apiKey: '',
      changingCredentials: !s.hasCredentials,
      isActive: s.isActive,
      autoFulfill: s.autoFulfill,
      notesFa: s.notesFa ?? '',
    });
    setError(null);
    setFormOpen(true);
  }

  async function submit() {
    if (!form.nameFa.trim()) {
      setError('نام تأمین‌کننده الزامی است.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await saveSupplier({
      id: form.id,
      nameFa: form.nameFa.trim(),
      adapterKey: form.adapterKey,
      apiBaseUrl: form.apiBaseUrl.trim() || undefined,
      apiKey: form.changingCredentials ? form.apiKey.trim() || undefined : undefined,
      isActive: form.isActive,
      autoFulfill: form.autoFulfill,
      notesFa: form.notesFa.trim() || null,
    });
    setBusy(false);
    if (res.ok) {
      setFormOpen(false);
      router.refresh();
    } else setError(res.error);
  }

  async function runTest(id: string) {
    setTesting(id);
    const res = await testSupplierConnection(id);
    setTesting(null);
    if (res.ok) setTestResults((prev) => ({ ...prev, [id]: res.data! }));
    else setTestResults((prev) => ({ ...prev, [id]: { ok: false, message: res.error, checkedAt: new Date().toISOString() } }));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={openCreate}>
          <Icons.Plus className="size-4" aria-hidden /> تأمین‌کننده جدید
        </Button>
      </div>

      {suppliers.length === 0 ? (
        <EmptyState icon={<Icons.Truck className="size-7" aria-hidden />} title="تأمین‌کننده‌ای ثبت نشده" action={<Button size="sm" onClick={openCreate}>افزودن تأمین‌کننده</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {suppliers.map((s) => {
            const testResult = testResults[s.id];
            return (
              <div key={s.id} className="card space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-fg">{s.nameFa}</p>
                    <p className="text-xs text-fg-faint">{ADAPTER_LABELS[s.adapterKey] ?? s.adapterKey}</p>
                  </div>
                  <Badge tone={s.isActive ? 'success' : 'neutral'} size="sm">{s.isActive ? 'فعال' : 'غیرفعال'}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-fg-muted">
                  <p>اعتبار ذخیره‌شده: {s.hasCredentials ? '•••• تنظیم شده' : 'تنظیم نشده'}</p>
                  <p>امتیاز اعتماد: <span className="tnum">{s.reliabilityScore.toLocaleString('fa-IR')}</span></p>
                  <p>تنوع‌ها: <span className="tnum">{s.variantCount.toLocaleString('fa-IR')}</span></p>
                  <p>کدهای انبار: <span className="tnum">{s.inventoryCount.toLocaleString('fa-IR')}</span></p>
                </div>

                {s.apiBaseUrl && <p className="truncate text-xs text-fg-faint" dir="ltr">{s.apiBaseUrl}</p>}

                {testResult && (
                  <Alert tone={testResult.ok ? 'success' : 'warn'} className="text-xs">
                    {testResult.message}
                  </Alert>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="xs" variant="secondary" onClick={() => openEdit(s)}>
                    <Icons.Pencil className="size-3.5" aria-hidden /> ویرایش
                  </Button>
                  <Button type="button" size="xs" variant="secondary" loading={testing === s.id} onClick={() => runTest(s.id)}>
                    <Icons.Plug className="size-3.5" aria-hidden /> تست اتصال
                  </Button>
                  <Switch checked={s.autoFulfill} onChange={async (v) => { const r = await toggleSupplierAutoFulfill(s.id, v); if (r.ok) router.refresh(); }} label="تحویل خودکار" id={`auto-${s.id}`} />
                  <Switch checked={s.isActive} onChange={async (v) => { const r = await toggleSupplierActive(s.id, v); if (r.ok) router.refresh(); }} label="فعال" id={`active-${s.id}`} />
                  <Button type="button" size="xs" variant="danger" className="ms-auto" onClick={() => setDeleteTarget(s)}>
                    <Icons.Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? 'ویرایش تأمین‌کننده' : 'تأمین‌کننده جدید'}
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
          <Field label="نام تأمین‌کننده" htmlFor="sup-name" required>
            <Input id="sup-name" value={form.nameFa} onChange={(e) => setForm((f) => ({ ...f, nameFa: e.target.value }))} />
          </Field>
          <Field label="آداپتور" htmlFor="sup-adapter">
            <Select id="sup-adapter" value={form.adapterKey} onChange={(e) => setForm((f) => ({ ...f, adapterKey: e.target.value as 'manual' | 'http-generic' }))}>
              <option value="manual">دستی (بدون تحویل خودکار)</option>
              <option value="http-generic">HTTP عمومی</option>
            </Select>
          </Field>

          {form.adapterKey === 'http-generic' && (
            <div className="space-y-3 rounded-xl border border-border-base bg-surface-muted/40 p-3.5">
              <Field label="نشانی پایه API" htmlFor="sup-base-url" required hint="باید https باشد؛ آدرس‌های داخلی/محلی رد می‌شوند.">
                <Input id="sup-base-url" value={form.apiBaseUrl} onChange={(e) => setForm((f) => ({ ...f, apiBaseUrl: e.target.value }))} dir="ltr" placeholder="https://api.supplier.example.com" />
              </Field>

              <div>
                <p className="mb-1 text-sm font-medium text-fg">کلید دسترسی (API Key)</p>
                {!form.changingCredentials ? (
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg border border-border-base bg-surface px-3 py-2 text-sm text-fg-muted">•••• تنظیم شده</span>
                    <Button type="button" size="xs" variant="secondary" onClick={() => setForm((f) => ({ ...f, changingCredentials: true }))}>
                      تغییر
                    </Button>
                  </div>
                ) : (
                  <Input value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} dir="ltr" placeholder="کلید جدید را وارد کنید" />
                )}
                <p className="mt-1 text-xs text-fg-faint">کلید ذخیره‌شده هرگز نمایش داده نمی‌شود — فقط می‌توانید آن را جایگزین کنید.</p>
              </div>
            </div>
          )}

          <Field label="یادداشت" htmlFor="sup-notes">
            <Textarea id="sup-notes" rows={2} value={form.notesFa} onChange={(e) => setForm((f) => ({ ...f, notesFa: e.target.value }))} />
          </Field>

          <div className="flex flex-wrap gap-6">
            <Switch checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} label="فعال" id="sup-active" />
            <Switch checked={form.autoFulfill} onChange={(v) => setForm((f) => ({ ...f, autoFulfill: v }))} label="تحویل خودکار" id="sup-auto" />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`حذف «${deleteTarget?.nameFa}»`}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)}>انصراف</Button>
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                if (!deleteTarget) return;
                const res = await deleteSupplier(deleteTarget.id);
                if (res.ok) {
                  setDeleteTarget(null);
                  router.refresh();
                } else alert(res.error);
              }}
            >
              حذف
            </Button>
          </>
        }
      >
        <p className={cn('text-sm text-fg')}>آیا از حذف این تأمین‌کننده مطمئن هستید؟</p>
      </Modal>
    </div>
  );
}
