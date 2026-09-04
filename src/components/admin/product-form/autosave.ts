'use client';

import * as React from 'react';
import type { ProductFormValue } from './types';

const AUTOSAVE_INTERVAL_MS = 20_000;

function draftKey(productId: string | undefined) {
  return `gp-admin-product-draft:${productId ?? 'new'}`;
}

export function readLocalDraft(productId: string | undefined): ProductFormValue | null {
  try {
    const raw = window.localStorage.getItem(draftKey(productId));
    if (!raw) return null;
    return JSON.parse(raw) as ProductFormValue;
  } catch {
    return null;
  }
}

export function clearLocalDraft(productId: string | undefined) {
  try {
    window.localStorage.removeItem(draftKey(productId));
  } catch {
    /* localStorage unavailable (private mode) — nothing to clean up */
  }
}

/**
 * Autosaves `value` to localStorage every ~20s while `dirty` is true.
 * Returns the timestamp of the last successful autosave, for the SaveBar.
 */
export function useLocalAutosave(
  productId: string | undefined,
  value: ProductFormValue,
  dirty: boolean,
): Date | null {
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const valueRef = React.useRef(value);
  valueRef.current = value;

  React.useEffect(() => {
    if (!dirty) return;
    const id = window.setInterval(() => {
      try {
        window.localStorage.setItem(draftKey(productId), JSON.stringify(valueRef.current));
        setLastSavedAt(new Date());
      } catch {
        /* quota exceeded or storage disabled — silently skip this tick */
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [dirty, productId]);

  return lastSavedAt;
}

/** Blocks tab close/reload while there are unsaved changes. */
export function useBeforeUnloadGuard(dirty: boolean) {
  React.useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}

/**
 * Intercepts clicks on same-app `<a href>` links while there are unsaved
 * changes, so navigating to another admin page (not just closing the tab)
 * also prompts for confirmation.
 */
export function useInAppNavigationGuard(dirty: boolean) {
  React.useEffect(() => {
    if (!dirty) return;
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!target) return;
      const href = target.getAttribute('href');
      if (!href || href.startsWith('#') || target.target === '_blank') return;
      const ok = window.confirm('تغییرات ذخیره‌نشده دارید. آیا از خروج مطمئن هستید؟');
      if (!ok) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [dirty]);
}
