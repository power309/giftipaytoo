'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Textarea, Select, Tabs } from '@/components/ui';
import { renderSimpleMarkdown } from '@/lib/simple-markdown';
import { toPersianDigits } from '@/lib/persian';
import { saveBlogPost, deleteBlogPost } from './actions';

export type PostInitial = {
  id: string; slug: string; titleFa: string; excerptFa: string; contentFa: string;
  coverPath: string | null; coverAlt: string | null; categoryFa: string | null; tags: string | null;
  readingMinutes: number; status: string; viewCount: number; seoTitle: string | null; seoDescription: string | null;
  publishedAt: Date | null;
} | null;

function toDateTimeLocal(d: Date | null): string {
  if (!d) return '';
  const dt = new Date(d);
  dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
  return dt.toISOString().slice(0, 16);
}

export function BlogEditorClient({ initial }: { initial: PostInitial }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<'edit' | 'preview'>('edit');
  const [slug, setSlug] = React.useState(initial?.slug ?? '');
  const [titleFa, setTitleFa] = React.useState(initial?.titleFa ?? '');
  const [excerptFa, setExcerptFa] = React.useState(initial?.excerptFa ?? '');
  const [contentFa, setContentFa] = React.useState(initial?.contentFa ?? '');
  const [coverPath, setCoverPath] = React.useState(initial?.coverPath ?? '');
  const [coverAlt, setCoverAlt] = React.useState(initial?.coverAlt ?? '');
  const [categoryFa, setCategoryFa] = React.useState(initial?.categoryFa ?? '');
  const [tags, setTags] = React.useState(initial?.tags ?? '');
  const [readingMinutes, setReadingMinutes] = React.useState(initial?.readingMinutes ?? 3);
  const [status, setStatus] = React.useState(initial?.status ?? 'DRAFT');
  const [seoTitle, setSeoTitle] = React.useState(initial?.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = React.useState(initial?.seoDescription ?? '');
  const [publishedAt, setPublishedAt] = React.useState(toDateTimeLocal(initial?.publishedAt ?? null));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveBlogPost({
      id: initial?.id, slug, titleFa, excerptFa, contentFa, coverPath: coverPath || undefined, coverAlt: coverAlt || undefined,
      categoryFa: categoryFa || undefined, tags: tags || undefined, readingMinutes, status: status as never,
      seoTitle: seoTitle || undefined, seoDescription: seoDescription || undefined, publishedAt: publishedAt || undefined,
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      router.push('/admin/blog');
      router.refresh();
    }
  }

  async function remove() {
    if (!initial || !window.confirm('این نوشته حذف شود؟')) return;
    setBusy(true);
    const res = await deleteBlogPost({ id: initial.id });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      router.push('/admin/blog');
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
          <Field label="نشانی (Slug)" required>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} dir="ltr" />
          </Field>
        </div>
        <Field label="خلاصه" required>
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
          <Field label="زمان‌بندی انتشار" hint="خالی بگذارید تا هنگام انتشار خودکار تنظیم شود.">
            <Input type="datetime-local" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
          </Field>
          <Field label="دسته">
            <Input value={categoryFa} onChange={(e) => setCategoryFa(e.target.value)} />
          </Field>
          <Field label="برچسب‌ها" hint="با کاما جدا کنید.">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} dir="ltr" />
          </Field>
          <Field label="زمان مطالعه (دقیقه)">
            <Input type="number" min={1} value={readingMinutes} onChange={(e) => setReadingMinutes(Number(e.target.value))} />
          </Field>
          {initial && <p className="text-xs text-fg-faint">تعداد بازدید: {toPersianDigits(initial.viewCount)}</p>}
        </div>

        <div className="rounded-xl border border-border-base bg-surface p-4 space-y-3">
          <p className="text-xs font-semibold text-fg-muted">تصویر شاخص</p>
          <Field label="مسیر تصویر">
            <Input value={coverPath} onChange={(e) => setCoverPath(e.target.value)} dir="ltr" placeholder="/media/blog/…" />
          </Field>
          <Field label="متن جایگزین تصویر">
            <Input value={coverAlt} onChange={(e) => setCoverAlt(e.target.value)} />
          </Field>
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
          <Button size="sm" loading={busy} disabled={!titleFa || !slug || !contentFa || !excerptFa} onClick={save}>
            {initial ? 'ذخیره تغییرات' : 'ایجاد نوشته'}
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
