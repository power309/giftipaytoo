'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCcw, Wallet, XCircle, Clock, PackageCheck, Undo2, ReceiptText, ShieldAlert, ShieldCheck, StickyNote,
} from 'lucide-react';
import { Button, Modal, Select, Textarea, Input, Field, Checkbox } from '@/components/ui';
import { formatToman } from '@/lib/money';
import { ORDER_STATUS_OPTIONS, type ActionResult } from '../_lib';
import {
  changeOrderStatus, markPaidManually, cancelOrder, expireOrder, manualFulfillOrderItem,
  partialFulfillOrder, requestOrderRefund, regenerateInvoice, addInternalNote, addCustomerNote,
  assignOrderForReview, clearOrderReviewFlag,
} from './actions';

type OrderForActions = {
  id: string;
  status: string;
  paymentStatus: string;
  totalToman: number;
  walletAppliedToman: number;
  needsReview: boolean;
  items: { id: string; productNameFa: string; variantNameFa: string; qty: number; fulfilledQty: number }[];
  refunds: { amountToman: number; status: string }[];
};

type Perms = { canUpdate: boolean; canFulfill: boolean; canRefund: boolean; canReview: boolean; canReveal: boolean };

function useBusyAction() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = React.useCallback(
    async (fn: () => Promise<ActionResult>, onDone?: () => void) => {
      setBusy(true);
      setError(null);
      const res = await fn();
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      router.refresh();
      onDone?.();
      return true;
    },
    [router],
  );
  return { busy, error, run, setError };
}

