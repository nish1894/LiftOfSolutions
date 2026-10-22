import type { ChartPoint } from "@/components/app/charts.tsx";
import type { UsageBreakdownRow } from "@/shared/types.ts";

const DAY = 86_400_000;

/**
 * AI replies per calendar day for the last `days` days, oldest first. Days
 * without activity count as zero, so charts don't skip quiet days.
 */
export function dailySeries(
  rows: UsageBreakdownRow[],
  days: number,
  now = Date.now(),
): ChartPoint[] {
  const byDay = new Map(rows.map((row) => [row.key, row.model_runs]));
  return Array.from({ length: days }, (_, index) => {
    const label = new Date(now - (days - 1 - index) * DAY).toISOString().slice(0, 10);
    return { label, value: byDay.get(label) ?? 0 };
  });
}

/** Whole-number percent change, or null when there's nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export const sumValues = (points: ChartPoint[]) =>
  points.reduce((total, point) => total + point.value, 0);

/** Average AI response time across all replies, weighted by reply count. */
export function averageLatency(rows: UsageBreakdownRow[]): number | null {
  const runs = rows.reduce((total, row) => total + row.model_runs, 0);
  if (!runs) return null;
  const weighted = rows.reduce((total, row) => total + row.average_latency_ms * row.model_runs, 0);
  return weighted / runs;
}
