'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { Field, Input, Checkbox, Alert } from '@/components/ui';
import { AuthSubmitButton } from '@/components/auth/submit-button';
import { updateProfileAction, type ProfileFormState } from './actions';

export function ProfileForm({
  firstName,
  lastName,
  nationalId,
  marketingOptIn,
}: {
  firstName: string;
  lastName: string;
  nationalId: string;
  marketingOptIn: boolean;
}) {
  const [state, formAction] = useActionState<ProfileFormState, FormData>(updateProfileAction, { ok: false });

  return (
    <form action={formAction} className="space-y-4">
      {!state.ok && state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="success">اطلاعات با موفقیت به‌روزرسانی شد.</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="نام" htmlFor="firstName">
          <Input id="firstName" name="firstName" defaultValue={firstName} autoComplete="given-name" />
        </Field>
        <Field label="نام خانوادگی" htmlFor="lastName">
          <Input id="lastName" name="lastName" defaultValue={lastName} autoComplete="family-name" />
        </Field>
      </div>

      <Field label="کد ملی (اختیاری)" htmlFor="nationalId">
        <Input id="nationalId" name="nationalId" defaultValue={nationalId} inputMode="numeric" maxLength={10} />
      </Field>

      <Checkbox
        name="marketingOptIn"
        id="marketingOptIn"
        defaultChecked={marketingOptIn}
        label="مایلم پیشنهادها و تخفیف‌های گیفتی‌پی را از طریق ایمیل یا پیامک دریافت کنم."
      />

      <AuthSubmitButton className="w-auto">ذخیره تغییرات</AuthSubmitButton>
    </form>
  );
}
