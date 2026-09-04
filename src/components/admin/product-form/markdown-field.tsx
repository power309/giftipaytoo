'use client';

import * as React from 'react';
import { Bold, Italic, Heading2, List, ListOrdered, Link2, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Field, Textarea, Button } from '@/components/ui';
import { renderMarkdownFa } from './markdown';

type WrapKind = 'bold' | 'italic' | 'h2' | 'ul' | 'ol' | 'link';

function applyWrap(text: string, start: number, end: number, kind: WrapKind): { text: string; selStart: number; selEnd: number } {
  const selected = text.slice(start, end) || 'متن';
  let before = text.slice(0, start);
  const after = text.slice(end);
  let inserted = selected;

  switch (kind) {
    case 'bold':
      inserted = `**${selected}**`;
      break;
    case 'italic':
      inserted = `*${selected}*`;
      break;
    case 'h2': {
      if (before && !before.endsWith('\n')) before += '\n';
      inserted = `## ${selected}`;
      if (after && !after.startsWith('\n')) inserted += '\n';
      break;
    }
    case 'ul': {
      if (before && !before.endsWith('\n')) before += '\n';
      inserted = selected
        .split('\n')
        .map((l) => `- ${l}`)
        .join('\n');
      break;
    }
    case 'ol': {
      if (before && !before.endsWith('\n')) before += '\n';
      inserted = selected
        .split('\n')
        .map((l, i) => `${i + 1}. ${l}`)
        .join('\n');
      break;
    }
    case 'link':
      inserted = `[${selected}](https://)`;
      break;
  }

  return { text: before + inserted + after, selStart: before.length, selEnd: before.length + inserted.length };
}

export function MarkdownField({
  id,
  label,
  value,
  onChange,
  rows = 6,
  hint,
  error,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  const [preview, setPreview] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  function toolbar(kind: WrapKind) {
    const el = ref.current;
    if (!el) return;
    const { text, selStart, selEnd } = applyWrap(value, el.selectionStart ?? value.length, el.selectionEnd ?? value.length, kind);
    onChange(text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }

  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} required={required}>
      <div className="overflow-hidden rounded-xl border border-border-base">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border-base bg-surface-muted/60 p-1.5">
          <ToolbarButton icon={Bold} label="پررنگ" onClick={() => toolbar('bold')} />
          <ToolbarButton icon={Italic} label="مورب" onClick={() => toolbar('italic')} />
          <ToolbarButton icon={Heading2} label="عنوان" onClick={() => toolbar('h2')} />
          <ToolbarButton icon={List} label="فهرست نقطه‌ای" onClick={() => toolbar('ul')} />
          <ToolbarButton icon={ListOrdered} label="فهرست شماره‌دار" onClick={() => toolbar('ol')} />
          <ToolbarButton icon={Link2} label="پیوند" onClick={() => toolbar('link')} />
          <Button
            type="button"
            size="xs"
            variant={preview ? 'primary' : 'ghost'}
            className="ms-auto"
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
            {preview ? 'ویرایش' : 'پیش‌نمایش'}
          </Button>
        </div>
        {preview ? (
          <div
            className="prose-fa min-h-[8rem] max-h-80 overflow-y-auto bg-surface p-3.5 text-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdownFa(value) || '<p class="text-fg-faint">چیزی برای پیش‌نمایش نیست.</p>' }}
          />
        ) : (
          <Textarea
            id={id}
            ref={ref}
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-none border-0 focus:outline-none"
            aria-invalid={!!error}
          />
        )}
      </div>
    </Field>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn('grid size-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface hover:text-fg')}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
