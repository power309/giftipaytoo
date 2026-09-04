'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Upload, FileText } from 'lucide-react';
import { Tabs, Button, Field, Input, Select, Textarea, Modal, Alert, Badge } from '@/components/ui';
import { addSingleCode, addBulkCodes, importInventoryCsv, type CsvImportSummary } from './actions';

export function AddCodesButton({
  variants,
  suppliers,
}: {
  variants: { id: string; nameFa: string; sku: string }[];
  suppliers: { id: string; nameFa: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<'single' | 'bulk' | 'csv'>('single');
  const [variantId, setVariantId] = React.useState('');
  const [supplierId, setSupplierId] = React.useState('');

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> افزودن کد
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="افزودن کد به انبار" size="lg">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="تنوع محصول" htmlFor="ac-variant" required>
              <Select id="ac-variant" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                <option value="">— انتخاب کنید —</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>{v.nameFa} ({v.sku})</option>
                ))}
              </Select>
            </Field>
            <Field label="تأمین‌کننده (اختیاری)" htmlFor="ac-supplier">
              <Select id="ac-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— تعیین‌نشده —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.nameFa}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Tabs
            tabs={[
              { key: 'single', label: 'تک کد' },
              { key: 'bulk', label: 'چسباندن گروهی' },
              { key: 'csv', label: 'وارد کردن CSV' },
            ]}
            active={tab}
            onChange={(k) => setTab(k as typeof tab)}
          />

          {!variantId ? (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">ابتدا تنوع محصول را انتخاب کنید.</p>
          ) : tab === 'single' ? (
            <SingleCodeForm variantId={variantId} supplierId={supplierId || null} onDone={() => { setOpen(false); router.refresh(); }} />
          ) : tab === 'bulk' ? (
            <BulkPasteForm variantId={variantId} supplierId={supplierId || null} onDone={() => { setOpen(false); router.refresh(); }} />
          ) : (
            <CsvImportForm variantId={variantId} supplierId={supplierId || null} onDone={() => { setOpen(false); router.refresh(); }} />
          )}
        </div>
      </Modal>
    </>
  );
}

function SingleCodeForm({ variantId, supplierId, onDone }: { variantId: string; supplierId: string | null; onDone: () => void }) {
  const [code, setCode] = React.useState('');
  const [serial, setSerial] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [costToman, setCostToman] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <Field label="کد" htmlFor="single-code" required>
        <Input id="single-code" value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="سریال (اختیاری)" htmlFor="single-serial">
          <Input id="single-serial" value={serial} onChange={(e) => setSerial(e.target.value)} dir="ltr" />
        </Field>
        <Field label="پین (اختیاری)" htmlFor="single-pin">
          <Input id="single-pin" value={pin} onChange={(e) => setPin(e.target.value)} dir="ltr" />
        </Field>
      </div>
      <Field label="قیمت تمام‌شده (تومان)" htmlFor="single-cost">
        <Input id="single-cost" type="number" min={0} value={costToman} onChange={(e) => setCostToman(e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button
          type="button"
          loading={busy}
          disabled={!code.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await addSingleCode({
              variantId,
              code: code.trim(),
              serial: serial.trim() || undefined,
              pin: pin.trim() || undefined,
              supplierId,
              costToman: costToman ? Math.trunc(Number(costToman)) : undefined,
            });
            setBusy(false);
            if (res.ok) onDone();
            else setError(res.error);
          }}
        >
          ثبت کد
        </Button>
      </div>
    </div>
  );
}

