'use client';

import { Minus, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toPersianDigits } from '@/lib/persian';

/** Quantity stepper that respects a line's min/max order quantity. Never a free-text field. */
export function QuantityStepper({
  qty,
  min,
  max,
  disabled,
  busy,
  onChange,
  label,
}: {
  qty: number;
  min: number;
  max: number;
  disabled?: boolean;
  busy?: boolean;
  onChange: (qty: number) => void;
  label: string;
}) {
  const atMin = qty <= min;
  const atMax = qty >= max;

  return (
    <div
      role="group"
      aria-label={`تعداد ${label}`}
      className={cn(
        'inline-flex items-center rounded-xl border border-border-base bg-surface',
        (disabled || busy) && 'opacity-70',
      )}
    >
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        disabled={disabled || busy || atMin}
        aria-label="کاهش تعداد"
        className="grid size-9 shrink-0 place-items-center rounded-s-xl text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:pointer-events-none disabled:opacity-40"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <span className="grid min-w-9 place-items-center text-sm font-semibold tnum text-fg" aria-live="polite">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : toPersianDigits(qty)}
      </span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={disabled || busy || atMax}
        aria-label="افزایش تعداد"
        className="grid size-9 shrink-0 place-items-center rounded-e-xl text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
