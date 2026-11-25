import { describe, expect, it } from "vitest";
import { defensivenessMultiplier } from "@border-empires/shared";
import { integrityPctFromPlayerUpdate, integrityPctFromSettledCounts } from "./client-integrity-pct.js";

describe("integrityPctFromSettledCounts", () => {
  it("matches the server's score: the shape of all owned land", () => {
    expect(integrityPctFromSettledCounts(20, 60, 0, 20)).toBeCloseTo(100 * defensivenessMultiplier(20, 60), 5);
  });

  // Integrity reads all owned land and its garrisoned share: the settled counts alone can't rebuild it.
  it("keeps the last authoritative value without a garrisoned count", () => {
    expect(integrityPctFromSettledCounts(200, 0, 64)).toBe(64);
    expect(integrityPctFromSettledCounts(200, 0, 0, 0)).toBeCloseTo(70); // nothing garrisoned: the full 30-point penalty
  });

  it("returns the fallback when a count is missing", () => {
    expect(integrityPctFromSettledCounts(undefined, 10, 77)).toBe(77);
    expect(integrityPctFromSettledCounts(10, Number.NaN, 77)).toBe(77);
  });
});

describe("integrityPctFromPlayerUpdate", () => {
  it("leaves integrity alone on a partial update with no integrity data", () => {
    expect(integrityPctFromPlayerUpdate({}, 92, () => 80)).toBe(92);
  });

  it("uses the server's integrityPct, clamped, and otherwise recomputes from settled counts", () => {
    expect(integrityPctFromPlayerUpdate({ integrityPct: 73 }, 92, () => 80)).toBe(73);
    expect(integrityPctFromPlayerUpdate({ integrityPct: 140 }, 92, () => 80)).toBe(100);
    expect(integrityPctFromPlayerUpdate({ Ts: 20, Es: 60 }, 92, () => 91)).toBe(91);
  });
});
