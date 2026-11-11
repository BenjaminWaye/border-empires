import { describe, expect, it } from "vitest";
import { boundedContextString, normalizeBugReportClientEvents } from "./bug-report-client-events.js";

describe("normalizeBugReportClientEvents", () => {
  it("drops malformed entries that would make email formatting throw", () => {
    const raw = [
      null,
      "string",
      { at: "x", level: "warn", event: "e", payload: {} },
      { at: Number.NaN, level: "warn", event: "e", payload: {} },
      { at: 1e20, level: "warn", event: "e", payload: {} },
      { at: 1, level: 3, event: "e", payload: {} },
      { at: 1, level: "warn", event: "e", payload: null },
      { at: 1, level: "warn", event: "e", payload: [] },
      { at: 5, level: "error", event: "ok", payload: { a: 1 } }
    ];
    expect(normalizeBugReportClientEvents(raw)).toEqual([{ at: 5, level: "error", scope: "", event: "ok", payload: { a: 1 } }]);
  });

  it("returns [] for non-arrays and keeps only the last 100 entries", () => {
    expect(normalizeBugReportClientEvents({ length: 3 })).toEqual([]);
    const many = Array.from({ length: 150 }, (_, i) => ({ at: i, level: "info", scope: "s", event: "e", payload: {} }));
    const kept = normalizeBugReportClientEvents(many);
    expect(kept).toHaveLength(100);
    expect(kept[0]?.at).toBe(50);
  });
});

describe("boundedContextString", () => {
  it("returns only strings, truncated", () => {
    expect(boundedContextString({ sha: { nested: true } }, "sha")).toBeUndefined();
    expect(boundedContextString({ sha: "a".repeat(500) }, "sha")).toHaveLength(200);
  });
});
