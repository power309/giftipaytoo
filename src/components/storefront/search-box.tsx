'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Search, X, Clock, TrendingUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toPersianDigits } from '@/lib/persian';

type Suggestion = {
  type: 'product' | 'brand' | 'category';
  label: string;
  href: string;
  image?: string | null;
  meta?: string | null;
};

const RECENT_KEY = 'gp-recent-searches';

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function pushRecent(q: string) {
  try {
    const next = [q, ...readRecent().filter((x) => x !== q)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked — recent searches are a convenience only */
  }
}

/**
 * Autocomplete search. Debounced, keyboard navigable, degrades to a plain
 * form submit when JavaScript or the suggest endpoint is unavailable.
 */
export function SearchBox({
  popular = [],
  className,
  autoFocus = false,
  onNavigate,
}: {
  popular?: string[];
  className?: string;
  autoFocus?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<Suggestion[]>([]);
  const [recent, setRecent] = React.useState<string[]>([]);
  const [cursor, setCursor] = React.useState(-1);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();

  React.useEffect(() => setRecent(readRecent()), []);

  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('suggest failed');
        const data = await res.json();
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setItems([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const submit = (term: string) => {
    const t = term.trim();
    if (!t) return;
    pushRecent(t);
    setRecent(readRecent());
    setOpen(false);
    inputRef.current?.blur();
    onNavigate?.();
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };

  const flat: { label: string; href?: string; term?: string }[] = [
    ...items.map((i) => ({ label: i.label, href: i.href })),
    ...(q.trim().length < 2
      ? [...recent, ...popular].map((t) => ({ label: t, term: t }))
      : []),
  ];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => Math.min(c + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, -1));
    } else if (e.key === 'Enter') {
      const picked = flat[cursor];
      if (cursor >= 0 && picked) {
        e.preventDefault();
        if (picked.href) {
          setOpen(false);
          onNavigate?.();
          router.push(picked.href);
        } else if (picked.term) {
          submit(picked.term);
        }
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setCursor(-1);
    }
  };

  const showPanel = open && (loading || flat.length > 0);

  return (
    <div ref={boxRef} className={cn('relative w-full', className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
      >
        <label htmlFor={`${listId}-input`} className="sr-only">
          جست‌وجوی محصولات
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute end-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-faint"
            aria-hidden
          />
          <input
            id={`${listId}-input`}
            ref={inputRef}
            type="search"
            value={q}
            autoFocus={autoFocus}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setCursor(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="جست‌وجو در گیفت کارت‌ها، برندها و اشتراک‌ها…"
            autoComplete="off"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-autocomplete="list"
            className={cn(
              'h-11 w-full rounded-xl border border-border-base bg-surface ps-11 pe-11 text-sm',
              'text-fg placeholder:text-fg-faint transition-colors',
              'focus:border-primary focus:outline-2 focus:outline-primary/25',
            )}
          />
          {loading ? (
            <Loader2 className="absolute start-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-fg-faint" aria-hidden />
          ) : q ? (
            <button
              type="button"
              onClick={() => {
                setQ('');
                inputRef.current?.focus();
              }}
              aria-label="پاک کردن جست‌وجو"
              className="absolute start-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-fg-faint hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </form>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-border-base bg-surface p-2 shadow-[var(--shadow-lift)] gp-fade-up"
        >
          {loading && items.length === 0 && (
            <div className="space-y-2 p-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-11 w-full" />
              ))}
            </div>
          )}

          {items.length > 0 && (
            <ul className="space-y-0.5">
              {items.map((s, i) => (
                <li key={`${s.type}-${s.href}`}>
                  <Link
                    href={s.href}
                    role="option"
                    aria-selected={cursor === i}
                    onClick={() => {
                      setOpen(false);
                      onNavigate?.();
                    }}
                    className={cn(
                      'flex items-center gap-3 rounded-xl p-2 transition-colors',
                      cursor === i ? 'bg-primary-soft' : 'hover:bg-surface-muted',
                    )}
                  >
                    {s.image ? (
                      <Image
                        src={s.image}
                        alt=""
                        width={40}
                        height={40}
                        className="size-10 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-muted text-fg-faint">
                        <Search className="size-4" aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{s.label}</span>
                      {s.meta && <span className="block truncate text-xs text-fg-faint">{s.meta}</span>}
                    </span>
                    <span className="shrink-0 text-[11px] text-fg-faint">
                      {s.type === 'product' ? 'محصول' : s.type === 'brand' ? 'برند' : 'دسته'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {q.trim().length >= 2 && !loading && items.length === 0 && (
            <div className="p-6 text-center">
              <p className="text-sm text-fg">نتیجه‌ای یافت نشد</p>
              <p className="mt-1 text-xs text-fg-muted">
                املای دیگری را امتحان کنید یا از دسته‌بندی‌ها استفاده کنید.
              </p>
            </div>
          )}

          {q.trim().length < 2 && (
            <div className="space-y-3 p-1">
              {recent.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-fg-faint">
                    <Clock className="size-3.5" aria-hidden />
                    جست‌وجوهای اخیر
                  </p>
                  <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                    {recent.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => submit(t)}
                        className="rounded-full border border-border-base px-3 py-1 text-xs text-fg-muted transition-colors hover:border-primary hover:text-primary"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {popular.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-fg-faint">
                    <TrendingUp className="size-3.5" aria-hidden />
                    جست‌وجوهای پرطرفدار
                  </p>
                  <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                    {popular.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => submit(t)}
                        className="rounded-full bg-surface-muted px-3 py-1 text-xs text-fg-muted transition-colors hover:bg-primary-soft hover:text-primary"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SearchResultCount({ count }: { count: number }) {
  return (
    <span className="text-sm text-fg-muted tnum">
      {toPersianDigits(count)} نتیجه
    </span>
  );
}
