'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCcw } from 'lucide-react';
import { Alert, Button } from '@/components/ui';
import { STATUS_LABEL_FA } from './order-status';

const START_MS = 4000;
const MAX_MS = 30_000;
const BACKOFF = 1.5;
const MAX_ATTEMPTS = 40; // ~ a few minutes of polling before asking the customer to check back manually

/**
 * Polls the tiny status endpoint (never a code) on a capped, backing-off
 * interval. When the status actually changes, it hands off to
 * `router.refresh()` so the server component re-fetches the *full* order
 * (line items, deliveries) rather than us trying to merge a partial client
 * patch on top of server-rendered data.
 */
export function OrderStatusPoll({
  orderNumber,
  status,
  paymentStatus,
  fulfillmentStatus,
}: {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
}) {
  const router = useRouter();
  const [attempts, setAttempts] = React.useState(0);
  const [stopped, setStopped] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const snapshot = React.useRef({ status, paymentStatus, fulfillmentStatus });
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = React.useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/status`, { credentials: 'same-origin' });
      if (res.ok) {
        const body = await res.json();
        const s = body?.status;
        if (
          s &&
          (s.status !== snapshot.current.status ||
            s.paymentStatus !== snapshot.current.paymentStatus ||
            s.fulfillmentStatus !== snapshot.current.fulfillmentStatus)
        ) {
          router.refresh();
          return; // the page re-renders with fresh data; this component remounts if still pending
        }
      }
    } catch {
      // transient network hiccup — just try again on the next tick
    } finally {
      setChecking(false);
    }
  }, [orderNumber, router]);

  React.useEffect(() => {
    if (stopped) return;
    let cancelled = false;
    let delay = START_MS;
    let count = 0;

    const tick = async () => {
      if (cancelled) return;
      count += 1;
      setAttempts(count);
      if (count > MAX_ATTEMPTS) {
        setStopped(true);
        return;
      }
      await poll();
      if (cancelled) return;
      delay = Math.min(MAX_MS, Math.round(delay * BACKOFF));
      timerRef.current = setTimeout(tick, delay);
    };

    timerRef.current = setTimeout(tick, delay);
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll, stopped]);

  return (
    <div className="space-y-3 rounded-xl border border-primary/25 bg-primary-soft p-4" aria-live="polite">
      <div className="flex items-center gap-2.5 text-primary">
        <Loader2 className="size-4.5 shrink-0 animate-spin" aria-hidden />
        <p className="text-sm font-semibold">
          وضعیت فعلی: {STATUS_LABEL_FA[paymentStatus] ?? STATUS_LABEL_FA[status] ?? status}
        </p>
      </div>
      <p className="text-xs leading-6 text-fg-muted">
        در حال بررسی وضعیت پرداخت و آماده‌سازی سفارش شما هستیم. این صفحه به‌طور خودکار به‌روزرسانی می‌شود؛ نیازی به
        رفرش دستی نیست.
      </p>
      {stopped && (
        <Alert tone="info">
          بررسی خودکار متوقف شد. اگر مدتی از پرداخت شما گذشته، دکمه زیر را بزنید یا صفحه را رفرش کنید.
          <div className="mt-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setStopped(false);
                setAttempts(0);
                router.refresh();
              }}
            >
              <RefreshCcw className="size-4" aria-hidden />
              بررسی مجدد
            </Button>
          </div>
        </Alert>
      )}
      <span className="sr-only" role="status">
        {checking ? `در حال بررسی — تلاش ${attempts}` : ''}
      </span>
    </div>
  );
}
