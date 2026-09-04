'use client';

import * as React from 'react';
import { toPersianDigits } from '@/lib/persian';
import { EmptyState } from '@/components/ui';
import { BarChart3 } from 'lucide-react';

/** Visually-hidden but screen-reader- and Ctrl+F-accessible data table, paired with every chart. */
export function ChartDataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ChartEmpty({ label = 'داده‌ای برای نمایش وجود ندارد' }: { label?: string }) {
  return (
    <EmptyState
      icon={<BarChart3 className="size-6" aria-hidden />}
      title={label}
      className="py-8"
    />
  );
}

export const CHART_COLORS = {
  primary: 'var(--primary)',
  accent: 'var(--accent)',
  gold: 'var(--gold)',
  danger: 'var(--danger)',
  warn: 'var(--warn)',
  muted: 'var(--border-strong)',
} as const;

export function faNum(n: number): string {
  return toPersianDigits(Math.round(n).toLocaleString('en-US'));
}
