'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal, Textarea } from '@/components/ui';
import { approveReview, rejectReview, replyToReview } from './actions';

export function ReviewRowActions({ reviewId, status, adminReply }: { reviewId: string; status: string; adminReply: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [replyOpen, setReplyOpen] = React.useState(false);
  const [reply, setReply] = React.useState(adminReply ?? '');
  const [error, setError] = React.useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) setError(res.error ?? 'خطا رخ داد.');
    else {
      setReplyOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {status !== 'APPROVED' && (
        <Button size="xs" variant="secondary" loading={busy === 'approve'} onClick={() => run('approve', () => approveReview({ reviewId }))}>
          تأیید
        </Button>
      )}
      {status !== 'REJECTED' && (
        <Button size="xs" variant="danger" loading={busy === 'reject'} onClick={() => run('reject', () => rejectReview({ reviewId }))}>
          رد
        </Button>
      )}
      <Button size="xs" variant="ghost" onClick={() => setReplyOpen(true)}>
        پاسخ عمومی
      </Button>

      <Modal open={replyOpen} onClose={() => setReplyOpen(false)} title="پاسخ عمومی به دیدگاه">
        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="پاسخ فروشگاه…" />
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setReplyOpen(false)}>انصراف</Button>
          <Button size="sm" loading={busy === 'reply'} disabled={reply.trim().length < 1} onClick={() => run('reply', () => replyToReview({ reviewId, reply }))}>
            ثبت پاسخ
          </Button>
        </div>
      </Modal>
    </div>
  );
}
