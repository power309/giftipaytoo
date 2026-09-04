'use client';

import * as React from 'react';
import { ChartDataTable, ChartEmpty, CHART_COLORS, faNum } from './chart-utils';

export type BarDatum = { label: string; value: number };

/** Accessible horizontal bar chart — used for top products / top categories. */
export function BarChart({
  title,
  data,
  color = CHART_COLORS.accent,
  maxBars = 8,
}: {
  title: string;
  data: BarDatum[];
  color?: string;
  maxBars?: number;
}) {
  // Values are formatted here rather than via a `valueFormatter` prop: these
  // are Client Components, and a Server Component page cannot pass a function
  // across that boundary. `faNum` already groups digits and renders them in
  // Persian, which is the only format these charts need.
  const fmt = faNum;
  const rows = data.slice(0, maxBars);

  if (rows.length === 0) return <ChartEmpty />;

  const max = Math.max(1, ...rows.map((d) => d.value));

  return (
    <div>
      <ul className="space-y-2.5" role="img" aria-label={title}>
        {rows.map((d, i) => {
          const pct = Math.max(2, (d.value / max) * 100);
          return (
            <li key={i} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs text-fg-muted" title={d.label}>
                {d.label}
              </span>
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-surface-muted">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </span>
              <span className="w-16 shrink-0 text-end text-xs font-medium text-fg tnum">{fmt(d.value)}</span>
            </li>
          );
        })}
      </ul>
      <ChartDataTable
        caption={title}
        columns={['برچسب', 'مقدار']}
        rows={rows.map((d) => [d.label, fmt(d.value)])}
      />
    </div>
  );
}
