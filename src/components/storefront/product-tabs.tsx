'use client';

import * as React from 'react';
import { Tabs } from '@/components/ui';

export type ProductTabDef = { key: string; label: string; badge?: number; content: React.ReactNode };

/** Product-page tab strip: توضیحات / راهنمای فعال‌سازی / محدودیت‌ها / سؤالات متداول / دیدگاه‌ها. */
export function ProductTabs({ tabs, initial }: { tabs: ProductTabDef[]; initial?: string }) {
  const [active, setActive] = React.useState(initial ?? tabs[0]?.key ?? '');
  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <Tabs
        tabs={tabs.map(({ key, label, badge }) => ({ key, label, badge }))}
        active={active}
        onChange={setActive}
      />
      <div role="tabpanel" className="py-5">
        {activeTab?.content}
      </div>
    </div>
  );
}

/** Renders plain multi-paragraph Persian text (from a textarea-authored field) as prose. */
export function ProseText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return <p className="text-sm text-fg-muted">اطلاعاتی ثبت نشده است.</p>;
  return (
    <div className="prose-fa max-w-none text-sm">
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split('\n').map((line, j) => (
            <React.Fragment key={j}>
              {j > 0 && <br />}
              {line}
            </React.Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
