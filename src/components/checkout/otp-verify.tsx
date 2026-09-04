'use client';

import * as React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Alert, Button, Input } from '@/components/ui';
import { toLatinDigits } from '@/lib/persian';

/**
 * Inline risk-verification gate. Rendered only when the server's order
 * creation response indicates verification is required — the order cannot
 * proceed until this resolves. There is no separate "resend" seam in the
 * current integration surface (see docs/CHECKOUT.md), so we're honest about
 * that instead of wiring a button that would do nothing.
 */
export function OtpVerify({
  channel,
  destinationMasked,
  messageFa,
  pending,
  error,
  onVerify,
}: {
  channel: 'sms' | 'email';
  destinationMasked: string;
  messageFa: string;
  pending: boolean;
  error: string | null;
  onVerify: (code: string) => void;
}) {
  const [code, setCode] = React.useState('');
  const inputId = React.useId();
  const errorId = React.useId();
  const hintId = React.useId();

  return (
    <div className="card space-y-4 border-warn/40 bg-warn-soft/40 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warn-soft text-warn">
          <ShieldAlert className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-bold text-fg">تأیید هویت لازم است</h2>
          <p className="text-sm leading-7 text-fg-muted">{messageFa}</p>
          <p className="text-xs text-fg-faint">
            کد تأیید به {channel === 'sms' ? 'شماره' : 'ایمیل'} {destinationMasked} ارسال شد.
          </p>
        </div>
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          onVerify(toLatinDigits(code).replace(/\s/g, ''));
        }}
      >
        <label htmlFor={inputId} className="block text-sm font-medium text-fg">
          کد تأیید
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={inputId}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="مثلاً ۱۲۳۴۵۶"
            dir="ltr"
            className="max-w-[10rem] text-center tracking-widest"
            aria-invalid={!!error}
            aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
          />
          <Button type="submit" loading={pending} disabled={pending || code.trim().length < 4}>
            تأیید و ادامه
          </Button>
        </div>
        <p id={hintId} className="text-xs text-fg-muted">
          کد ارسال‌شده را وارد کنید تا سفارش شما نهایی شود.
        </p>
        {error && (
          <p id={errorId} role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </form>

      <Alert tone="info">
        کد را دریافت نکردید؟ کمی صبر کنید؛ اگر همچنان دریافت نکردید، از طریق پشتیبانی با ما در تماس باشید.
      </Alert>
    </div>
  );
}
