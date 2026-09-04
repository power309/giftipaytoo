'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FaqEntry = { id: string; questionFa: string; answerFa: string };

/**
 * Accessible accordion (single- or multi-open) built from real <button>
 * triggers with aria-expanded/aria-controls, keyboard-operable by default
 * since it uses native buttons.
 */
export function FaqAccordion({
  items,
  className,
  defaultOpenId,
}: {
  items: FaqEntry[];
  className?: string;
  defaultOpenId?: string;
}) {
  const [openId, setOpenId] = React.useState<string | null>(defaultOpenId ?? null);

  if (items.length === 0) return null;

  return (
    <div className={cn('divide-y divide-border-base rounded-2xl border border-border-base bg-surface', className)}>
      {items.map((item) => {
        const open = openId === item.id;
        const panelId = `faq-panel-${item.id}`;
        const btnId = `faq-btn-${item.id}`;
        return (
          <div key={item.id}>
            <h3>
              <button
                type="button"
                id={btnId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : item.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-start text-sm font-medium text-fg transition-colors hover:bg-surface-muted sm:px-5"
              >
                {item.questionFa}
                <ChevronDown className={cn('size-4.5 shrink-0 text-fg-faint transition-transform duration-200', open && 'rotate-180')} aria-hidden />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              hidden={!open}
              className="px-4 pb-4 text-sm leading-7 text-fg-muted sm:px-5"
            >
              {item.answerFa}
            </div>
          </div>
        );
      })}
    </div>
  );
}
