'use client';

import * as React from 'react';
import { UploadCloud, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type UploadResult = { path: string; width: number; height: number; bytes: number };

/**
 * Thin client wrapper around POST /api/admin/catalog/upload. Reused by the
 * media library, category/brand icon fields, and the product-form media tab
 * — the single upload surface for the whole admin-catalog area.
 */
export function ImageUploader({
  folder,
  onUploaded,
  label = 'بارگذاری تصویر',
  compact = false,
}: {
  folder: 'uploads' | 'posters' | 'gallery' | 'banners' | 'categories' | 'brands' | 'og';
  onUploaded: (result: UploadResult) => void;
  label?: string;
  compact?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('folder', folder);
      const res = await fetch('/api/admin/catalog/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'بارگذاری ناموفق بود.');
        return;
      }
      onUploaded({ path: json.path, width: json.width, height: json.height, bytes: json.bytes });
    } catch {
      setError('خطا در ارتباط با سرور.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className={cn('space-y-1.5', compact && 'inline-block')}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="sr-only"
        id={`uploader-${folder}-${label}`}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <label
        htmlFor={`uploader-${folder}-${label}`}
        className={cn(
          'inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border-strong px-3.5 py-2 text-xs font-medium text-fg-muted transition-colors hover:border-primary hover:text-primary',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UploadCloud className="size-4" aria-hidden />}
        {busy ? 'در حال بارگذاری…' : label}
      </label>
      {error && (
        <p className="flex items-center gap-1 text-xs text-danger" role="alert">
          <X className="size-3.5" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
