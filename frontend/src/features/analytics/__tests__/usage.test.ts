import { describe, expect, it } from "vitest";

import type { UsageBreakdownRow } from "@/shared/types.ts";

import { averageLatency, dailySeries, percentChange, sumValues } from "../usage.ts";

const row = (key: string, model_runs: number, average_latency_ms = 0): UsageBreakdownRow => ({
  key,
  model_runs,
  average_latency_ms,
  input_tokens: 0,
  output_tokens: 0,
  cached_tokens: 0,
  estimated_cost_usd: 0,
});

describe("dailySeries", () => {
  it("fills quiet days with zero, oldest first", () => {
    const now = Date.parse("2026-09-13T12:00:00Z");
    const series = dailySeries([row("2026-09-13", 4), row("2026-09-11", 2)], 3, now);
    expect(series).toEqual([
      { label: "2026-09-11", value: 2 },
      { label: "2026-09-12", value: 0 },
      { label: "2026-09-13", value: 4 },
    ]);
    expect(sumValues(series)).toBe(6);
  });
});

describe("percentChange", () => {
  it("rounds to a whole percent", () => {
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(5, 10)).toBe(-50);
  });

  it("returns null when there is no previous value", () => {
    expect(percentChange(5, 0)).toBe(null);
  });
});

describe("averageLatency", () => {
  it("weights each day by its number of replies", () => {
    expect(averageLatency([row("a", 1, 100), row("b", 3, 200)])).toBe(175);
    expect(averageLatency([])).toBe(null);
  });
});
