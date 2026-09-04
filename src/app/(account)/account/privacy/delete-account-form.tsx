'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { Trash2 } from 'lucide-react';
import { Field, Input, Alert, Button } from '@/components/ui';
import { requestAccountDeletionAction, ACCOUNT_DELETION_CONFIRM_PHRASE, type DeleteAccountState } from './actions';

export function DeleteAccountForm() {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState<DeleteAccountState, FormData>(requestAccountDeletionAction, { ok: false });
  const [typed, setTyped] = React.useState('');

  if (!open) {
    return (
      <Button type="button" variant="danger" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" aria-hidden />
        حذف حساب کاربری
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-danger/30 bg-danger-soft p-4">
      {!state.ok && state.error && <Alert tone="danger">{state.error}</Alert>}
      <Field
        label={`برای تأیید، عبارت «${ACCOUNT_DELETION_CONFIRM_PHRASE}» را وارد کنید`}
        htmlFor="confirm"
        required
      >
        <Input id="confirm" name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} dir="rtl" required />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={typed !== ACCOUNT_DELETION_CONFIRM_PHRASE}>
          <Trash2 className="size-4" aria-hidden />
          تأیید و حذف حساب
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          انصراف
        </Button>
      </div>
    </form>
  );
}
