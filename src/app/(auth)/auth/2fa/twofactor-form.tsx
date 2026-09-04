'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Alert, Field, Input } from '@/components/ui';
import { AuthSubmitButton } from '@/components/auth/submit-button';
import { OtpInput } from '@/components/auth/otp-input';
import { challengeAction, type TwoFaFormState } from './actions';

export function TwoFactorForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<TwoFaFormState, FormData>(challengeAction, { ok: false });
  const [useBackup, setUseBackup] = React.useState(false);
  const [totp, setTotp] = React.useState('');
  const [backup, setBackup] = React.useState('');
  const formRef = React.useRef<HTMLFormElement>(null);

  const code = useBackup ? backup : totp;

  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="code" value={code} />

      {!state.ok && state.error && <Alert tone="danger">{state.error}</Alert>}

      {!useBackup ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-fg-muted">
            کد ۶ رقمی برنامه احراز هویت (Google Authenticator و مشابه آن) را وارد کنید.
          </p>
          <OtpInput
            value={totp}
            onChange={setTotp}
            onComplete={() => formRef.current?.requestSubmit()}
            label="کد تأیید دومرحله‌ای"
          />
        </div>
      ) : (
        <Field label="کد پشتیبان" htmlFor="backup" required hint="یکی از ۱۰ کد پشتیبانی که هنگام فعال‌سازی دریافت کردید.">
          <Input
            id="backup"
            dir="ltr"
            className="text-center tracking-widest"
            placeholder="XXXXX-XXXXX"
            value={backup}
            onChange={(e) => setBackup(e.target.value.toUpperCase())}
            required
          />
        </Field>
      )}

      <AuthSubmitButton disabled={useBackup ? backup.trim().length < 8 : totp.length !== 6}>
        <ShieldCheck className="size-4" aria-hidden />
        تأیید و ورود
      </AuthSubmitButton>

      <button
        type="button"
        onClick={() => setUseBackup((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <KeyRound className="size-3.5" aria-hidden />
        {useBackup ? 'استفاده از کد برنامه احراز هویت' : 'استفاده از یکی از کدهای پشتیبان'}
      </button>
    </form>
  );
}
