'use client';

import * as React from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import { Field, Input, Alert } from '@/components/ui';
import { AuthSubmitButton } from '@/components/auth/submit-button';
import { forgotAction, type ForgotFormState } from './actions';

export function ForgotForm() {
  const [state, formAction] = useActionState<ForgotFormState, FormData>(forgotAction, { ok: false });
  const [identifier, setIdentifier] = React.useState('');

  if (state.ok) {
    return (
      <div className="space-y-5">
        <Alert tone="success" title="بررسی کنید">
          {state.message}
        </Alert>
        <p className="text-center text-sm text-fg-muted">
          <Link href="/auth/login" className="font-medium text-primary hover:underline">
            بازگشت به صفحه ورود
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {!state.ok && state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field
        label="ایمیل یا شماره موبایل حساب"
        htmlFor="identifier"
        required
        hint="لینک بازیابی گذرواژه به این آدرس ارسال می‌شود."
      >
        <Input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
      </Field>

      <AuthSubmitButton>ارسال لینک بازیابی</AuthSubmitButton>

      <p className="text-center text-sm text-fg-muted">
        گذرواژه خود را به خاطر آوردید؟{' '}
        <Link href="/auth/login" className="font-medium text-primary hover:underline">
          ورود به حساب
        </Link>
      </p>
    </form>
  );
}
