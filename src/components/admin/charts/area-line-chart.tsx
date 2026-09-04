'use client';

import * as React from 'react';
import { ChartDataTable, ChartEmpty, CHART_COLORS, faNum } from './chart-utils';

export type SeriesPoint = { label: string; value: number };

/**
 * Accessible inline-SVG area/line chart for a single time series (e.g.
 * revenue over time). No charting dependency — hand-rolled path generation.
 */
export function AreaLineChart({
  title,
  data,
  unit,
  color = CHART_COLORS.primary,
  height = 220,
  valueFormatter,
}: {
  title: string;
  data: SeriesPoint[];
  unit?: string;
  color?: string;
  height?: number;
  valueFormatter?: (v: number) => string;
}) {
  const fmt = valueFormatter ?? faNum;

  if (data.length === 0) return <ChartEmpty />;

  const width = 640;
  const padTop = 16;
  const padBottom = 28;
  const padStart = 8;
  const padEnd = 8;
  const innerW = width - padStart - padEnd;
  const innerH = height - padTop - padBottom;

  const max = Math.max(1, ...data.map((d) => d.value));
  const min = 0;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const xOf = (i: number) => padStart + i * stepX;
  const yOf = (v: number) => padTop + innerH - ((v - min) / (max - min || 1)) * innerH;

  const linePoints = data.map((d, i) => `${xOf(i)},${yOf(d.value)}`).join(' ');
  const areaPath = `M${padStart},${padTop + innerH} L${linePoints
    .split(' ')
    .join(' L')} L${xOf(data.length - 1)},${padTop + innerH} Z`;

  // Show a manageable number of x-axis labels.
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`${title} — مجموع ${fmt(total)}${unit ? ` ${unit}` : ''}`}
      >
        <line
          x1={padStart}
          y1={padTop + innerH}
          x2={width - padEnd}
          y2={padTop + innerH}
          stroke="var(--border-base)"
          strokeWidth={1}
        />
        <defs>
          <linearGradient id="gp-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#gp-area-fill)" stroke="none" />
        <polyline points={linePoints} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <circle key={i} cx={xOf(i)} cy={yOf(d.value)} r={2.5} fill={color}>
            <title>
              {d.label}: {fmt(d.value)}
              {unit ? ` ${unit}` : ''}
            </title>
          </circle>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text
              key={`lbl-${i}`}
              x={xOf(i)}
              y={height - 6}
              fontSize={10}
              textAnchor="middle"
              fill="var(--text-faint)"
            >
              {d.label}
            </text>
          ) : null,
        )}
      </svg>
      <ChartDataTable
        caption={title}
        columns={['برچسب', 'مقدار']}
        rows={data.map((d) => [d.label, fmt(d.value)])}
      />
    </div>
  );
}
