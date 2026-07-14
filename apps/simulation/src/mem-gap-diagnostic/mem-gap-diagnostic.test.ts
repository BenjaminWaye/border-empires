import { describe, expect, it } from "vitest";

import {
  computeRssHeapGapMb,
  createRssHeapGapMonitor,
  DEFAULT_RSS_HEAP_GAP_WARN_MB,
  shouldWarnRssHeapGap
} from "./mem-gap-diagnostic.js";

const MB = 1024 * 1024;

describe("computeRssHeapGapMb", () => {
  it("computes the gap between rss and heapTotal in MB", () => {
    expect(computeRssHeapGapMb({ rss: 531 * MB, heapTotal: 67 * MB })).toBeCloseTo(464, 0);
  });

  it("clamps to zero when heapTotal exceeds rss", () => {
    expect(computeRssHeapGapMb({ rss: 50 * MB, heapTotal: 100 * MB })).toBe(0);
  });
});

describe("shouldWarnRssHeapGap", () => {
  it("warns when the gap meets or exceeds the default threshold", () => {
    expect(shouldWarnRssHeapGap(DEFAULT_RSS_HEAP_GAP_WARN_MB)).toBe(true);
    expect(shouldWarnRssHeapGap(DEFAULT_RSS_HEAP_GAP_WARN_MB - 1)).toBe(false);
  });

  it("respects a custom threshold and treats 0/negative as disabled", () => {
    expect(shouldWarnRssHeapGap(150, 100)).toBe(true);
    expect(shouldWarnRssHeapGap(150, 0)).toBe(false);
    expect(shouldWarnRssHeapGap(150, -10)).toBe(false);
  });
});

describe("createRssHeapGapMonitor", () => {
  const highGapMemory = { rss: 531 * MB, heapTotal: 67 * MB };
  const lowGapMemory = { rss: 100 * MB, heapTotal: 90 * MB };

  it("warns on the first sample that crosses the threshold, then suppresses re-warns within the cooldown", () => {
    let nowMs = 0;
    const monitor = createRssHeapGapMonitor({ cooldownMs: 60_000, now: () => nowMs });

    expect(monitor.check(highGapMemory).shouldWarn).toBe(true);
    nowMs += 1_000;
    expect(monitor.check(highGapMemory).shouldWarn).toBe(false);
    nowMs += 30_000;
    expect(monitor.check(highGapMemory).shouldWarn).toBe(false);
  });

  it("warns again once the cooldown window has elapsed", () => {
    let nowMs = 0;
    const monitor = createRssHeapGapMonitor({ cooldownMs: 60_000, now: () => nowMs });
    expect(monitor.check(highGapMemory).shouldWarn).toBe(true);
    nowMs += 60_000;
    expect(monitor.check(highGapMemory).shouldWarn).toBe(true);
  });

  it("never warns while the gap stays under the threshold", () => {
    const monitor = createRssHeapGapMonitor({ cooldownMs: 0 });
    expect(monitor.check(lowGapMemory).shouldWarn).toBe(false);
    expect(monitor.check(lowGapMemory).shouldWarn).toBe(false);
  });

  it("always reports the current gap regardless of cooldown suppression", () => {
    let nowMs = 0;
    const monitor = createRssHeapGapMonitor({ cooldownMs: 60_000, now: () => nowMs });
    monitor.check(highGapMemory);
    nowMs += 1_000;
    const result = monitor.check(highGapMemory);
    expect(result.shouldWarn).toBe(false);
    expect(result.gapMb).toBeCloseTo(464, 0);
  });
});
