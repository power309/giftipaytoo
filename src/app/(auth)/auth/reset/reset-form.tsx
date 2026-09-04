'use client';

import * as React from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import { Field, Input, Alert } from '@/components/ui';
import { AuthSubmitButton } from '@/components/auth/submit-button';
import { PasswordStrengthMeter } from '@/components/auth/password-strength';
import { resetAction, type ResetFormState } from './actions';

export function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<ResetFormState, FormData>(resetAction, { ok: false });
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');

  if (!token) {
    return (
      <Alert tone="danger" title="لینک نامعتبر">
        این لینک بازیابی گذرواژه نامعتبر یا ناقص است. لطفاً دوباره درخواست بازیابی دهید.
      </Alert>
    );
  }

  if (state.ok) {
    return (
      <div className="space-y-5">
        <Alert tone="success" title="گذرواژه تغییر کرد">
          گذرواژه شما با موفقیت بازنشانی شد. اکنون می‌توانید با گذرواژه جدید وارد شوید.
        </Alert>
        <p className="text-center text-sm text-fg-muted">
          <Link href="/auth/login" className="font-medium text-primary hover:underline">
            ورود به حساب
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="token" value={token} />
      {!state.ok && state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="گذرواژه جدید" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      <PasswordStrengthMeter password={password} />

      <Field
        label="تکرار گذرواژه جدید"
        htmlFor="confirmPassword"
        required
        error={confirm && confirm !== password ? 'گذرواژه و تکرار آن یکسان نیستند.' : null}
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </Field>

      <AuthSubmitButton disabled={!password || password !== confirm}>ثبت گذرواژه جدید</AuthSubmitButton>
    </form>
  );
}
