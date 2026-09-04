'use client';

import * as React from 'react';
import Link from 'next/link';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Field, Select, Badge, Alert, EmptyState } from '@/components/ui';
import { Panel } from '@/components/admin/kit';
import { PRODUCT_IMPORT_FIELDS, type ColumnMapping, type ImportPreviewSummary } from './types';
import { parseImportFile, previewProductImport, runProductImport, type ParsedFile, type RunImportResult } from './actions';

const STEPS = ['upload', 'mapping', 'preview', 'result'] as const;
type Step = (typeof STEPS)[number];

function guessMapping(headers: string[]): ColumnMapping {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
  const mapping: ColumnMapping = {};
  for (const field of PRODUCT_IMPORT_FIELDS) {
    const candidates = [field.key, field.label].map(norm);
    const found = headers.find((h) => candidates.includes(norm(h)));
    if (found) mapping[field.key] = found;
  }
  return mapping;
}

export function ImportWizard() {
  const [step, setStep] = React.useState<Step>('upload');
  const [file, setFile] = React.useState<ParsedFile | null>(null);
  const [mapping, setMapping] = React.useState<ColumnMapping>({});
  const [preview, setPreview] = React.useState<ImportPreviewSummary | null>(null);
  const [result, setResult] = React.useState<RunImportResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleFile(f: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append('file', f);
    const res = await parseImportFile(form);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setFile(res.data!);
    setMapping(guessMapping(res.data!.headers));
    setStep('mapping');
  }

  async function handlePreview() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const res = await previewProductImport({ rows: file.rows, mapping });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPreview(res.data!);
    setStep('preview');
  }

  async function handleConfirm() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const res = await runProductImport({ rows: file.rows, mapping });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res.data!);
    setStep('result');
  }

  function reset() {
    setStep('upload');
    setFile(null);
    setMapping({});
    setPreview(null);
    setResult(null);
    setError(null);
  }

  return (
    <Panel title="ورود گروهی محصولات از CSV یا اکسل" description="آپلود فایل → نگاشت ستون‌ها → پیش‌نمایش اعتبارسنجی → تأیید نهایی.">
      <ol className="mb-5 flex flex-wrap items-center gap-2 text-xs">
        {(['upload', 'mapping', 'preview', 'result'] as Step[]).map((s, i) => (
          <li key={s} className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1', step === s ? 'bg-primary text-primary-contrast' : 'bg-surface-muted text-fg-muted')}>
            <span className="tnum">{(i + 1).toLocaleString('fa-IR')}</span>
            {s === 'upload' && 'بارگذاری فایل'}
            {s === 'mapping' && 'نگاشت ستون‌ها'}
            {s === 'preview' && 'پیش‌نمایش'}
            {s === 'result' && 'نتیجه'}
          </li>
        ))}
      </ol>

      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}

      {step === 'upload' && (
        <div className="space-y-3">
          <input
            type="file"
            accept=".csv,.xlsx,text/csv"
            id="import-file"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <label
            htmlFor="import-file"
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong p-10 text-center transition-colors hover:border-primary',
              busy && 'pointer-events-none opacity-60',
            )}
          >
            {busy ? <Icons.Loader2 className="size-8 animate-spin text-primary" aria-hidden /> : <Icons.FileSpreadsheet className="size-8 text-fg-faint" aria-hidden />}
            <span className="text-sm font-medium text-fg">{busy ? 'در حال خواندن فایل…' : 'فایل CSV یا XLSX را انتخاب کنید'}</span>
            <span className="text-xs text-fg-faint">حداکثر ۵ مگابایت — حداکثر ۵٬۰۰۰ ردیف</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <a href="/api/admin/catalog/products/import-template?format=csv">
              <Button type="button" variant="ghost" size="sm">
                <Icons.Download className="size-3.5" aria-hidden /> دانلود قالب CSV
              </Button>
            </a>
            <a href="/api/admin/catalog/products/import-template?format=xlsx">
              <Button type="button" variant="ghost" size="sm">
                <Icons.Download className="size-3.5" aria-hidden /> دانلود قالب Excel
              </Button>
            </a>
          </div>
        </div>
      )}

      {step === 'mapping' && file && (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            فایل <strong dir="ltr">{file.fileName}</strong> — {file.rows.length.toLocaleString('fa-IR')} ردیف. هر ستون مقصد را به یکی از ستون‌های فایل نگاشت دهید.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PRODUCT_IMPORT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`map-${f.key}`} required={f.required}>
                <Select id={`map-${f.key}`} value={mapping[f.key] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}>
                  <option value="">— نگاشت نشده —</option>
                  {file.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={reset}>بازگشت</Button>
            <Button type="button" size="sm" loading={busy} onClick={handlePreview}>ادامه به پیش‌نمایش</Button>
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Badge tone="success">{preview.toCreate.toLocaleString('fa-IR')} ایجاد جدید</Badge>
            <Badge tone="primary">{preview.toUpdate.toLocaleString('fa-IR')} به‌روزرسانی (بر اساس SKU)</Badge>
            <Badge tone="danger">{preview.invalid.toLocaleString('fa-IR')} خطا</Badge>
          </div>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border-base">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-muted">
                <tr>
                  <th className="p-2 text-start">ردیف</th>
                  <th className="p-2 text-start">SKU</th>
                  <th className="p-2 text-start">نام</th>
                  <th className="p-2 text-start">وضعیت</th>
                  <th className="p-2 text-start">خطاها</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row} className="border-t border-border-base">
                    <td className="p-2 tnum">{r.row.toLocaleString('fa-IR')}</td>
                    <td className="p-2" dir="ltr">{r.sku || '—'}</td>
                    <td className="p-2">{r.nameFa || '—'}</td>
                    <td className="p-2">
                      {r.action === 'create' && <Badge tone="success" size="sm">جدید</Badge>}
                      {r.action === 'update' && <Badge tone="primary" size="sm">به‌روزرسانی</Badge>}
                      {r.action === 'error' && <Badge tone="danger" size="sm">خطا</Badge>}
                    </td>
                    <td className="p-2 text-danger">{r.errors.join('؛ ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep('mapping')}>بازگشت</Button>
            <Button type="button" size="sm" loading={busy} disabled={preview.toCreate + preview.toUpdate === 0} onClick={handleConfirm}>
              تأیید و اجرای وارد کردن
            </Button>
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <div className="space-y-4">
          <Alert tone={result.failed === 0 ? 'success' : 'warn'} title="وارد کردن پایان یافت">
            {result.created.toLocaleString('fa-IR')} محصول ایجاد شد، {result.updated.toLocaleString('fa-IR')} محصول به‌روزرسانی شد
            {result.failed > 0 && `، ${result.failed.toLocaleString('fa-IR')} ردیف با خطا رد شد`}.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/products">
              <Button type="button" size="sm">مشاهده محصولات</Button>
            </Link>
            <Button type="button" variant="secondary" size="sm" onClick={reset}>وارد کردن فایل دیگر</Button>
          </div>
        </div>
      )}

      {step === 'upload' && !file && (
        <EmptyState
          className="mt-4"
          icon={<Icons.Info className="size-6" aria-hidden />}
          title="دامنه این ابزار"
          description="محصولات بر اساس ستون sku ایجاد یا به‌روزرسانی می‌شوند و برای هر محصول یک تنوع پیش‌فرض ساخته می‌شود. برای مدیریت کامل تنوع‌ها، رسانه و سئو از فرم محصول استفاده کنید."
        />
      )}
    </Panel>
  );
}
