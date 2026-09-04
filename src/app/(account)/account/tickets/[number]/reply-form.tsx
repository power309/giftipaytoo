'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { RotateCw } from 'lucide-react';
import { Textarea, Alert, Button } from '@/components/ui';
import { AuthSubmitButton } from '@/components/auth/submit-button';
import { AttachmentPicker, type UploadedAttachment } from '@/components/account/attachment-picker';
import { replyTicketAction, reopenTicketAction, type TicketFormState } from '../actions';

export function ReplyForm({ number, closed }: { number: string; closed: boolean }) {
  const [state, formAction] = useActionState<TicketFormState, FormData>(replyTicketAction, { ok: false });
  const [attachments, setAttachments] = React.useState<UploadedAttachment[]>([]);
  const [reopening, setReopening] = React.useState(false);
  const [reopenError, setReopenError] = React.useState<string | null>(null);

  const handleReopen = async () => {
    setReopening(true);
    setReopenError(null);
    const res = await reopenTicketAction(number);
    setReopening(false);
    if (!res.ok) setReopenError(res.error ?? 'باز کردن تیکت ناموفق بود.');
  };

  if (closed) {
    return (
      <div className="space-y-3 rounded-xl border border-border-base bg-surface-muted p-4 text-center">
        <p className="text-sm text-fg-muted">این تیکت بسته شده است.</p>
        {reopenError && <Alert tone="danger">{reopenError}</Alert>}
        <Button type="button" variant="secondary" onClick={handleReopen} loading={reopening}>
          <RotateCw className="size-4" aria-hidden />
          باز کردن دوباره این تیکت
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="number" value={number} />
      <input type="hidden" name="attachments" value={JSON.stringify(attachments)} />
      {!state.ok && state.error && <Alert tone="danger">{state.error}</Alert>}
      <Textarea name="bodyFa" placeholder="پاسخ خود را بنویسید…" required minLength={1} maxLength={4000} rows={4} aria-label="متن پاسخ" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AttachmentPicker onChange={setAttachments} />
        <AuthSubmitButton className="w-auto">ارسال پاسخ</AuthSubmitButton>
      </div>
    </form>
  );
}
