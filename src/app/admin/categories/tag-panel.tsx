'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Tag as TagIcon, Plus, X } from 'lucide-react';
import { Panel } from '@/components/admin/kit';
import { Button, Input, Badge, EmptyState } from '@/components/ui';
import { createTag, deleteTag } from './actions';

export function TagPanel({
  initialTags,
}: {
  initialTags: { id: string; nameFa: string; slug: string; productCount: number }[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Panel title="برچسب‌ها" description="برچسب‌های قابل استفاده روی محصولات برای جست‌وجو و فیلتر.">
      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          setError(null);
          const res = await createTag({ nameFa: name.trim() });
          setBusy(false);
          if (res.ok) {
            setName('');
            router.refresh();
          } else setError(res.error);
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="نام برچسب جدید"
          className="h-9 max-w-xs"
          aria-label="نام برچسب جدید"
        />
        <Button type="submit" size="sm" loading={busy} disabled={!name.trim()}>
          <Plus className="size-4" aria-hidden />
          افزودن برچسب
        </Button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </form>

      {initialTags.length === 0 ? (
        <EmptyState icon={<TagIcon className="size-6" aria-hidden />} title="برچسبی ثبت نشده" />
      ) : (
        <div className="flex flex-wrap gap-2">
          {initialTags.map((t) => (
            <Badge key={t.id} tone="neutral" className="gap-1.5 py-1.5">
              {t.nameFa}
              <span className="text-fg-faint tnum">({t.productCount.toLocaleString('fa-IR')})</span>
              <button
                type="button"
                aria-label={`حذف برچسب ${t.nameFa}`}
                className="text-fg-faint hover:text-danger"
                onClick={async () => {
                  const res = await deleteTag(t.id);
                  if (res.ok) router.refresh();
                  else alert(res.error);
                }}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </Panel>
  );
}