function BulkPasteForm({ variantId, supplierId, onDone }: { variantId: string; supplierId: string | null; onDone: () => void }) {
  const [text, setText] = React.useState('');
  const [costToman, setCostToman] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ inserted: number; duplicates: number; invalid: number } | null>(null);

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      {result ? (
        <Alert tone="success" title="افزودن گروهی انجام شد">
          {result.inserted.toLocaleString('fa-IR')} کد ثبت شد، {result.duplicates.toLocaleString('fa-IR')} تکراری،{' '}
          {result.invalid.toLocaleString('fa-IR')} نامعتبر بود.
        </Alert>
      ) : (
        <>
          <Field label="کدها (هر خط یک کد)" htmlFor="bulk-codes" hint={`${lines.length.toLocaleString('fa-IR')} کد شناسایی شد`}>
            <Textarea id="bulk-codes" rows={8} value={text} onChange={(e) => setText(e.target.value)} dir="ltr" className="font-mono text-xs" />
          </Field>
          <Field label="قیمت تمام‌شده واحد (تومان)" htmlFor="bulk-cost">
            <Input id="bulk-cost" type="number" min={0} value={costToman} onChange={(e) => setCostToman(e.target.value)} />
          </Field>
        </>
      )}
      <div className="flex justify-end gap-2">
        {result ? (
          <Button type="button" onClick={onDone}>بستن</Button>
        ) : (
          <Button
            type="button"
            loading={busy}
            disabled={lines.length === 0}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await addBulkCodes({ variantId, codes: lines, supplierId, costToman: costToman ? Math.trunc(Number(costToman)) : undefined });
              setBusy(false);
              if (res.ok) setResult(res.data!);
              else setError(res.error);
            }}
          >
            <Upload className="size-4" aria-hidden /> ثبت {lines.length.toLocaleString('fa-IR')} کد
          </Button>
        )}
      </div>
    </div>
  );
}

function CsvImportForm({ variantId, supplierId, onDone }: { variantId: string; supplierId: string | null; onDone: () => void }) {
  const [fileName, setFileName] = React.useState('');
  const [csvText, setCsvText] = React.useState('');
  const [preview, setPreview] = React.useState<CsvImportSummary | null>(null);
  const [confirmed, setConfirmed] = React.useState<CsvImportSummary | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleFile(f: File) {
    setFileName(f.name);
    setCsvText(await f.text());
    setPreview(null);
    setConfirmed(null);
  }

  async function dryRun() {
    setBusy(true);
    setError(null);
    const res = await importInventoryCsv({ variantId, csvText, fileName, supplierId, dryRun: true });
    setBusy(false);
    if (res.ok) setPreview(res.data!);
    else setError(res.error);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await importInventoryCsv({ variantId, csvText, fileName, supplierId, dryRun: false });
    setBusy(false);
    if (res.ok) setConfirmed(res.data!);
    else setError(res.error);
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      {confirmed ? (
        <Alert tone="success" title="وارد کردن انجام شد">
          {confirmed.successCount.toLocaleString('fa-IR')} کد ثبت شد از {confirmed.totalCount.toLocaleString('fa-IR')} ردیف — {confirmed.duplicateCount.toLocaleString('fa-IR')} تکراری، {confirmed.failedCount.toLocaleString('fa-IR')} نامعتبر.
        </Alert>
      ) : (
        <>
          <input type="file" accept=".csv,text/csv" id="inv-csv-file" className="sr-only" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <label htmlFor="inv-csv-file" className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-border-strong p-4 text-sm text-fg-muted hover:border-primary">
            <FileText className="size-5" aria-hidden />
            {fileName || 'فایل CSV را انتخاب کنید — ستون‌های code (الزامی)، serial، pin، cost_toman، expires_at، note'}
          </label>

          {preview && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge tone="success">{preview.successCount.toLocaleString('fa-IR')} جدید</Badge>
                <Badge tone="warn">{preview.duplicateCount.toLocaleString('fa-IR')} تکراری</Badge>
                <Badge tone="danger">{preview.failedCount.toLocaleString('fa-IR')} نامعتبر</Badge>
                <Badge tone="neutral">{preview.totalCount.toLocaleString('fa-IR')} کل ردیف‌ها</Badge>
              </div>
              {preview.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border-base p-2 text-xs text-fg-muted">
                  {preview.errors.slice(0, 50).map((e, i) => (
                    <p key={i}>ردیف {e.row.toLocaleString('fa-IR')}: {e.reason}</p>
                  ))}
                  <p className="mt-1 text-fg-faint">هیچ مقدار کدی در این گزارش نمایش داده نمی‌شود.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="flex justify-end gap-2">
        {confirmed ? (
          <Button type="button" onClick={onDone}>بستن</Button>
        ) : !preview ? (
          <Button type="button" loading={busy} disabled={!csvText} onClick={dryRun}>پیش‌نمایش (بدون ثبت)</Button>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={() => setPreview(null)}>ویرایش فایل</Button>
            <Button type="button" loading={busy} disabled={preview.successCount === 0} onClick={confirm}>
              تأیید و ثبت {preview.successCount.toLocaleString('fa-IR')} کد
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
