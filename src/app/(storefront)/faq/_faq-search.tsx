'use client';

import * as React from 'react';
import { Search, HelpCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { normalizeFa } from '@/lib/persian';
import { FaqAccordion } from '@/components/storefront/faq-accordion';
import { FAQ_GROUP_LABELS, type FaqItem } from '../_content-shared';

export function FaqSearch({ groups }: { groups: { group: string; items: FaqItem[] }[] }) {
  const [q, setQ] = React.useState('');
  const query = normalizeFa(q);

  const filtered = React.useMemo(() => {
    if (!query) return groups;
    return groups
      .map((g) => ({
        group: g.group,
        items: g.items.filter((it) => normalizeFa(it.questionFa).includes(query) || normalizeFa(it.answerFa).includes(query)),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  const total = filtered.reduce((a, g) => a + g.items.length, 0);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="pointer-events-none absolute end-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-faint" aria-hidden />
        <label htmlFor="faq-search" className="sr-only">
          جست‌وجو در سؤالات متداول
        </label>
        <input
          id="faq-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جست‌وجو در سؤالات متداول…"
          className="h-12 w-full rounded-xl border border-border-base bg-surface ps-11 pe-4 text-sm text-fg placeholder:text-fg-faint focus:border-primary focus:outline-2 focus:outline-primary/25"
        />
      </div>

      {total === 0 ? (
        <EmptyState icon={<HelpCircle className="size-7" aria-hidden />} title="سؤالی یافت نشد" description="عبارت دیگری را امتحان کنید یا با پشتیبانی تماس بگیرید." />
      ) : (
        filtered.map((g) => (
          <section key={g.group} aria-labelledby={`faq-group-${g.group}`}>
            <h2 id={`faq-group-${g.group}`} className="mb-3 text-base font-bold text-fg">
              {FAQ_GROUP_LABELS[g.group] ?? g.group}
            </h2>
            <FaqAccordion items={g.items} />
          </section>
        ))
      )}
    </div>
  );
}
