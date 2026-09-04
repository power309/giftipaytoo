'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Monitor, LogOut } from 'lucide-react';
import { Button, Badge, Alert } from '@/components/ui';
import { formatJalali, timeAgoFa } from '@/lib/persian';
import { revokeSessionAction, logoutAllDevicesAction, type SessionRow } from './actions';

export function SessionsPanel({ sessions: initial }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [sessions, setSessions] = React.useState(initial);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [loggingOutAll, setLoggingOutAll] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const revoke = async (id: string) => {
    setPendingId(id);
    setError(null);
    const res = await revokeSessionAction(id);
    setPendingId(null);
    if (res.ok) {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      router.refresh();
    } else {
      setError(res.error ?? 'پایان دادن به نشست ناموفق بود.');
    }
  };

  const logoutAll = async () => {
    setLoggingOutAll(true);
    await logoutAllDevicesAction();
  };

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {sessions.length === 0 ? (
        <p className="text-sm text-fg-muted">نشست فعالی یافت نشد.</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border-base p-3.5">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-muted text-fg-muted">
                  <Monitor className="size-4.5" aria-hidden />
                </span>
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-fg">
                    {s.deviceLabel ?? 'دستگاه نامشخص'}
                    {s.isCurrent && (
                      <Badge tone="primary" size="sm">
                        همین دستگاه
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-fg-muted tnum">
                    {s.ip ?? '—'} — آخرین فعالیت {timeAgoFa(new Date(s.lastSeenAt))} — ورود در {formatJalali(new Date(s.createdAt))}
                  </p>
                </div>
              </div>
              {!s.isCurrent && (
                <Button type="button" variant="ghost" size="sm" onClick={() => revoke(s.id)} loading={pendingId === s.id}>
                  پایان دادن به این نشست
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="danger" size="sm" onClick={logoutAll} loading={loggingOutAll}>
        <LogOut className="size-4" aria-hidden />
        خروج از همه دستگاه‌ها
      </Button>
    </div>
  );
}
