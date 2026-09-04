'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { retryJob, runJobNow } from './actions';

export function JobRowActions({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) window.alert(res.error);
    else router.refresh();
  }

  return (
    <div className="flex justify-end gap-1.5">
      {status === 'DEAD' && (
        <Button size="xs" variant="secondary" loading={busy === 'retry'} onClick={() => run('retry', () => retryJob({ jobId }))}>
          تلاش مجدد
        </Button>
      )}
      {status === 'QUEUED' && (
        <Button size="xs" variant="ghost" loading={busy === 'run'} onClick={() => run('run', () => runJobNow({ jobId }))}>
          اجرای فوری
        </Button>
      )}
    </div>
  );
}
