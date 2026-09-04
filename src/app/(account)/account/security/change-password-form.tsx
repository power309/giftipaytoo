'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { Field, Input, Alert } from '@/components/ui';
import { AuthSubmitButton } from '@/components/auth/submit-button';
import { PasswordStrengthMeter } from '@/components/auth/password-strength';
import { changePasswordAction, type SecurityFormState } from './actions';

export function ChangePasswordForm() {
  const [state, formAction] = useActionState<SecurityFormState, FormData>(changePasswordAction, { ok: false });
  const [newPassword, setNewPassword] = React.useState('');
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setNewPassword('');
    }
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {!state.ok && state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="success">گذرواژه با موفقیت تغییر کرد. سایر دستگاه‌های شما از حساب خارج شدند.</Alert>}

      <Field label="گذرواژه فعلی" htmlFor="currentPassword" required>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>

      <Field label="گذرواژه جدید" htmlFor="newPassword" required>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </Field>
      <PasswordStrengthMeter password={newPassword} />

      <AuthSubmitButton className="w-auto">تغییر گذرواژه</AuthSubmitButton>
    </form>
  );
}
