'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface BarChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  height?: number;
  showValues?: boolean;
  formatValue?: (v: number) => string;
  className?: string;
  ariaLabel?: string;
}

export function BarChart({
  data,
  height = 240,
  showValues = true,
  formatValue = (v) => v.toLocaleString(),
  className,
  ariaLabel = 'Bar chart',
}: BarChartProps) {
  const max = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data]);

  return (
    <div
      role="img"
      aria-label={`${ariaLabel}: ${data.map((d) => `${d.label}: ${formatValue(d.value)}`).join(', ')}`}
      className={cn('w-full', className)}
    >
      <div className="flex h-full items-end justify-around gap-2" style={{ height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * 100;
          return (
            <div
              key={i}
              className="group relative flex h-full flex-1 flex-col items-center justify-end"
            >
              {showValues && d.value > 0 && (
                <span className="mb-1 text-xs font-medium text-gray-700">
                  {formatValue(d.value)}
                </span>
              )}
              <div
                className={cn(
                  'w-full rounded-t-md transition-all',
                  d.color || 'bg-blue-500 hover:bg-blue-600'
                )}
                style={{ height: `${h}%`, minHeight: d.value > 0 ? '4px' : '0' }}
                aria-hidden="true"
              />
              <span className="mt-2 truncate text-xs text-gray-600 max-w-full">
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface LineChartProps {
  data: Array<{ label: string; value: number }>;
  height?: number;
  color?: string;
  showDots?: boolean;
  showGrid?: boolean;
  formatValue?: (v: number) => string;
  className?: string;
  ariaLabel?: string;
}

export function LineChart({
  data,
  height = 240,
  color = '#2563eb',
  showDots = true,
  showGrid = true,
  formatValue = (v) => v.toLocaleString(),
  className,
  ariaLabel = 'Line chart',
}: LineChartProps) {
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const width = 600;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const { points, max, gridLines } = useMemo(() => {
    const max = Math.max(...data.map((d) => d.value), 1);
    const min = 0;
    const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW;
    const points = data.map((d, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + innerH - ((d.value - min) / (max - min || 1)) * innerH;
      return { x, y, value: d.value, label: d.label };
    });
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
      y: padding.top + innerH * p,
      value: max - max * p,
    }));
    return { points, max, gridLines };
  }, [data, innerH, innerW]);

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const areaD = `${pathD} L ${points[points.length - 1]?.x ?? 0} ${padding.top + innerH} L ${padding.left} ${padding.top + innerH} Z`;

  return (
    <div
      role="img"
      aria-label={`${ariaLabel}: ${data.map((d) => `${d.label}: ${formatValue(d.value)}`).join(', ')}`}
      className={cn('w-full', className)}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-auto w-full"
        aria-hidden="true"
      >
        {showGrid &&
          gridLines.map((g, i) => (
            <g key={i}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={g.y}
                y2={g.y}
                stroke="#e5e7eb"
                strokeWidth={1}
                strokeDasharray={i === gridLines.length - 1 ? '0' : '3 3'}
              />
              <text
                x={padding.left - 6}
                y={g.y}
                dy="0.32em"
                textAnchor="end"
                fontSize={10}
                fill="#9ca3af"
              >
                {Math.round(g.value)}
              </text>
            </g>
          ))}
        <path d={areaD} fill={color} fillOpacity={0.1} />
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} />
        {showDots &&
          points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={3} fill="white" stroke={color} strokeWidth={2} />
            </g>
          ))}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={height - 8}
            textAnchor="middle"
            fontSize={10}
            fill="#6b7280"
          >
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

interface PieChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  size?: number;
  thickness?: number;
  showLegend?: boolean;
  formatValue?: (v: number) => string;
  className?: string;
  ariaLabel?: string;
}

const PALETTE = [
  '#2563eb',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

export function PieChart({
  data,
  size = 200,
  thickness = 40,
  showLegend = true,
  formatValue = (v) => v.toLocaleString(),
  className,
  ariaLabel = 'Pie chart',
}: PieChartProps) {
  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);
  const radius = size / 2;
  const innerRadius = radius - thickness;

  const segments = useMemo(() => {
    let cum = 0;
    return data.map((d, i) => {
      const start = (cum / total) * 360;
      cum += d.value;
      const end = (cum / total) * 360;
      return {
        ...d,
        start,
        end,
        color: d.color || PALETTE[i % PALETTE.length],
        percent: total > 0 ? (d.value / total) * 100 : 0,
      };
    });
  }, [data, total]);

  const conic = segments
    .map((s) => `${s.color} ${s.start}deg ${s.end}deg`)
    .join(', ');

  return (
    <div
      role="img"
      aria-label={`${ariaLabel}: ${data.map((d) => `${d.label} ${formatValue(d.value)} (${((d.value / (total || 1)) * 100).toFixed(1)}%)`).join(', ')}`}
      className={cn('flex flex-col items-center gap-4 sm:flex-row', className)}
    >
      <div
        className="relative shrink-0 rounded-full"
        style={{
          width: size,
          height: size,
          background:
            total > 0
              ? `conic-gradient(${conic})`
              : 'conic-gradient(#e5e7eb 0deg 360deg)',
        }}
        aria-hidden="true"
      >
        {total > 0 && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
            style={{ width: innerRadius * 2, height: innerRadius * 2 }}
          />
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-gray-500">Total</span>
          <span className="text-lg font-semibold text-gray-900">
            {formatValue(total)}
          </span>
        </div>
      </div>
      {showLegend && (
        <ul className="flex-1 space-y-1.5 text-sm w-full">
          {segments.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-sm shrink-0"
                style={{ backgroundColor: s.color }}
                aria-hidden="true"
              />
              <span className="flex-1 text-gray-700 truncate">{s.label}</span>
              <span className="text-gray-500 tabular-nums">
                {formatValue(s.value)} ({s.percent.toFixed(1)}%)
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
