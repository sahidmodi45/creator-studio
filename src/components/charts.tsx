"use client";

import { useState } from "react";
import { formatCount, formatDayShort } from "@/lib/format";

/** A single series never needs a legend: the card title names it. Validated against the page surface. */
const MARK = "var(--chart-mark)";

function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * magnitude) return step * magnitude;
  return 10 * magnitude;
}

/** Change over time: one 2px line, recessive grid, a crosshair and tooltip on hover. */
export function LineChart({ points, label }: { points: { date: string; value: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 480;
  const height = 210;
  const margin = { top: 12, right: 12, bottom: 24, left: 52 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  // Follower counts sit far from zero, so the axis frames the range and the labels make that plain.
  const pad = Math.max(1, (high - low) * 0.2);
  const min = Math.max(0, low - pad);
  const max = high + pad;
  const x = (index: number) => margin.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (value: number) => margin.top + innerH - ((value - min) / (max - min || 1)) * innerH;
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const ticks = [min, (min + max) / 2, max];

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={`${label}: from ${formatCount(values[0])} to ${formatCount(values[values.length - 1])}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const position = ((event.clientX - box.left) / box.width) * width;
          let nearest = 0;
          points.forEach((_, index) => {
            if (Math.abs(x(index) - position) < Math.abs(x(nearest) - position)) nearest = index;
          });
          setHover(nearest);
        }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke="var(--rule)" strokeWidth={1} />
            <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">{formatCount(Math.round(tick))}</text>
          </g>
        ))}
        <text x={x(0)} y={height - 6} fontSize={11} fill="var(--ink-3)" textAnchor={points.length === 1 ? "middle" : "start"}>{formatDayShort(points[0].date)}</text>
        {points.length > 1 && (
          <text x={x(points.length - 1)} y={height - 6} fontSize={11} fill="var(--ink-3)" textAnchor="end">{formatDayShort(points[points.length - 1].date)}</text>
        )}
        <path d={path} fill="none" stroke={MARK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, index) => (
          <circle key={point.date} cx={x(index)} cy={y(point.value)} r={hover === index ? 5 : 4} fill={MARK} stroke="var(--paper)" strokeWidth={2} />
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={margin.top} y2={margin.top + innerH} stroke="var(--rule-strong)" strokeWidth={1} />}
      </svg>
      {hover != null && (
        <div
          className="chart-tooltip"
          style={{ left: `${(x(hover) / width) * 100}%`, top: `${(y(points[hover].value) / height) * 100}%` }}
          role="status"
        >
          <b>{formatCount(points[hover].value)}</b> {label.toLowerCase()} · {formatDayShort(points[hover].date)}
        </div>
      )}
    </div>
  );
}

/** Comparing a few categories: thin horizontal bars from a shared zero, value written beside each. */
export function BarChart({ rows, unit }: { rows: { label: string; value: number }[]; unit: string }) {
  const max = niceMax(Math.max(...rows.map((row) => row.value), 0));
  return (
    <div className="bar-chart" role="list">
      {rows.map((row) => (
        <div key={row.label} className="bar-row" role="listitem" title={`${row.label}: ${formatCount(row.value)} ${unit}`}>
          <span className="bar-label">{row.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(row.value / max) * 100}%` }} />
          </span>
          <span className="bar-value">{formatCount(row.value)}</span>
        </div>
      ))}
    </div>
  );
}
