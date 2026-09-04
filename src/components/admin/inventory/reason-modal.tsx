'use client';

import * as React from 'react';
import { Modal, Field, Textarea, Button } from '@/components/ui';

export type ReasonActionResult = { ok: boolean; error?: string };

/** Generic "type a reason, confirm" dialog — used by invalidate/quarantine/etc. */
export function ReasonModal({
  open,
  title,
  confirmLabel,
  tone = 'primary',
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  onClose: () => void;
  onConfirm: (reason: string) => Promise<ReasonActionResult>;
}) {
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setReason('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>انصراف</Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              if (reason.trim().length < 3) {
                setError('ذکر دلیل الزامی است (حداقل ۳ کاراکتر).');
                return;
              }
              setBusy(true);
              setError(null);
              const res = await onConfirm(reason.trim());
              setBusy(false);
              if (res.ok) onClose();
              else setError(res.error ?? 'عملیات ناموفق بود.');
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label="دلیل" htmlFor="reason-modal-input" error={error} required>
        <Textarea id="reason-modal-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}
