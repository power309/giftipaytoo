'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal, Textarea, Field } from '@/components/ui';
import { approveRefund, rejectRefund, processRefundAction } from '@/app/admin/refunds/actions';

/** Approve / reject / process buttons for one refund row — shared by the refunds queue and the order detail page. */
export function RefundRowActions({ refundId, status }: { refundId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) setError(res.error ?? 'خطا رخ داد.');
    else {
      setRejectOpen(false);
      router.refresh();
    }
  }

  if (status === 'PROCESSED' || status === 'REJECTED' || status === 'FAILED') return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {error && <span className="w-full text-end text-[11px] text-danger">{error}</span>}
      {status === 'REQUESTED' && (
        <Button size="xs" variant="secondary" loading={busy === 'approve'} onClick={() => run('approve', () => approveRefund({ refundId }))}>
          تأیید
        </Button>
      )}
      <Button size="xs" variant="primary" loading={busy === 'process'} onClick={() => run('process', () => processRefundAction({ refundId }))}>
        پردازش
      </Button>
      <Button size="xs" variant="danger" onClick={() => setRejectOpen(true)}>
        رد
      </Button>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="رد درخواست بازپرداخت">
        <Field label="دلیل رد" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setRejectOpen(false)}>
            انصراف
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={busy === 'reject'}
            onClick={() => run('reject', () => rejectRefund({ refundId, reason }))}
          >
            رد درخواست
          </Button>
        </div>
      </Modal>
    </div>
  );
}
