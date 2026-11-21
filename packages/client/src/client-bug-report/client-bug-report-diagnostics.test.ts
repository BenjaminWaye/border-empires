import { describe, expect, it } from "vitest";
import { MAX_DIAGNOSTICS_BUNDLE_CHARS, boundedDiagnosticsBundle } from "./client-bug-report.js";

describe("boundedDiagnosticsBundle", () => {
  it("passes a normal-size diagnostics bundle through unchanged", () => {
    const bundle = { incidentId: "diag-1", state: { connection: "connecting" }, recentTileMessages: [] };
    expect(boundedDiagnosticsBundle(() => bundle)).toEqual(bundle);
  });

  it("drops the bulky tile log first when the bundle would exceed the POST budget", () => {
    const bundle = { incidentId: "diag-1", recentTileMessages: ["x".repeat(MAX_DIAGNOSTICS_BUNDLE_CHARS)] };
    const bounded = boundedDiagnosticsBundle(() => bundle);
    expect(bounded.incidentId).toBe("diag-1");
    expect(bounded).not.toHaveProperty("recentTileMessages");
    expect(bounded.truncated).toEqual(expect.objectContaining({ omitted: ["recentTileMessages"] }));
  });

  it("reports a build failure instead of throwing, so the bug report still sends", () => {
    expect(boundedDiagnosticsBundle(() => { throw new Error("boom"); })).toEqual({ error: "boom" });
  });
});
