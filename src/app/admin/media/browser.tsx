'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Select, Input, Badge, EmptyState, Modal } from '@/components/ui';
import { ImageUploader } from '@/components/admin/product-form/image-uploader';
import { replaceMediaFile } from './actions';

export type MediaFile = {
  path: string;
  folder: string;
  width: number | null;
  height: number | null;
  bytes: number;
  mtime: number;
  referenced: boolean;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function MediaBrowser({ files }: { files: MediaFile[] }) {
  const router = useRouter();
  const [folder, setFolder] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [onlyUnused, setOnlyUnused] = React.useState(false);
  const [replaceTarget, setReplaceTarget] = React.useState<MediaFile | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<MediaFile | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const folders = React.useMemo(() => Array.from(new Set(files.map((f) => f.folder))).sort(), [files]);

  const filtered = files.filter((f) => {
    if (folder && f.folder !== folder) return false;
    if (onlyUnused && f.referenced) return false;
    if (query && !f.path.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  function flash(tone: 'ok' | 'err', text: string) {
    setNotice({ tone, text });
    setTimeout(() => setNotice(null), 4000);
  }

  async function copyPath(p: string) {
    try {
      await navigator.clipboard.writeText(p);
      setCopied(p);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      flash('err', 'کپی در این مرورگر پشتیبانی نمی‌شود.');
    }
  }

  async function handleDelete(f: MediaFile) {
    const res = await fetch('/api/admin/catalog/upload', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: f.path }),
    });
    const json = await res.json();
    setDeleteTarget(null);
    if (json.ok) {
      flash('ok', 'فایل حذف شد.');
      router.refresh();
    } else {
      flash('err', json.error ?? 'حذف فایل ناموفق بود.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جست‌وجوی مسیر فایل…"
          className="h-9 max-w-xs"
          aria-label="جست‌وجوی فایل"
        />
        <Select value={folder} onChange={(e) => setFolder(e.target.value)} className="h-9 w-40 text-xs" aria-label="فیلتر پوشه">
          <option value="">همه پوشه‌ها</option>
          {folders.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </Select>
        <Button
          type="button"
          size="sm"
          variant={onlyUnused ? 'primary' : 'secondary'}
          onClick={() => setOnlyUnused((v) => !v)}
        >
          فقط استفاده‌نشده‌ها
        </Button>
        <span className="ms-auto text-xs text-fg-muted tnum">{filtered.length.toLocaleString('fa-IR')} فایل</span>
      </div>

      {notice && (
        <p
          role="status"
          className={cn('rounded-xl px-3.5 py-2.5 text-sm', notice.tone === 'ok' ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger')}
        >
          {notice.text}
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={<Icons.ImageOff className="size-7" aria-hidden />} title="فایلی یافت نشد" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((f) => (
            <div key={f.path} className="card overflow-hidden p-0">
              <div className="relative aspect-video bg-surface-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.path} alt="" className="size-full object-contain" loading="lazy" />
                <span className="absolute end-2 top-2">
                  <Badge tone={f.referenced ? 'success' : 'warn'} size="sm">
                    {f.referenced ? 'استفاده‌شده' : 'بدون ارجاع'}
                  </Badge>
                </span>
              </div>
              <div className="space-y-2 p-3">
                <p className="truncate text-xs text-fg" dir="ltr" title={f.path}>{f.path}</p>
                <p className="text-[11px] text-fg-faint tnum">
                  {f.width && f.height ? `${f.width}×${f.height} — ` : ''}
                  {formatBytes(f.bytes)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" size="xs" variant="secondary" onClick={() => copyPath(f.path)}>
                    {copied === f.path ? <Icons.Check className="size-3.5" aria-hidden /> : <Icons.Copy className="size-3.5" aria-hidden />}
                    کپی مسیر
                  </Button>
                  <Button type="button" size="xs" variant="secondary" onClick={() => setReplaceTarget(f)}>
                    <Icons.RefreshCw className="size-3.5" aria-hidden />
                    جایگزینی
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="danger"
                    disabled={f.referenced}
                    title={f.referenced ? 'این فایل هنوز استفاده می‌شود' : undefined}
                    onClick={() => setDeleteTarget(f)}
                  >
                    <Icons.Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!replaceTarget} onClose={() => setReplaceTarget(null)} title="جایگزینی تصویر">
        {replaceTarget && (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              تصویر جدیدی بارگذاری کنید — همه ارجاع‌های موجود به این فایل خودکار به‌روزرسانی می‌شود و فایل قبلی حذف خواهد شد.
            </p>
            <p className="truncate text-xs text-fg-faint" dir="ltr">{replaceTarget.path}</p>
            <ImageUploader
              folder="uploads"
              label="انتخاب فایل جدید"
              onUploaded={async (r) => {
                const res = await replaceMediaFile({ oldPath: replaceTarget.path, newPath: r.path });
                setReplaceTarget(null);
                if (res.ok) {
                  flash('ok', `فایل جایگزین شد (${res.data?.updated ?? 0} ارجاع به‌روزرسانی شد).`);
                  router.refresh();
                } else {
                  flash('err', res.error);
                }
              }}
            />
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="حذف فایل"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)}>انصراف</Button>
            <Button type="button" variant="danger" onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              حذف قطعی
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <p className="text-sm text-fg">
            آیا از حذف <span dir="ltr" className="font-medium">{deleteTarget.path}</span> مطمئن هستید؟ این عملیات
            قابل بازگشت نیست.
          </p>
        )}
      </Modal>
    </div>
  );
}
