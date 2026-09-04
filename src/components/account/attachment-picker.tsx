'use client';

import * as React from 'react';
import { Paperclip, X, Loader2, ImageIcon } from 'lucide-react';
import { csrfFetch } from './csrf-client';

export type UploadedAttachment = { path: string; name: string; size: number; mime: string };

const MAX_FILES = 3;
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Ticket attachment picker: validates type/size client-side, uploads each
 * file immediately to `/account/tickets/upload`, and reports the resulting
 * list of stored attachments via `onChange` — a hidden form field then
 * carries that JSON on submit.
 */
export function AttachmentPicker({ onChange }: { onChange: (files: UploadedAttachment[]) => void }) {
  const [files, setFiles] = React.useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const emit = (next: UploadedAttachment[]) => {
    setFiles(next);
    onChange(next);
  };

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;
    setError(null);

    if (files.length + picked.length > MAX_FILES) {
      setError(`حداکثر ${MAX_FILES} فایل قابل پیوست است.`);
      return;
    }

    for (const file of picked) {
      if (!ALLOWED.includes(file.type)) {
        setError('فقط تصویر JPG، PNG یا WebP قابل پیوست است.');
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`حجم فایل «${file.name}» بیشتر از ۴ مگابایت است.`);
        continue;
      }
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await csrfFetch('/account/tickets/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.ok) {
          emit([...files, { path: data.path, name: data.name, size: data.size, mime: data.mime }]);
        } else {
          setError(data.error ?? 'بارگذاری فایل ناموفق بود.');
        }
      } catch {
        setError('ارتباط با سرور برای بارگذاری فایل برقرار نشد.');
      } finally {
        setUploading(false);
      }
    }
  };

  const remove = (path: string) => emit(files.filter((f) => f.path !== path));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || files.length >= MAX_FILES}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-base px-3 text-xs font-medium text-fg transition-colors hover:bg-surface-muted disabled:opacity-50"
        >
          {uploading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Paperclip className="size-3.5" aria-hidden />}
          پیوست تصویر
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleSelect}
          aria-label="پیوست تصویر"
        />
        <span className="text-xs text-fg-faint">حداکثر {MAX_FILES} تصویر، هر کدام تا ۴ مگابایت (JPG، PNG، WebP)</span>
      </div>

      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f) => (
            <li key={f.path} className="flex items-center gap-1.5 rounded-lg border border-border-base bg-surface-muted px-2.5 py-1.5 text-xs">
              <ImageIcon className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
              <span className="max-w-[10rem] truncate">{f.name}</span>
              <button type="button" onClick={() => remove(f.path)} aria-label={`حذف پیوست ${f.name}`}>
                <X className="size-3.5 text-fg-faint hover:text-danger" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
