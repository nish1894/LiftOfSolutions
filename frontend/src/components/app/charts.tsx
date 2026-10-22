import { useId } from "react";

import { cn, formatNumber } from "@/lib/utils.ts";

/* Two small SVG charts. A charting library would add ~100 KB for what these
   draw; each has a screen-reader table or label with the exact numbers. */

export interface ChartPoint {
  label: string;
  value: number;
}

/** A trend line for a metric card. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const step = 100 / (values.length - 1);
  const points = values
    .map((value, index) => `${(index * step).toFixed(2)},${(28 - (value / max) * 24).toFixed(2)}`)
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className={cn("h-8 w-20 shrink-0 text-chart-1", className)}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

interface AreaChartProps {
  data: ChartPoint[];
  label: string;
  className?: string;
}

/** An area chart with a faint grid, scaled to its own maximum. */
export function AreaChart({ data, label, className }: AreaChartProps) {
  const gradientId = useId();
  if (data.length === 0) return null;

  // A single day still draws as a flat line across the chart.
  const series = data.length === 1 ? [data[0]!, data[0]!] : data;
  const max = Math.max(1, ...series.map((point) => point.value));
  const step = 100 / (series.length - 1);
  const line = series
    .map(
      (point, index) =>
        `${(index * step).toFixed(2)},${(100 - (point.value / max) * 92).toFixed(2)}`,
    )
    .join(" ");

  return (
    <figure className={cn("grid gap-2", className)}>
      <div className="relative h-56">
        {[0, 50, 100].map((top) => (
          <div
            key={top}
            className="absolute inset-x-0 border-t border-dashed"
            style={{ top: `${top}%` }}
            aria-hidden="true"
          />
        ))}
        <span className="absolute top-1 left-0 text-xs text-muted-foreground tabular-nums">
          {formatNumber(max)}
        </span>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full text-chart-1"
          role="img"
          aria-label={label}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,100 ${line} 100,100`} fill={`url(#${gradientId})`} />
          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <figcaption className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </figcaption>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