export function OrderDetailActions({ order, perms }: { order: OrderForActions; perms: Perms }) {
  const remaining = order.totalToman - order.refunds.filter((r) => r.status === 'PROCESSED' || r.status === 'APPROVED').reduce((s, r) => s + r.amountToman, 0);
  const hasUnfulfilled = order.items.some((i) => i.fulfilledQty < i.qty);

  const [modal, setModal] = React.useState<
    null | 'status' | 'cancel' | 'manualFulfill' | 'refund' | 'reviewAssign' | 'reviewClear' | 'noteInternal' | 'noteCustomer'
  >(null);

  const { busy, error, run, setError } = useBusyAction();

  return (
    <div className="flex flex-wrap gap-2">
      {perms.canUpdate && (
        <Button size="sm" variant="secondary" onClick={() => setModal('status')}>
          <RefreshCcw className="size-4" aria-hidden />
          تغییر وضعیت
        </Button>
      )}
      {perms.canUpdate && order.paymentStatus !== 'PAID' && (
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={() => {
            if (window.confirm('این سفارش به‌عنوان پرداخت‌شده (پرداخت دستی) ثبت شود؟')) run(() => markPaidManually({ orderId: order.id }));
          }}
        >
          <Wallet className="size-4" aria-hidden />
          ثبت پرداخت دستی
        </Button>
      )}
      {perms.canUpdate && order.status !== 'CANCELED' && order.paymentStatus !== 'PAID' && (
        <Button size="sm" variant="secondary" onClick={() => setModal('cancel')}>
          <XCircle className="size-4" aria-hidden />
          لغو سفارش
        </Button>
      )}
      {perms.canUpdate && order.paymentStatus !== 'PAID' && (
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={() => {
            if (window.confirm('این سفارش منقضی علامت‌گذاری شود؟')) run(() => expireOrder({ orderId: order.id }));
          }}
        >
          <Clock className="size-4" aria-hidden />
          انقضا
        </Button>
      )}
      {perms.canFulfill && hasUnfulfilled && (
        <Button size="sm" variant="secondary" onClick={() => setModal('manualFulfill')}>
          <PackageCheck className="size-4" aria-hidden />
          تحویل دستی
        </Button>
      )}
      {perms.canFulfill && hasUnfulfilled && order.paymentStatus === 'PAID' && (
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={() => run(() => partialFulfillOrder({ orderId: order.id }))}
        >
          <PackageCheck className="size-4" aria-hidden />
          تلاش برای تحویل خودکار
        </Button>
      )}
      {perms.canRefund && remaining > 0 && (order.paymentStatus === 'PAID' || order.paymentStatus === 'PARTIALLY_REFUNDED') && (
        <Button size="sm" variant="secondary" onClick={() => setModal('refund')}>
          <Undo2 className="size-4" aria-hidden />
          درخواست بازپرداخت
        </Button>
      )}
      {perms.canUpdate && (
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={() => run(() => regenerateInvoice({ orderId: order.id }))}
        >
          <ReceiptText className="size-4" aria-hidden />
          بازتولید فاکتور
        </Button>
      )}
      {perms.canReview && !order.needsReview && (
        <Button size="sm" variant="secondary" onClick={() => setModal('reviewAssign')}>
          <ShieldAlert className="size-4" aria-hidden />
          ارجاع برای بررسی
        </Button>
      )}
      {perms.canReview && order.needsReview && (
        <Button size="sm" variant="secondary" onClick={() => setModal('reviewClear')}>
          <ShieldCheck className="size-4" aria-hidden />
          رفع پرچم بررسی
        </Button>
      )}
      {perms.canUpdate && (
        <Button size="sm" variant="ghost" onClick={() => setModal('noteInternal')}>
          <StickyNote className="size-4" aria-hidden />
          یادداشت داخلی
        </Button>
      )}
      {perms.canUpdate && (
        <Button size="sm" variant="ghost" onClick={() => setModal('noteCustomer')}>
          <StickyNote className="size-4" aria-hidden />
          یادداشت مشتری
        </Button>
      )}

      {error && !modal && <p className="w-full text-xs text-danger" role="alert">{error}</p>}

      <StatusModal open={modal === 'status'} onClose={() => setModal(null)} orderId={order.id} run={run} busy={busy} error={error} setError={setError} />
      <ReasonModal
        open={modal === 'cancel'}
        onClose={() => setModal(null)}
        title="لغو سفارش"
        actionLabel="لغو سفارش"
        busy={busy}
        error={error}
        setError={setError}
        onSubmit={(reason) => run(() => cancelOrder({ orderId: order.id, reason }), () => setModal(null))}
      />
      <ManualFulfillModal open={modal === 'manualFulfill'} onClose={() => setModal(null)} items={order.items} run={run} busy={busy} error={error} setError={setError} />
      <RefundModal
        open={modal === 'refund'}
        onClose={() => setModal(null)}
        orderId={order.id}
        maxAmount={remaining}
        run={run}
        busy={busy}
        error={error}
        setError={setError}
      />
      <ReasonModal
        open={modal === 'reviewAssign'}
        onClose={() => setModal(null)}
        title="ارجاع سفارش برای بررسی دستی"
        actionLabel="ارجاع برای بررسی"
        optional
        busy={busy}
        error={error}
        setError={setError}
        onSubmit={(reason) => run(() => assignOrderForReview({ orderId: order.id, reason }), () => setModal(null))}
      />
      <ReasonModal
        open={modal === 'reviewClear'}
        onClose={() => setModal(null)}
        title="رفع پرچم بررسی"
        actionLabel="رفع پرچم"
        optional
        busy={busy}
        error={error}
        setError={setError}
        onSubmit={(reason) => run(() => clearOrderReviewFlag({ orderId: order.id, reason }), () => setModal(null))}
      />
      <ReasonModal
        open={modal === 'noteInternal'}
        onClose={() => setModal(null)}
        title="افزودن یادداشت داخلی"
        actionLabel="ثبت یادداشت"
        label="متن یادداشت"
        busy={busy}
        error={error}
        setError={setError}
        onSubmit={(note) => run(() => addInternalNote({ orderId: order.id, note }), () => setModal(null))}
      />
      <ReasonModal
        open={modal === 'noteCustomer'}
        onClose={() => setModal(null)}
        title="افزودن یادداشت قابل مشاهده برای مشتری"
        actionLabel="ثبت یادداشت"
        label="متن یادداشت"
        busy={busy}
        error={error}
        setError={setError}
        onSubmit={(note) => run(() => addCustomerNote({ orderId: order.id, note }), () => setModal(null))}
      />
    </div>
  );
}

// ── Shared small modal helpers ─────────────────────────────────────

function ReasonModal({
  open, onClose, title, actionLabel, label = 'دلیل', optional, busy, error, setError, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  actionLabel: string;
  label?: string;
  optional?: boolean;
  busy: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = React.useState('');
  React.useEffect(() => {
    if (open) {
      setText('');
      setError(null);
    }
  }, [open, setError]);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <Field label={label} required={!optional}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
      </Field>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          انصراف
        </Button>
        <Button size="sm" loading={busy} disabled={!optional && text.trim().length < 3} onClick={() => onSubmit(text)}>
          {actionLabel}
        </Button>
      </div>
    </Modal>
  );
}

