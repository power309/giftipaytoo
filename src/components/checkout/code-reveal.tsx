'use client';

import * as React from 'react';
import { Eye, EyeOff, TriangleAlert, Loader2 } from 'lucide-react';
import { Alert, Button, CopyButton } from '@/components/ui';
import { csrfFetch, parseApi } from './csrf-fetch';

/**
 * Masked by default. Revealing calls the reveal endpoint (server-audited,
 * rate-limited) and shows the plaintext code — the warning below is shown
 * before every reveal, not just the first, since revealing marks the order
 * non-refundable regardless of how many times it's viewed afterward.
 */
export function CodeReveal({
  orderNumber,
  inventoryItemId,
  alreadyRevealed,
}: {
  orderNumber: string;
  inventoryItemId: string;
  alreadyRevealed: boolean;
}) {
  const [phase, setPhase] = React.useState<'masked' | 'confirm' | 'loading' | 'revealed' | 'error'>('masked');
  const [code, setCode] = React.useState<string | null>(null);
  const [extra, setExtra] = React.useState<{ serial: string | null; pin: string | null }>({ serial: null, pin: null });
  const [error, setError] = React.useState<string | null>(null);

  async function reveal() {
    setPhase('loading');
    setError(null);
    try {
      const res = await csrfFetch(`/api/orders/${encodeURIComponent(orderNumber)}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ inventoryItemId }),
      });
      const result = await parseApi<{ code: string; serial: string | null; pin: string | null }>(res);
      if (result.ok) {
        setCode(result.data.code);
        setExtra({ serial: result.data.serial, pin: result.data.pin });
        setPhase('revealed');
      } else {
        setError(result.error);
        setPhase('error');
      }
    } catch {
      setError('اتصال به سرور برقرار نشد.');
      setPhase('error');
    }
  }

  if (phase === 'revealed' && code) {
    return (
      <div className="space-y-2 rounded-xl border border-accent/30 bg-accent-soft p-3">
        <div className="flex flex-wrap items-center gap-2">
          <code dir="ltr" className="min-w-0 flex-1 break-all rounded-lg bg-surface px-3 py-2 text-sm font-bold tracking-wider">
            {code}
          </code>
          <CopyButton text={code} label="کپی کد" />
        </div>
        {extra.serial && (
          <p className="text-xs text-fg-muted">
            شماره سریال: <bdi dir="ltr" className="font-medium text-fg">{extra.serial}</bdi>
          </p>
        )}
        {extra.pin && (
          <p className="text-xs text-fg-muted">
            پین: <bdi dir="ltr" className="font-medium text-fg">{extra.pin}</bdi>
          </p>
        )}
        <p className="text-xs text-fg-muted">این کد را در جای امنی نگه دارید. این سفارش دیگر قابل بازگشت وجه نیست.</p>
      </div>
    );
  }

  if (phase === 'confirm') {
    return (
      <div className="space-y-2.5 rounded-xl border border-warn/40 bg-warn-soft/60 p-3">
        <p className="flex items-start gap-2 text-xs leading-6 text-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          با نمایش کد، این سفارش غیرقابل بازگشت وجه می‌شود. آیا مطمئن هستید؟
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={reveal}>
            بله، کد را نمایش بده
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPhase('masked')}>
            انصراف
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <code dir="ltr" className="rounded-lg bg-surface-muted px-3 py-2 text-sm font-bold tracking-widest text-fg-faint">
          ••••-••••-••••
        </code>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setPhase('confirm')}
          disabled={phase === 'loading'}
        >
          {phase === 'loading' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
          نمایش کد
        </Button>
        {alreadyRevealed && (
          <span className="flex items-center gap-1 text-xs text-fg-faint">
            <EyeOff className="size-3.5" aria-hidden />
            پیش‌تر مشاهده شده
          </span>
        )}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
