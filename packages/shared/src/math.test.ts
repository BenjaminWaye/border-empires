import { describe, expect, it } from "vitest";

import {
  SETTLED_DEFENSE_NEAR_FORT_RADIUS,
  defensibilityScore,
  fullDefensibilityExposureForTiles,
  idealExposureForTiles,
  wrappedChebyshevDistance
} from "./math.js";

describe("defensibilityScore", () => {
  it("keeps compact frontiers at full defense", () => {
    expect(defensibilityScore(20, 22)).toBe(1);
    expect(defensibilityScore(60, 40)).toBe(1);
  });

  it("exposes the same compact-frontier thresholds the client explains", () => {
    expect(idealExposureForTiles(4)).toBe(8);
    expect(fullDefensibilityExposureForTiles(4)).toBe(10);
    expect(defensibilityScore(4, 10)).toBe(1);
    expect(defensibilityScore(4, 10.5)).toBeLessThan(1);
  });

  it("still penalizes messy or overexposed territory", () => {
    expect(defensibilityScore(20, 30)).toBeLessThan(1);
    expect(defensibilityScore(20, 30)).toBeGreaterThan(0.85);
  });
});

describe("wrappedChebyshevDistance", () => {
  it("uses wrapped edges when checking fort coverage", () => {
    expect(wrappedChebyshevDistance(0, 0, 449, 449)).toBe(1);
    expect(wrappedChebyshevDistance(10, 10, 12, 11)).toBe(2);
  });

  it("keeps near-fort coverage to the immediate surrounding ring", () => {
    expect(wrappedChebyshevDistance(30, 30, 31, 31)).toBeLessThanOrEqual(SETTLED_DEFENSE_NEAR_FORT_RADIUS);
    expect(wrappedChebyshevDistance(30, 30, 32, 30)).toBeGreaterThan(SETTLED_DEFENSE_NEAR_FORT_RADIUS);
  });
});
