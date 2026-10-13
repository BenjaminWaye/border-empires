import { describe, expect, it } from "vitest";
import { defensivenessMultiplier } from "@border-empires/shared";
import { integrityPctFromSettledCounts } from "./client-integrity-pct.js";

describe("integrityPctFromSettledCounts", () => {
  it("applies the new-empire grace floor like the server, unlike the raw shape score", () => {
    // A stringy 20-tile empire: the raw score is well under 90%, but the
    // server's empireIntegrity holds it at the 90% grace floor.
    expect(defensivenessMultiplier(20, 60) * 100).toBeLessThan(90);
    expect(integrityPctFromSettledCounts(20, 60, 0)).toBeGreaterThanOrEqual(90);
  });

  it("returns the fallback when a count is missing", () => {
    expect(integrityPctFromSettledCounts(undefined, 10, 77)).toBe(77);
    expect(integrityPctFromSettledCounts(10, Number.NaN, 77)).toBe(77);
  });
});
