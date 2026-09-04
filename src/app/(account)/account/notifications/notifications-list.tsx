'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Card, Button, Select, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';
import { formatJalali } from '@/lib/persian';
import { markNotificationReadAction, markAllNotificationsReadAction } from './actions';

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  order: 'سفارش',
  payment: 'پرداخت',
  ticket: 'پشتیبانی',
  wallet: 'کیف پول',
  system: 'سیستم',
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function NotificationsList({ notifications }: { notifications: NotificationRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<'all' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [markingAll, setMarkingAll] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const types = React.useMemo(() => Array.from(new Set(notifications.map((n) => n.type))), [notifications]);

  const filtered = notifications.filter((n) => {
    if (filter === 'unread' && n.readAt) return false;
    if (typeFilter !== 'all' && n.type !== typeFilter) return false;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const markOne = async (id: string) => {
    setPendingId(id);
    await markNotificationReadAction(id);
    setPendingId(null);
    router.refresh();
  };

  const markAll = async () => {
    setMarkingAll(true);
    await markAllNotificationsReadAction();
    setMarkingAll(false);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'unread')} className="w-auto">
            <option value="all">همه</option>
            <option value="unread">خوانده‌نشده</option>
          </Select>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-auto">
            <option value="all">همه نوع‌ها</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </Select>
        </div>
        {unreadCount > 0 && (
          <Button type="button" variant="secondary" size="sm" onClick={markAll} loading={markingAll}>
            <CheckCheck className="size-3.5" aria-hidden />
            علامت‌گذاری همه به‌عنوان خوانده‌شده
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-0">
          <EmptyState icon={<Bell className="size-7" aria-hidden />} title="اعلانی برای نمایش نیست" />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-border-base">
            {filtered.map((n) => (
              <li key={n.id} className={cn('flex items-start gap-3 px-5 py-4', !n.readAt && 'bg-primary-soft/40')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} aria-hidden />
                <div className="min-w-0 flex-1">
                  {n.href ? (
                    <Link href={n.href} className="text-sm font-medium text-fg hover:text-primary" onClick={() => !n.readAt && markOne(n.id)}>
                      {n.title}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium text-fg">{n.title}</p>
                  )}
                  <p className="mt-0.5 text-sm text-fg-muted">{n.body}</p>
                  <p className="mt-1 text-xs text-fg-faint tnum">{formatJalali(new Date(n.createdAt), true)}</p>
                </div>
                {!n.readAt && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => markOne(n.id)}
                    loading={pendingId === n.id}
                    aria-label="علامت‌گذاری به‌عنوان خوانده‌شده"
                  >
                    <Check className="size-3.5" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
