'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui';
import { Panel } from '@/components/admin/kit';
import { runScheduledTaskNow } from './actions';

const TASKS: { key: 'release-reservations' | 'expire-payments' | 'prune' | 'low-stock-scan' | 'reconcile-stock'; label: string }[] = [
  { key: 'release-reservations', label: 'آزادسازی رزروهای منقضی' },
  { key: 'expire-payments', label: 'انقضای پرداخت‌های راکد' },
  { key: 'low-stock-scan', label: 'بررسی موجودی رو به اتمام' },
  { key: 'reconcile-stock', label: 'تطبیق موجودی انبار' },
  { key: 'prune', label: 'پاک‌سازی داده‌های موقت' },
];

export function ScheduledTasksPanel() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Record<string, { ok: boolean; text: string }>>({});

  async function run(task: (typeof TASKS)[number]['key']) {
    setBusy(task);
    const res = await runScheduledTaskNow({ task });
    setBusy(null);
    setMessages((m) => ({ ...m, [task]: { ok: res.ok, text: res.ok ? (res.message ?? 'اجرا شد.') : res.error } }));
    if (res.ok) router.refresh();
  }

  return (
    <Panel title="کارهای زمان‌بندی‌شده" description="اجرای فوری کارهای دوره‌ای سیستم (به‌جای انتظار برای زمان‌بند)">
      <ul className="space-y-2">
        {TASKS.map((t) => (
          <li key={t.key} className="flex items-center justify-between gap-2 rounded-lg border border-border-base p-2.5">
            <div>
              <p className="text-sm text-fg">{t.label}</p>
              {messages[t.key] && <p className={`text-xs ${messages[t.key].ok ? 'text-accent' : 'text-danger'}`}>{messages[t.key].text}</p>}
            </div>
            <Button size="xs" variant="secondary" loading={busy === t.key} onClick={() => run(t.key)}>
              <Play className="size-3.5" aria-hidden />
              اجرای فوری
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
