import { describe, expect, it } from "vitest";
import { addUsage, describeUsage, emptyUsage, estimateCostUsd } from "./usage.js";

describe("usage accounting", () => {
  it("sums calls and treats missing cache fields as zero", () => {
    let totals = emptyUsage();
    totals = addUsage(totals, { input_tokens: 8_000, output_tokens: 100, cache_creation_input_tokens: 4_500 });
    totals = addUsage(totals, { input_tokens: 8_000, output_tokens: 120, cache_read_input_tokens: 4_500, cache_creation_input_tokens: null });
    expect(totals).toEqual({ calls: 2, inputTokens: 16_000, outputTokens: 220, cacheReadTokens: 4_500, cacheWriteTokens: 4_500 });
  });

  it("prices cache reads at 0.1x and cache writes at 1.25x of Haiku 4.5 input", () => {
    const totals = { calls: 1, inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 };
    expect(estimateCostUsd(totals)).toBeCloseTo(1 + 0.1 + 1.25 + 5, 6);
  });

  it("warns when several calls produced no cache hits at all", () => {
    let totals = emptyUsage();
    totals = addUsage(totals, { input_tokens: 12_000, output_tokens: 100 });
    expect(describeUsage(totals)).not.toContain("NO cache hits");
    totals = addUsage(totals, { input_tokens: 12_000, output_tokens: 100 });
    expect(describeUsage(totals)).toContain("NO cache hits");
  });
});
