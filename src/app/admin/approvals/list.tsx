'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Textarea, Modal, EmptyState, Badge } from '@/components/ui';
import { Money } from '@/components/admin/kit';
import { formatJalali } from '@/lib/persian';
import { decideApproval } from './actions';

export type ApprovalRow = {
  id: string;
  productName: string;
  variantName: string;
  sku: string;
  currentToman: number;
  proposedToman: number;
  deltaPercentX100: number;
  reason: string;
  requestedByName: string;
  createdAt: string;
  status: string;
};

export function ApprovalsList({ rows }: { rows: ApprovalRow[] }) {
  const router = useRouter();
  const [target, setTarget] = React.useState<{ row: ApprovalRow; decision: 'APPROVED' | 'REJECTED' } | null>(null);

  if (rows.length === 0) {
    return <EmptyState title="موردی در انتظار تأیید نیست" description="همه تغییرات قیمت اعمال یا بررسی شده‌اند." />;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const deltaPercent = r.deltaPercentX100 / 100;
        return (
          <div key={r.id} className="rounded-xl border border-border-base p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-fg">{r.productName} — {r.variantName}</p>
                <p className="text-xs text-fg-faint" dir="ltr">{r.sku}</p>
                <p className="mt-1 text-xs text-fg-muted">{r.reason}</p>
                <p className="mt-1 text-xs text-fg-faint">درخواست از {r.requestedByName} — {formatJalali(r.createdAt, true)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="flex items-center gap-2 text-sm">
                  <Money value={r.currentToman} className="text-fg-faint line-through" />
                  <span className="text-fg-faint">←</span>
                  <Money value={r.proposedToman} className="font-bold text-fg" />
                </div>
                <Badge tone={deltaPercent >= 0 ? 'danger' : 'success'} size="sm">
                  {deltaPercent >= 0 ? '+' : ''}{deltaPercent.toLocaleString('fa-IR')}٪
                </Badge>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button type="button" size="sm" onClick={() => setTarget({ row: r, decision: 'APPROVED' })}>
                <Check className="size-3.5" aria-hidden /> تأیید
              </Button>
              <Button type="button" size="sm" variant="danger" onClick={() => setTarget({ row: r, decision: 'REJECTED' })}>
                <X className="size-3.5" aria-hidden /> رد
              </Button>
            </div>
          </div>
        );
      })}

      <DecisionModal
        target={target}
        onClose={() => setTarget(null)}
        onDone={() => {
          setTarget(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function DecisionModal({
  target,
  onClose,
  onDone,
}: {
  target: { row: ApprovalRow; decision: 'APPROVED' | 'REJECTED' } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setNote('');
    setError(null);
  }, [target]);

  if (!target) return null;
  const isReject = target.decision === 'REJECTED';

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={isReject ? 'رد تغییر قیمت' : 'تأیید تغییر قیمت'}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>انصراف</Button>
          <Button
            type="button"
            variant={isReject ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await decideApproval({ approvalId: target.row.id, decision: target.decision, note: note.trim() || null });
              setBusy(false);
              if (res.ok) onDone();
              else setError(res.error);
            }}
          >
            {isReject ? 'رد درخواست' : 'تأیید و اعمال'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <p className="text-sm text-fg">
          {target.row.productName} — {target.row.variantName}:{' '}
          <Money value={target.row.currentToman} /> ← <Money value={target.row.proposedToman} className="font-bold" />
        </p>
        <label htmlFor="decision-note" className={cn('block text-sm font-medium text-fg')}>
          یادداشت {isReject && <span className="text-danger">*</span>}
        </label>
        <Textarea id="decision-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={isReject ? 'دلیل رد را بنویسید…' : 'اختیاری'} />
      </div>
    </Modal>
  );
}
