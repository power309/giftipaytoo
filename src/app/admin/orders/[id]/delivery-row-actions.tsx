'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button, Modal, Select, Textarea, Field } from '@/components/ui';
import { resendOrderItemDelivery, replaceDefectiveDelivery, revealDeliveryCodeAction } from './actions';

type Delivery = { id: string; orderItemId: string; channel: string };

export function DeliveryRowActions({
  delivery,
  inventoryItemId,
  canFulfill,
  canReveal,
}: {
  delivery: Delivery;
  inventoryItemId: string | null;
  canFulfill: boolean;
  canReveal: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState<{ code: string; serial: string | null; pin: string | null } | null>(null);
  const [replaceOpen, setReplaceOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [channel, setChannel] = React.useState(delivery.channel);

  async function reveal() {
    if (!inventoryItemId) return;
    setBusy('reveal');
    setError(null);
    const res = await revealDeliveryCodeAction({ inventoryItemId });
    setBusy(null);
    if (!res.ok) setError(res.error);
    else setRevealed(res.data!);
  }

  async function resend() {
    setBusy('resend');
    setError(null);
    const res = await resendOrderItemDelivery({ orderItemId: delivery.orderItemId, channel: channel as 'ACCOUNT' | 'EMAIL' | 'SMS' });
    setBusy(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  async function replace() {
    setBusy('replace');
    setError(null);
    const res = await replaceDefectiveDelivery({ deliveryId: delivery.id, reason });
    setBusy(null);
    if (!res.ok) setError(res.error);
    else {
      setReplaceOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {error && <span className="w-full text-[11px] text-danger">{error}</span>}
      {revealed && (
        <div className="w-full rounded-lg bg-danger-soft p-2 text-[11px] text-danger">
          <p className="font-mono tnum" dir="ltr">کد: {revealed.code}</p>
          {revealed.serial && <p className="font-mono tnum" dir="ltr">سریال: {revealed.serial}</p>}
          {revealed.pin && <p className="font-mono tnum" dir="ltr">پین: {revealed.pin}</p>}
          <button type="button" className="mt-1 underline" onClick={() => setRevealed(null)}>
            پنهان کردن
          </button>
        </div>
      )}
      {canReveal && inventoryItemId && !revealed && (
        <Button size="xs" variant="ghost" loading={busy === 'reveal'} onClick={reveal}>
          <Eye className="size-3.5" aria-hidden />
          نمایش کد
        </Button>
      )}
      {canFulfill && (
        <>
          <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-7 w-28 text-[11px]">
            <option value="ACCOUNT">حساب کاربری</option>
            <option value="EMAIL">ایمیل</option>
            <option value="SMS">پیامک</option>
          </Select>
          <Button size="xs" variant="ghost" loading={busy === 'resend'} onClick={resend}>
            <RefreshCw className="size-3.5" aria-hidden />
            ارسال مجدد
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setReplaceOpen(true)}>
            <ShieldAlert className="size-3.5" aria-hidden />
            جایگزینی کد معیوب
          </Button>
        </>
      )}

      <Modal open={replaceOpen} onClose={() => setReplaceOpen(false)} title="جایگزینی کد معیوب">
        <Field label="دلیل جایگزینی" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setReplaceOpen(false)}>
            انصراف
          </Button>
          <Button variant="danger" size="sm" loading={busy === 'replace'} onClick={replace} disabled={reason.trim().length < 3}>
            صدور کد جایگزین
          </Button>
        </div>
      </Modal>
    </div>
  );
}
