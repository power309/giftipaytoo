'use client';

import * as React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

type Mode = 'light' | 'dark' | 'system';

const OPTIONS: { key: Mode; label: string; Icon: typeof Sun }[] = [
  { key: 'light', label: 'روشن', Icon: Sun },
  { key: 'dark', label: 'تیره', Icon: Moon },
  { key: 'system', label: 'سیستم', Icon: Monitor },
];

/**
 * Theme switch. The stored preference is applied before paint by an inline
 * script in the root layout, so there is no flash of the wrong theme.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = React.useState<Mode>('system');
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem('gp-theme');
      setMode(stored === 'dark' || stored === 'light' ? stored : 'system');
    } catch {
      /* storage blocked — fall back to system */
    }
  }, []);

  const apply = React.useCallback((next: Mode) => {
    setMode(next);
    try {
      if (next === 'system') {
        localStorage.removeItem('gp-theme');
        document.documentElement.removeAttribute('data-theme');
      } else {
        localStorage.setItem('gp-theme', next);
        document.documentElement.setAttribute('data-theme', next);
      }
    } catch {
      /* storage blocked — the in-page attribute still applies */
    }
  }, []);

  if (compact) {
    const next: Mode = mode === 'dark' ? 'light' : 'dark';
    return (
      <button
        type="button"
        onClick={() => apply(next)}
        aria-label={`تغییر به حالت ${next === 'dark' ? 'تیره' : 'روشن'}`}
        className="grid size-10 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
      >
        {mounted && mode === 'dark' ? (
          <Sun className="size-5" aria-hidden />
        ) : (
          <Moon className="size-5" aria-hidden />
        )}
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="حالت نمایش"
      className="inline-flex rounded-xl border border-border-base bg-surface p-1"
    >
      {OPTIONS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={mounted && mode === key}
          onClick={() => apply(key)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            mounted && mode === key
              ? 'bg-primary text-primary-contrast'
              : 'text-fg-muted hover:text-fg',
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
