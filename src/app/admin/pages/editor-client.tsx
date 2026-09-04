'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Textarea, Select, Checkbox, Tabs } from '@/components/ui';
import { renderSimpleMarkdown } from '@/lib/simple-markdown';
import { savePage, deletePage } from './actions';

export type PageInitial = {
  id: string; slug: string; titleFa: string; contentFa: string; excerptFa: string | null;
  status: string; seoTitle: string | null; seoDescription: string | null; showInFooter: boolean; sortOrder: number;
} | null;

export function PageEditorClient({ initial }: { initial: PageInitial }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<'edit' | 'preview'>('edit');
  const [slug, setSlug] = React.useState(initial?.slug ?? '');
  const [titleFa, setTitleFa] = React.useState(initial?.titleFa ?? '');
  const [contentFa, setContentFa] = React.useState(initial?.contentFa ?? '');
  const [excerptFa, setExcerptFa] = React.useState(initial?.excerptFa ?? '');
  const [status, setStatus] = React.useState(initial?.status ?? 'DRAFT');
  const [seoTitle, setSeoTitle] = React.useState(initial?.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = React.useState(initial?.seoDescription ?? '');
  const [showInFooter, setShowInFooter] = React.useState(initial?.showInFooter ?? false);
  const [sortOrder, setSortOrder] = React.useState(initial?.sortOrder ?? 0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await savePage({
      id: initial?.id, slug, titleFa, contentFa, excerptFa: excerptFa || undefined, status: status as never,
      seoTitle: seoTitle || undefined, seoDescription: seoDescription || undefined, showInFooter, sortOrder,
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      router.push('/admin/pages');
      router.refresh();
    }
  }

  async function remove() {
    if (!initial || !window.confirm('این صفحه حذف شود؟')) return;
    setBusy(true);
    const res = await deletePage({ id: initial.id });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      router.push('/admin/pages');
      router.refresh();
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="عنوان" required>
            <Input value={titleFa} onChange={(e) => setTitleFa(e.target.value)} />
          </Field>
          <Field label="نشانی (Slug)" required hint="فقط حروف لاتین، عدد و خط تیره.">
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} dir="ltr" />
          </Field>
        </div>
        <Field label="خلاصه">
          <Textarea value={excerptFa} onChange={(e) => setExcerptFa(e.target.value)} rows={2} />
        </Field>

        <div className="rounded-xl border border-border-base bg-surface">
          <Tabs tabs={[{ key: 'edit', label: 'ویرایش' }, { key: 'preview', label: 'پیش‌نمایش' }]} active={tab} onChange={(k) => setTab(k as typeof tab)} className="px-3" />
          <div className="p-3">
            {tab === 'edit' ? (
              <Textarea value={contentFa} onChange={(e) => setContentFa(e.target.value)} rows={18} className="font-mono text-xs leading-6" dir="rtl" />
            ) : (
              <div className="prose-fa min-h-[24rem]" dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(contentFa) }} />
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border-base bg-surface p-4 space-y-3">
          <Field label="وضعیت">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="DRAFT">پیش‌نویس</option>
              <option value="PUBLISHED">منتشرشده</option>
              <option value="ARCHIVED">بایگانی</option>
            </Select>
          </Field>
          <Field label="ترتیب نمایش">
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
          </Field>
          <Checkbox checked={showInFooter} onChange={(e) => setShowInFooter(e.target.checked)} label="نمایش در فوتر" />
        </div>

        <div className="rounded-xl border border-border-base bg-surface p-4 space-y-3">
          <p className="text-xs font-semibold text-fg-muted">سئو</p>
          <Field label="عنوان سئو">
            <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
          </Field>
          <Field label="توضیحات سئو">
            <Textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={3} />
          </Field>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={busy} disabled={!titleFa || !slug || !contentFa} onClick={save}>
            {initial ? 'ذخیره تغییرات' : 'ایجاد صفحه'}
          </Button>
          {initial && (
            <Button size="sm" variant="danger" loading={busy} onClick={remove}>
              حذف
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
