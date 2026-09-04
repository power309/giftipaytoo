'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type RowError = { row: number; reason: string };

export function BatchErrorReport({ errorLog }: { errorLog: string }) {
  const [open, setOpen] = React.useState(false);
  let errors: RowError[] = [];
  try {
    errors = JSON.parse(errorLog);
  } catch {
    return null;
  }
  if (!Array.isArray(errors) || errors.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
      >
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        گزارش خطاها ({errors.length.toLocaleString('fa-IR')})
      </button>
      {open && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border-base bg-surface-muted/50 p-2 text-xs text-fg-muted">
          {errors.slice(0, 200).map((e, i) => (
            <p key={i}>ردیف {e.row.toLocaleString('fa-IR')}: {e.reason}</p>
          ))}
          <p className="mt-1 text-fg-faint">این گزارش هرگز شامل مقدار کد نیست.</p>
        </div>
      )}
    </div>
  );
}
