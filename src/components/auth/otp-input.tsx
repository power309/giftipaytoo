'use client';

import * as React from 'react';
import { toLatinDigits } from '@/lib/persian';
import { cn } from '@/lib/utils';

/**
 * Six auto-advancing digit boxes for OTP entry. Supports pasting the full
 * code into any box, Backspace to step back, arrow-key navigation, and
 * Persian/Arabic-Indic digit input (normalized to Latin). Calls `onChange`
 * with the joined value on every edit and `onComplete` once all six digits
 * are present.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus = true,
  label = 'کد تأیید ۶ رقمی',
}: {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const digits = React.useMemo(() => {
    const arr = value.split('').slice(0, length);
    while (arr.length < length) arr.push('');
    return arr;
  }, [value, length]);

  const setAt = (idx: number, v: string) => {
    const next = [...digits];
    next[idx] = v;
    const joined = next.join('');
    onChange(joined);
    if (joined.length === length && !joined.includes('')) onComplete?.(joined);
  };

  const handleChange = (idx: number, raw: string) => {
    const cleaned = toLatinDigits(raw).replace(/[^0-9]/g, '');
    if (!cleaned) {
      setAt(idx, '');
      return;
    }
    if (cleaned.length > 1) {
      // A paste landed in a single box — spread it across the remaining boxes.
      const chars = cleaned.slice(0, length - idx).split('');
      const next = [...digits];
      chars.forEach((c, i) => {
        next[idx + i] = c;
      });
      const joined = next.join('');
      onChange(joined);
      const lastFilled = Math.min(idx + chars.length, length - 1);
      refs.current[lastFilled]?.focus();
      if (joined.length === length && !joined.includes('')) onComplete?.(joined);
      return;
    }
    setAt(idx, cleaned);
    if (idx < length - 1) refs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      refs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      e.preventDefault();
      refs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (idx: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    e.preventDefault();
    handleChange(idx, text);
  };

  return (
    <div className="flex justify-center gap-2 sm:gap-2.5" dir="ltr" role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={`رقم ${i + 1} از ${length}`}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(
            'h-12 w-10 sm:h-14 sm:w-12 rounded-xl border border-border-base bg-surface text-center text-xl font-bold text-fg tnum',
            'transition-colors focus:border-primary focus:outline-2 focus:outline-offset-0 focus:outline-primary/30',
            'disabled:opacity-60',
          )}
        />
      ))}
    </div>
  );
}
