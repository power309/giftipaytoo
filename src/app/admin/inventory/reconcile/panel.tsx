'use client';

import * as React from 'react';
import { Wrench, SearchCheck, CircleCheck } from 'lucide-react';
import { Button, Badge, Alert, EmptyState } from '@/components/ui';
import { Panel } from '@/components/admin/kit';
import { runReconcile, type ReconcileSummary } from '../actions';
import { formatJalali } from '@/lib/persian';

const ISSUE_LABELS: Record<string, string> = {
  'reserved-for-closed-order': 'کد رزروشده برای سفارش بسته‌شده',
  'sold-without-delivery': 'کد فروخته‌شده بدون رکورد تحویل',
  'delivery-without-item': 'تحویل بدون کد مرتبط',
  'fulfilled-order-incomplete-items': 'سفارش «تکمیل‌شده» با اقلام ناقص',
  'duplicate-fingerprint': 'اثرانگشت تکراری کد (غیرمنتظره)',
};

const FIXABLE = new Set(['reserved-for-closed-order']);

export function ReconcilePanel() {
  const [report, setReport] = React.useState<ReconcileSummary | null>(null);
  const [busy, setBusy] = React.useState<'scan' | 'fix' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run(fix: boolean) {
    setBusy(fix ? 'fix' : 'scan');
    setError(null);
    const res = await runReconcile(fix);
    setBusy(null);
    if (res.ok) setReport(res.data!);
    else setError(res.error);
  }

  const hasFixable = report?.issues.some((i) => FIXABLE.has(i.kind)) ?? false;

  return (
    <Panel
      title="اجرای بازبینی"
      description="فقط موارد کاملاً ایمن (مثل کد رزروشده برای سفارش لغوشده) به‌صورت خودکار اصلاح می‌شود؛ بقیه نیاز به بررسی انسانی دارند."
      actions={
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" loading={busy === 'scan'} onClick={() => run(false)}>
            <SearchCheck className="size-4" aria-hidden /> اجرای بازبینی
          </Button>
          {hasFixable && (
            <Button type="button" size="sm" loading={busy === 'fix'} onClick={() => run(true)}>
              <Wrench className="size-4" aria-hidden /> اصلاح موارد ایمن
            </Button>
          )}
        </div>
      }
    >
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}

      {!report ? (
        <p className="text-sm text-fg-muted">برای شروع، «اجرای بازبینی» را بزنید.</p>
      ) : report.issues.length === 0 ? (
        <EmptyState icon={<CircleCheck className="size-7" aria-hidden />} title="هیچ ناسازگاری یافت نشد" description={`آخرین بررسی: ${formatJalali(report.checkedAt, true)}`} />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-fg-faint">آخرین بررسی: {formatJalali(report.checkedAt, true)}</p>
          {report.issues.map((issue) => (
            <div key={issue.kind} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-base p-3">
              <div>
                <p className="text-sm font-medium text-fg">{ISSUE_LABELS[issue.kind] ?? issue.kind}</p>
                <p className="text-xs text-fg-faint">{issue.count.toLocaleString('fa-IR')} مورد{issue.sampleIds.length > 0 && ` — نمونه: ${issue.sampleIds.slice(0, 3).join('، ')}`}</p>
              </div>
              <div className="flex items-center gap-2">
                {report.fixed[issue.kind] != null && (
                  <Badge tone="success">اصلاح‌شده: {(report.fixed[issue.kind] ?? 0).toLocaleString('fa-IR')}</Badge>
                )}
                {FIXABLE.has(issue.kind) ? (
                  <Badge tone="primary" size="sm">قابل اصلاح خودکار</Badge>
                ) : (
                  <Badge tone="warn" size="sm">نیازمند بررسی دستی</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
