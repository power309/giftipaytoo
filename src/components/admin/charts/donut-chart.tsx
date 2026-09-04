'use client';

import * as React from 'react';
import { ChartDataTable, ChartEmpty, CHART_COLORS, faNum } from './chart-utils';

export type DonutSlice = { label: string; value: number; color?: string };

const PALETTE = [CHART_COLORS.primary, CHART_COLORS.accent, CHART_COLORS.gold, CHART_COLORS.warn, CHART_COLORS.danger, CHART_COLORS.muted];

/** Accessible donut chart — used for order-status breakdown. */
export function DonutChart({
  title,
  data,
  size = 160,
  thickness = 24,
}: {
  title: string;
  data: DonutSlice[];
  size?: number;
  thickness?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return <ChartEmpty />;

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const arcs = data.map((d, i) => {
    const frac = d.value / total;
    const dash = frac * circumference;
    const arc = {
      color: d.color ?? PALETTE[i % PALETTE.length],
      dasharray: `${dash} ${circumference - dash}`,
      dashoffset: -offset,
      label: d.label,
      value: d.value,
      pct: Math.round(frac * 1000) / 10,
    };
    offset += dash;
    return arc;
  });

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={title}>
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-base)" strokeWidth={thickness} />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={a.dasharray}
              strokeDashoffset={a.dashoffset}
            >
              <title>
                {a.label}: {faNum(a.value)} ({faNum(a.pct)}٪)
              </title>
            </circle>
          ))}
        </g>
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={700} fill="var(--text)">
          {faNum(total)}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {arcs.map((a, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-fg-muted">{a.label}</span>
            <span className="shrink-0 font-medium text-fg tnum">{faNum(a.value)}</span>
            <span className="w-10 shrink-0 text-end text-fg-faint tnum">{faNum(a.pct)}٪</span>
          </li>
        ))}
      </ul>
      <ChartDataTable
        caption={title}
        columns={['برچسب', 'مقدار', 'درصد']}
        rows={arcs.map((a) => [a.label, faNum(a.value), `${faNum(a.pct)}٪`])}
      />
    </div>
  );
}
