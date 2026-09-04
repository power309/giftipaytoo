'use client';

import * as React from 'react';
import { Eye, Copy, Check, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export type RevealResult =
  | { ok: true; plaintext: string; serial: string | null; pin: string | null }
  | { ok: false; error: string };

/**
 * A masked code row with an explicit "نمایش" reveal action. The plaintext
 * NEVER exists in this component's initial render — it only appears in
 * state after `onReveal` resolves from an explicit user click, and it is
 * never persisted (a refresh masks it again).
 */
export function RevealCode({
  mask,
  onReveal,
  lastRevealedLabel,
  compact = false,
}: {
  mask: string;
  onReveal: () => Promise<RevealResult>;
  lastRevealedLabel?: string | null;
  compact?: boolean;
}) {
  const [revealed, setRevealed] = React.useState<Extract<RevealResult, { ok: true }> | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const handleReveal = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await onReveal();
      if (res.ok) setRevealed(res);
      else setError(res.error);
    } catch {
      setError('نمایش کد با خطا مواجه شد. دوباره تلاش کنید.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — value stays selectable on screen */
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <code
          dir="ltr"
          className={cn(
            'inline-block rounded-lg border border-border-base bg-surface-muted px-3 py-1.5 font-mono tnum text-fg',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {revealed ? revealed.plaintext : mask}
        </code>
        {!revealed ? (
          <Button type="button" size="sm" variant="secondary" onClick={handleReveal} loading={loading}>
            <Eye className="size-3.5" aria-hidden />
            نمایش
          </Button>
        ) : (
          <Button type="button" size="sm" variant="secondary" onClick={handleCopy}>
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? 'کپی شد' : 'کپی'}
          </Button>
        )}
      </div>

      {revealed?.serial && (
        <p className="text-xs text-fg-muted">
          شماره سریال: <bdi dir="ltr" className="font-mono">{revealed.serial}</bdi>
        </p>
      )}
      {revealed?.pin && (
        <p className="text-xs text-fg-muted">
          پین: <bdi dir="ltr" className="font-mono">{revealed.pin}</bdi>
        </p>
      )}
      {error && (
        <p className="flex items-center gap-1 text-xs text-danger" role="alert">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      {revealed && (
        <p className="flex items-center gap-1 text-xs text-warn">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          پس از نمایش، این کد دیگر قابل بازگشت وجه نیست.
        </p>
      )}
      {!revealed && lastRevealedLabel && <p className="text-xs text-fg-faint">آخرین مشاهده: {lastRevealedLabel}</p>}
    </div>
  );
}
