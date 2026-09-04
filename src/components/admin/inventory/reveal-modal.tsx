'use client';

import * as React from 'react';
import { ShieldAlert, Copy, Check, Eye } from 'lucide-react';
import { Modal, Field, Textarea, Button, Alert } from '@/components/ui';
import { revealInventoryCode } from '@/app/admin/inventory/actions';

/**
 * Reveal flow: requires a typed reason, calls the server action on submit,
 * and shows the plaintext exactly once — in component state only. Nothing
 * is written to localStorage/sessionStorage/the URL, and the state is wiped
 * on close (and on unmount), so the plaintext never outlives this dialog.
 */
export function RevealModal({
  open,
  itemId,
  title,
  onClose,
}: {
  open: boolean;
  itemId: string | null;
  title: string;
  onClose: () => void;
}) {
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState<{ plaintext: string; serial: string | null; pin: string | null } | null>(null);
  const [copied, setCopied] = React.useState(false);

  function reset() {
    setReason('');
    setError(null);
    setRevealed(null);
    setCopied(false);
    setBusy(false);
  }

  React.useEffect(() => {
    if (!open) reset();
  }, [open]);

  async function submit() {
    if (!itemId || reason.trim().length < 5) {
      setError('دلیل مشاهده باید حداقل ۵ کاراکتر باشد.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await revealInventoryCode({ itemId, reason: reason.trim() });
    setBusy(false);
    if (res.ok) setRevealed(res.data!);
    else setError(res.error);
  }

  return (
    <Modal open={open} onClose={onClose} title={`نمایش کد — ${title}`}>
      <div className="space-y-4">
        {!revealed ? (
          <>
            <Alert tone="warn" title="این مشاهده ثبت و رصد می‌شود">
              نمایش کد کامل در لاگ ممیزی انبار با هویت شما، زمان و دلیل ثبت می‌شود. فقط در صورت نیاز واقعی (مثلاً پیگیری
              شکایت مشتری) از این گزینه استفاده کنید.
            </Alert>
            {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
            <Field label="دلیل مشاهده" htmlFor="reveal-reason" required>
              <Textarea id="reveal-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: پیگیری تیکت شماره ۱۲۳۴ — مشتری کد را دریافت نکرده" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>انصراف</Button>
              <Button type="button" loading={busy} onClick={submit}>
                <Eye className="size-4" aria-hidden /> نمایش کد
              </Button>
            </div>
          </>
        ) : (
          <>
            <Alert tone="danger" title="این کد فقط یک‌بار نمایش داده می‌شود">
              پس از بستن این پنجره، کد دوباره نمایش داده نخواهد شد مگر با یک درخواست مشاهده جدید (که آن هم ثبت می‌شود).
            </Alert>
            <div className="space-y-2 rounded-xl border border-border-base bg-surface-muted p-4">
              <div className="flex items-center justify-between gap-2">
                <span dir="ltr" className="select-all break-all font-mono text-base font-bold text-fg">{revealed.plaintext}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(revealed.plaintext);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      /* clipboard unavailable — value is still select-all on screen */
                    }
                  }}
                >
                  {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                </Button>
              </div>
              {revealed.serial && (
                <p className="text-sm text-fg-muted">
                  سریال: <span dir="ltr" className="select-all font-mono">{revealed.serial}</span>
                </p>
              )}
              {revealed.pin && (
                <p className="text-sm text-fg-muted">
                  پین: <span dir="ltr" className="select-all font-mono">{revealed.pin}</span>
                </p>
              )}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-fg-faint">
              <ShieldAlert className="size-3.5" aria-hidden />
              این مقدار در هیچ‌جای این صفحه ذخیره نمی‌شود و با بستن پنجره از حافظه مرورگر پاک می‌شود.
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>بستن</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