function StatusModal({
  open, onClose, orderId, run, busy, error, setError,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  run: (fn: () => Promise<ActionResult>, onDone?: () => void) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const [status, setStatus] = React.useState('PROCESSING');
  const [note, setNote] = React.useState('');
  React.useEffect(() => {
    if (open) setError(null);
  }, [open, setError]);
  return (
    <Modal open={open} onClose={onClose} title="تغییر وضعیت سفارش">
      <div className="space-y-3">
        <Field label="وضعیت جدید" required>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {ORDER_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="یادداشت (اختیاری)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </Field>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          انصراف
        </Button>
        <Button size="sm" loading={busy} onClick={() => run(() => changeOrderStatus({ orderId, status: status as never, note }), onClose)}>
          اعمال تغییر
        </Button>
      </div>
    </Modal>
  );
}

function ManualFulfillModal({
  open, onClose, items, run, busy, error, setError,
}: {
  open: boolean;
  onClose: () => void;
  items: OrderForActions['items'];
  run: (fn: () => Promise<ActionResult>, onDone?: () => void) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const pending = items.filter((i) => i.fulfilledQty < i.qty);
  const [itemId, setItemId] = React.useState(pending[0]?.id ?? '');
  const [code, setCode] = React.useState('');
  const [serial, setSerial] = React.useState('');
  const [pin, setPin] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setItemId(pending[0]?.id ?? '');
      setCode('');
      setSerial('');
      setPin('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="تحویل دستی">
      <div className="space-y-3">
        <Field label="ردیف سفارش" required>
          <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {pending.map((i) => (
              <option key={i.id} value={i.id}>
                {i.productNameFa} — {i.variantNameFa} ({(i.qty - i.fulfilledQty).toLocaleString('fa-IR')} باقی‌مانده)
              </option>
            ))}
          </Select>
        </Field>
        <Field label="کد" required>
          <Input value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" />
        </Field>
        <Field label="سریال (اختیاری)">
          <Input value={serial} onChange={(e) => setSerial(e.target.value)} dir="ltr" />
        </Field>
        <Field label="پین (اختیاری)">
          <Input value={pin} onChange={(e) => setPin(e.target.value)} dir="ltr" />
        </Field>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          انصراف
        </Button>
        <Button
          size="sm"
          loading={busy}
          disabled={!itemId || code.trim().length < 2}
          onClick={() => run(() => manualFulfillOrderItem({ orderItemId: itemId, code, serial: serial || undefined, pin: pin || undefined }), onClose)}
        >
          ثبت و تحویل
        </Button>
      </div>
    </Modal>
  );
}

function RefundModal({
  open, onClose, orderId, maxAmount, run, busy, error, setError,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  maxAmount: number;
  run: (fn: () => Promise<ActionResult>, onDone?: () => void) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const [amount, setAmount] = React.useState(String(maxAmount));
  const [method, setMethod] = React.useState<'WALLET' | 'GATEWAY' | 'MANUAL'>('WALLET');
  const [reason, setReason] = React.useState('');
  const [processNow, setProcessNow] = React.useState(true);

  React.useEffect(() => {
    if (open) {
      setAmount(String(maxAmount));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, maxAmount]);

  return (
    <Modal open={open} onClose={onClose} title="درخواست بازپرداخت">
      <div className="space-y-3">
        <p className="text-xs text-fg-muted">حداکثر مبلغ قابل بازپرداخت: {formatToman(maxAmount)}</p>
        <Field label="مبلغ بازپرداخت (تومان)" required>
          <Input type="number" min={1} max={maxAmount} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="روش بازپرداخت" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            <option value="WALLET">کیف پول</option>
            <option value="GATEWAY">درگاه پرداخت</option>
            <option value="MANUAL">دستی</option>
          </Select>
        </Field>
        <Field label="دلیل" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
        <Checkbox checked={processNow} onChange={(e) => setProcessNow(e.target.checked)} label="بلافاصله پردازش شود" />
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          انصراف
        </Button>
        <Button
          size="sm"
          loading={busy}
          disabled={reason.trim().length < 3 || Number(amount) <= 0}
          onClick={() =>
            run(
              () => requestOrderRefund({ orderId, amountToman: Number(amount), reason, method, processNow }),
              onClose,
            )
          }
        >
          ثبت درخواست
        </Button>
      </div>
    </Modal>
  );
}
