'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Phone, Ban, CheckCircle2, Wallet, Award, StickyNote, Download, UserX } from 'lucide-react';
import { Button, Modal, Field, Textarea, Input, Select } from '@/components/ui';
import { Panel } from '@/components/admin/kit';
import { formatJalali } from '@/lib/persian';
import type { ActionResult } from '@/app/admin/orders/_lib';
import {
  verifyContact, setCustomerStatus, addCustomerNoteAction, adjustWallet, adjustLoyaltyPoints,
  revokeCustomerSession, anonymizeCustomer,
} from '../actions';

type UserForActions = { id: string; status: string; emailVerifiedAt: Date | null; phoneVerifiedAt: Date | null; email: string | null; phone: string | null };
type Perms = { canUpdate: boolean; canWallet: boolean };

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

export function CustomerDetailClient({ user, perms }: { user: UserForActions; perms: Perms }) {
  const { busy, error, run, setError } = useBusyAction();
  const [modal, setModal] = React.useState<null | 'note' | 'wallet' | 'loyalty' | 'anonymize'>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {perms.canUpdate && !user.emailVerifiedAt && user.email && (
          <Button size="sm" variant="secondary" loading={busy} onClick={() => run(() => verifyContact({ userId: user.id, channel: 'email' }))}>
            <Mail className="size-4" aria-hidden />
            تأیید دستی ایمیل
          </Button>
        )}
        {perms.canUpdate && !user.phoneVerifiedAt && user.phone && (
          <Button size="sm" variant="secondary" loading={busy} onClick={() => run(() => verifyContact({ userId: user.id, channel: 'phone' }))}>
            <Phone className="size-4" aria-hidden />
            تأیید دستی موبایل
          </Button>
        )}
        {perms.canUpdate && user.status !== 'SUSPENDED' && (
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={() => {
              if (window.confirm('حساب این مشتری مسدود شود؟')) run(() => setCustomerStatus({ userId: user.id, status: 'SUSPENDED' }));
            }}
          >
            <Ban className="size-4" aria-hidden />
            مسدودسازی
          </Button>
        )}
        {perms.canUpdate && user.status === 'SUSPENDED' && (
          <Button size="sm" variant="secondary" loading={busy} onClick={() => run(() => setCustomerStatus({ userId: user.id, status: 'ACTIVE' }))}>
            <CheckCircle2 className="size-4" aria-hidden />
            فعال‌سازی
          </Button>
        )}
        {perms.canWallet && (
          <Button size="sm" variant="secondary" onClick={() => setModal('wallet')}>
            <Wallet className="size-4" aria-hidden />
            تراکنش کیف پول
          </Button>
        )}
        {perms.canWallet && (
          <Button size="sm" variant="secondary" onClick={() => setModal('loyalty')}>
            <Award className="size-4" aria-hidden />
            تراکنش امتیاز
          </Button>
        )}
        {perms.canUpdate && (
          <Button size="sm" variant="ghost" onClick={() => setModal('note')}>
            <StickyNote className="size-4" aria-hidden />
            یادداشت جدید
          </Button>
        )}
      </div>
      {error && !modal && <p className="text-xs text-danger" role="alert">{error}</p>}

      <Panel title="حریم خصوصی">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/admin/customers/${user.id}/export`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-base bg-surface-muted px-3 text-xs font-medium text-fg hover:bg-border-base"
          >
            <Download className="size-3.5" aria-hidden />
            خروجی داده مشتری
          </a>
          {perms.canUpdate && user.status !== 'DELETED' && (
            <Button size="sm" variant="danger" onClick={() => setModal('anonymize')}>
              <UserX className="size-4" aria-hidden />
              ناشناس‌سازی و حذف
            </Button>
          )}
        </div>
      </Panel>

      <Modal open={modal === 'note'} onClose={() => setModal(null)} title="افزودن یادداشت داخلی">
        <NoteForm busy={busy} error={error} onSubmit={(note) => run(() => addCustomerNoteAction({ userId: user.id, note }), () => setModal(null))} onCancel={() => setModal(null)} />
      </Modal>

      <Modal open={modal === 'wallet'} onClose={() => setModal(null)} title="ثبت تراکنش کیف پول">
        <WalletForm busy={busy} error={error} setError={setError} onSubmit={(v) => run(() => adjustWallet({ userId: user.id, ...v }), () => setModal(null))} onCancel={() => setModal(null)} />
      </Modal>

      <Modal open={modal === 'loyalty'} onClose={() => setModal(null)} title="ثبت تراکنش امتیاز وفاداری">
        <LoyaltyForm busy={busy} error={error} onSubmit={(v) => run(() => adjustLoyaltyPoints({ userId: user.id, ...v }), () => setModal(null))} onCancel={() => setModal(null)} />
      </Modal>

      <Modal open={modal === 'anonymize'} onClose={() => setModal(null)} title="ناشناس‌سازی و حذف حساب">
        <p className="text-sm text-fg-muted">
          این عملیات غیرقابل بازگشت است: اطلاعات هویتی مشتری (نام، ایمیل، موبایل) پاک می‌شود و حساب غیرفعال خواهد شد. سفارش‌ها و تراکنش‌های مالی برای الزامات حسابداری حفظ می‌شوند.
        </p>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setModal(null)}>
            انصراف
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={busy}
            onClick={() => {
              if (window.confirm('این عملیات غیرقابل بازگشت است. مطمئن هستید؟')) run(() => anonymizeCustomer({ userId: user.id }), () => setModal(null));
            }}
          >
            تأیید و ناشناس‌سازی
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function NoteForm({ busy, error, onSubmit, onCancel }: { busy: boolean; error: string | null; onSubmit: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = React.useState('');
  return (
    <div>
      <Field label="متن یادداشت" required>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
      </Field>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>انصراف</Button>
        <Button size="sm" loading={busy} disabled={note.trim().length < 1} onClick={() => onSubmit(note)}>ثبت</Button>
      </div>
    </div>
  );
}

function WalletForm({
  busy, error, setError, onSubmit, onCancel,
}: {
  busy: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  onSubmit: (v: { type: 'CREDIT' | 'DEBIT'; amountToman: number; reason: string }) => void;
  onCancel: () => void;
}) {
  const [type, setType] = React.useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  React.useEffect(() => setError(null), [setError]);
  return (
    <div className="space-y-3">
      <Field label="نوع تراکنش" required>
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="CREDIT">واریز (افزایش موجودی)</option>
          <option value="DEBIT">برداشت (کاهش موجودی)</option>
        </Select>
      </Field>
      <Field label="مبلغ (تومان)" required>
        <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="دلیل" required hint="این دلیل در تاریخچه تراکنش کیف پول مشتری قابل مشاهده است.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </Field>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>انصراف</Button>
        <Button
          size="sm"
          loading={busy}
          disabled={Number(amount) <= 0 || reason.trim().length < 3}
          onClick={() => onSubmit({ type, amountToman: Number(amount), reason })}
        >
          ثبت تراکنش
        </Button>
      </div>
    </div>
  );
}

function LoyaltyForm({
  busy, error, onSubmit, onCancel,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (v: { points: number; reason: string }) => void;
  onCancel: () => void;
}) {
  const [points, setPoints] = React.useState('');
  const [reason, setReason] = React.useState('');
  return (
    <div className="space-y-3">
      <Field label="مقدار امتیاز (مثبت یا منفی)" required hint="برای کسر امتیاز، عدد منفی وارد کنید (مثلاً -50).">
        <Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
      </Field>
      <Field label="دلیل" required>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </Field>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>انصراف</Button>
        <Button size="sm" loading={busy} disabled={!Number(points) || reason.trim().length < 3} onClick={() => onSubmit({ points: Number(points), reason })}>
          ثبت تراکنش
        </Button>
      </div>
    </div>
  );
}

type SessionRow = { id: string; deviceLabel: string | null; userAgent: string | null; ip: string | null; lastSeenAt: Date; createdAt: Date };

function describeDeviceFallback(ua: string): string {
  const s = ua.toLowerCase();
  const os = s.includes('android') ? 'اندروید' : s.includes('iphone') || s.includes('ipad') ? 'iOS' : s.includes('windows') ? 'ویندوز' : s.includes('mac os') ? 'مک' : 'نامشخص';
  const browser = s.includes('chrome') ? 'Chrome' : s.includes('firefox') ? 'Firefox' : s.includes('safari') ? 'Safari' : 'مرورگر';
  return `${browser} — ${os}`;
}

export function SessionsList({ sessions, userId, canRevoke }: { sessions: SessionRow[]; userId: string; canRevoke: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function revoke(sessionId: string) {
    setBusyId(sessionId);
    const res = await revokeCustomerSession({ sessionId, userId });
    setBusyId(null);
    if (res.ok) router.refresh();
  }

  return (
    <ul className="space-y-2 text-xs">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border-base p-2">
          <div className="min-w-0">
            <p className="text-fg">{s.deviceLabel ?? (s.userAgent ? describeDeviceFallback(s.userAgent) : 'نامشخص')}</p>
            <p className="text-fg-faint">{s.ip ?? '—'} — {formatJalali(s.lastSeenAt, true)}</p>
          </div>
          {canRevoke && (
            <Button size="xs" variant="ghost" loading={busyId === s.id} onClick={() => revoke(s.id)}>
              لغو نشست
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
