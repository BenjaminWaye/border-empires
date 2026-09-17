import { describe, expect, it } from "vitest";

import { quantile, quantileSample } from "./metrics-format.js";

describe("metrics-format quantiles", () => {
  it("quantileSample matches per-quantile results and leaves the input unsorted", () => {
    const series = [9, 1, 5, 3, 7, 2, 8, 4, 6, 10];
    const before = [...series];
    expect(quantileSample(series)).toEqual({ p50: quantile(series, 0.5), p95: quantile(series, 0.95), p99: quantile(series, 0.99) });
    expect(quantileSample(series)).toEqual({ p50: 5, p95: 10, p99: 10 });
    expect(series).toEqual(before);
  });

  it("returns zeros for an empty series", () => {
    expect(quantileSample([])).toEqual({ p50: 0, p95: 0, p99: 0 });
    expect(quantile([], 0.5)).toBe(0);
  });
});
