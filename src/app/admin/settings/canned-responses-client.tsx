'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Textarea } from '@/components/ui';
import { Panel } from '@/components/admin/kit';
import { saveCannedResponses } from './actions';

export type CannedResponse = { label: string; body: string };

export function CannedResponsesPanel({ initial = [] }: { initial?: CannedResponse[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState<CannedResponse[]>(initial.length ? initial : [{ label: '', body: '' }]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  function update(i: number, patch: Partial<CannedResponse>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function remove(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const cleaned = items.filter((i) => i.label.trim() && i.body.trim());
    const res = await saveCannedResponses({ items: cleaned });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setSaved(true);
      setItems(cleaned.length ? cleaned : [{ label: '', body: '' }]);
      router.refresh();
    }
  }

  return (
    <Panel
      title="پاسخ‌های آماده پشتیبانی"
      description="این پاسخ‌ها در پاسخگویی به تیکت‌ها قابل انتخاب هستند."
      actions={<Button size="sm" variant="secondary" onClick={() => setItems((prev) => [...prev, { label: '', body: '' }])}><Plus className="size-4" aria-hidden />افزودن</Button>}
    >
      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2 rounded-lg border border-border-base p-2.5">
            <div className="flex-1 space-y-2">
              <Input value={it.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="عنوان پاسخ (مثلاً «تأخیر تحویل»)" className="h-9 text-xs" />
              <Textarea value={it.body} onChange={(e) => update(i, { body: e.target.value })} placeholder="متن پاسخ…" rows={2} className="text-xs" />
            </div>
            <Button size="xs" variant="ghost" onClick={() => remove(i)} aria-label="حذف">
              <Trash2 className="size-3.5 text-danger" aria-hidden />
            </Button>
          </div>
        ))}
        {error && <p className="text-xs text-danger">{error}</p>}
        {saved && !error && <p className="text-xs text-accent">ذخیره شد.</p>}
        <Button size="sm" loading={busy} onClick={submit}>ذخیره پاسخ‌های آماده</Button>
      </div>
    </Panel>
  );
}
