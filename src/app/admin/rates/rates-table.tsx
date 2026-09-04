'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Field, Input, Textarea, Badge, EmptyState } from '@/components/ui';
import { Money } from '@/components/admin/kit';
import { toPersianDigits, formatJalali } from '@/lib/persian';
import { setRate } from './actions';

export type CurrencyRateRow = {
  code: string;
  nameFa: string;
  symbol: string;
  minorUnits: number;
  active: { tomanPerUnit: number; effectiveAt: string; note: string | null; setByName: string | null } | null;
  isStale: boolean;
  history: { id: string; tomanPerUnit: number; effectiveAt: string; isActive: boolean; setByName: string | null; note: string | null }[];
};

export function RatesTable({ rows }: { rows: CurrencyRateRow[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<string | null>(null);

  if (rows.length === 0) {
    return <EmptyState icon={<Icons.ArrowLeftRight className="size-7" aria-hidden />} title="ارز فعالی ثبت نشده" />;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const isOpen = expanded.has(r.code);
        return (
          <div key={r.code} className="rounded-xl border border-border-base">
            <div className="flex flex-wrap items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-fg">{r.nameFa}</span>
                  <span className="text-xs text-fg-faint" dir="ltr">{r.code} ({r.symbol})</span>
                  {r.isStale && <Badge tone="danger" size="sm"><Icons.AlertTriangle className="size-3" aria-hidden /> نرخ قدیمی</Badge>}
                </div>
                {r.active ? (
                  <p className="mt-1 text-sm text-fg-muted">
                    <Money value={r.active.tomanPerUnit} className="font-medium text-fg" /> به‌ازای هر واحد — تنظیم‌شده در {formatJalali(r.active.effectiveAt, true)}
                    {r.active.setByName && ` توسط ${r.active.setByName}`}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-warn">هنوز نرخی برای این ارز ثبت نشده است.</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(editing === r.code ? null : r.code)}>
                  ثبت نرخ جدید
                </Button>
                {r.history.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.code)) next.delete(r.code);
                        else next.add(r.code);
                        return next;
                      })
                    }
                    aria-label="تاریخچه نرخ"
                    className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted"
                  >
                    <Icons.ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} aria-hidden />
                  </button>
                )}
              </div>
            </div>

            {editing === r.code && (
              <div className="border-t border-border-base p-3.5">
                <RateForm code={r.code} onDone={() => { setEditing(null); router.refresh(); }} />
              </div>
            )}

            {isOpen && r.history.length > 0 && (
              <div className="overflow-x-auto border-t border-border-base">
                <table className="w-full text-xs">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className="p-2 text-start">نرخ</th>
                      <th className="p-2 text-start">تاریخ</th>
                      <th className="p-2 text-start">ثبت‌شده توسط</th>
                      <th className="p-2 text-start">یادداشت</th>
                      <th className="p-2 text-start">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.history.map((h) => (
                      <tr key={h.id} className="border-t border-border-base">
                        <td className="p-2"><Money value={h.tomanPerUnit} /></td>
                        <td className="p-2 tnum">{formatJalali(h.effectiveAt, true)}</td>
                        <td className="p-2">{h.setByName ?? '—'}</td>
                        <td className="p-2 text-fg-faint">{h.note ?? '—'}</td>
                        <td className="p-2">{h.isActive ? <Badge tone="success" size="sm">فعال</Badge> : <Badge size="sm">غیرفعال</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RateForm({ code, onDone }: { code: string; onDone: () => void }) {
  const [tomanPerUnit, setTomanPerUnit] = React.useState('');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const value = Number(tomanPerUnit);
        if (!Number.isInteger(value) || value <= 0) {
          setError('نرخ باید عدد صحیح و بزرگ‌تر از صفر باشد.');
          return;
        }
        setBusy(true);
        setError(null);
        const res = await setRate({ currencyCode: code, tomanPerUnit: value, note: note.trim() || null });
        setBusy(false);
        if (res.ok) onDone();
        else setError(res.error);
      }}
    >
      <Field label="نرخ جدید (تومان به‌ازای هر واحد)" htmlFor={`rate-${code}`} error={error} className="max-w-xs">
        <Input id={`rate-${code}`} type="number" min={1} value={tomanPerUnit} onChange={(e) => setTomanPerUnit(e.target.value)} placeholder={toPersianDigits('مثلاً 58000')} />
      </Field>
      <Field label="یادداشت (اختیاری)" htmlFor={`note-${code}`} className="max-w-sm flex-1">
        <Textarea id={`note-${code}`} rows={1} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" size="sm" loading={busy}>ثبت نرخ</Button>
    </form>
  );
}
