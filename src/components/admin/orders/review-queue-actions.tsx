'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal, Textarea, Select, Field } from '@/components/ui';
import { approveAndFulfil, rejectAndRefund } from '@/app/admin/reviews-queue/actions';

export function ReviewQueueActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<'approve' | 'reject' | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [method, setMethod] = React.useState<'WALLET' | 'GATEWAY' | 'MANUAL'>('WALLET');
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  async function approve() {
    setBusy('approve');
    setError(null);
    const res = await approveAndFulfil({ orderId });
    setBusy(null);
    if (!res.ok) setError(res.error);
    else {
      setNotice(res.message ?? null);
      router.refresh();
    }
  }

  async function reject() {
    setBusy('reject');
    setError(null);
    const res = await rejectAndRefund({ orderId, reason, method });
    setBusy(null);
    if (!res.ok) setError(res.error);
    else {
      setRejectOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error && <span className="text-[11px] text-danger">{error}</span>}
      {notice && <span className="text-[11px] text-accent">{notice}</span>}
      <div className="flex gap-1.5">
        <Button size="xs" variant="primary" loading={busy === 'approve'} onClick={approve}>
          تأیید و تحویل
        </Button>
        <Button size="xs" variant="danger" onClick={() => setRejectOpen(true)}>
          رد و بازپرداخت
        </Button>
      </div>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="رد سفارش و بازپرداخت">
        <div className="space-y-3">
          <Field label="دلیل رد" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </Field>
          <Field label="روش بازپرداخت (در صورت پرداخت‌شده بودن)">
            <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="WALLET">کیف پول</option>
              <option value="GATEWAY">درگاه پرداخت</option>
              <option value="MANUAL">دستی</option>
            </Select>
          </Field>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setRejectOpen(false)}>
            انصراف
          </Button>
          <Button variant="danger" size="sm" loading={busy === 'reject'} onClick={reject}>
            رد و بازپرداخت
          </Button>
        </div>
      </Modal>
    </div>
  );
}
