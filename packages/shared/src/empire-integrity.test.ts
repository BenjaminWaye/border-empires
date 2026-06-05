import { describe, expect, it } from "vitest";
import { empireIntegrity, integrityEconomyMult, integrityGrowthMult } from "./empire-integrity.js";
import {
  INTEGRITY_ECON_MIN_MULT,
  INTEGRITY_ECON_MAX_MULT,
  INTEGRITY_GROWTH_MIN_MULT,
  INTEGRITY_GROWTH_MAX_MULT
} from "./config.js";

describe("empireIntegrity", () => {
  it("returns ~1 for a solid (fully enclosed) settled territory with no exposed edges", () => {
    // E=0 → defensibilityScore returns 1.0
    expect(empireIntegrity(100, 0)).toBeCloseTo(1.0, 5);
  });

  it("returns a mid/low value for a ragged territory with high exposure", () => {
    // Very high E relative to T → low score
    const score = empireIntegrity(10, 200);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(0.5);
  });

  it("returns values in [0,1]", () => {
    for (const [t, e] of [[0, 0], [1, 4], [100, 40], [500, 0], [1, 1000]] as [number, number][]) {
      const s = empireIntegrity(t, e);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("is monotonically non-decreasing as exposure decreases (tiles fixed)", () => {
    const T = 50;
    let prev = empireIntegrity(T, 200);
    for (const E of [150, 100, 60, 30, 10, 0]) {
      const curr = empireIntegrity(T, E);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });
});

describe("integrityEconomyMult", () => {
  it("returns INTEGRITY_ECON_MIN_MULT at t=0", () => {
    expect(integrityEconomyMult(0)).toBeCloseTo(INTEGRITY_ECON_MIN_MULT, 10);
  });

  it("returns INTEGRITY_ECON_MAX_MULT at t=1", () => {
    expect(integrityEconomyMult(1)).toBeCloseTo(INTEGRITY_ECON_MAX_MULT, 10);
  });

  it("clamps below at t<0", () => {
    expect(integrityEconomyMult(-5)).toBeCloseTo(INTEGRITY_ECON_MIN_MULT, 10);
  });

  it("clamps above at t>1", () => {
    expect(integrityEconomyMult(5)).toBeCloseTo(INTEGRITY_ECON_MAX_MULT, 10);
  });

  it("is monotonically increasing", () => {
    let prev = integrityEconomyMult(0);
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9, 1.0]) {
      const curr = integrityEconomyMult(t);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });

  it("is near 1.0 at t≈0.5 (redistribution, not inflation)", () => {
    // At t=0.5, lerp(0.8, 1.25) = 1.025 — within 5% of 1.0
    const mult = integrityEconomyMult(0.5);
    expect(mult).toBeGreaterThanOrEqual(1.0);
    expect(mult).toBeLessThanOrEqual(1.05);
  });
});

describe("integrityGrowthMult", () => {
  it("returns INTEGRITY_GROWTH_MIN_MULT at t=0", () => {
    expect(integrityGrowthMult(0)).toBeCloseTo(INTEGRITY_GROWTH_MIN_MULT, 10);
  });

  it("returns INTEGRITY_GROWTH_MAX_MULT at t=1", () => {
    expect(integrityGrowthMult(1)).toBeCloseTo(INTEGRITY_GROWTH_MAX_MULT, 10);
  });

  it("clamps below at t<0", () => {
    expect(integrityGrowthMult(-1)).toBeCloseTo(INTEGRITY_GROWTH_MIN_MULT, 10);
  });

  it("clamps above at t>1", () => {
    expect(integrityGrowthMult(2)).toBeCloseTo(INTEGRITY_GROWTH_MAX_MULT, 10);
  });

  it("is monotonically increasing", () => {
    let prev = integrityGrowthMult(0);
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9, 1.0]) {
      const curr = integrityGrowthMult(t);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });

  it("is near 1.0 at t≈0.5", () => {
    // At t=0.5, lerp(0.95, 1.10) = 1.025 — within 5% of 1.0
    const mult = integrityGrowthMult(0.5);
    expect(mult).toBeGreaterThanOrEqual(1.0);
    expect(mult).toBeLessThanOrEqual(1.05);
  });

  it("growth range is strictly narrower than econ range", () => {
    const econRange = INTEGRITY_ECON_MAX_MULT - INTEGRITY_ECON_MIN_MULT;
    const growthRange = INTEGRITY_GROWTH_MAX_MULT - INTEGRITY_GROWTH_MIN_MULT;
    expect(growthRange).toBeLessThan(econRange);
  });
});
