import { describe, expect, test } from "vitest";
import {
  INTEGRITY_MIN_GARRISON_SHARE,
  INTEGRITY_UNGARRISONED_PENALTY,
  empireIntegrity,
  integrityParts,
  integrityEconomyMult,
  integrityGrowthMult,
  defensibilityScore,
  INTEGRITY_PENALTY_PCT
} from "./index.js";

describe("empireIntegrity", () => {
  test("a perfect blob (E=0) scores 1.0", () => {
    expect(empireIntegrity(100, 0, 100)).toBeCloseTo(1.0, 5);
  });

  test("a small empire always scores 100% because actual exposure can't reach the generous full-score threshold", () => {
    // 1 tile: idealExposure=4, fullScoreThreshold=5, max possible Es=4
    expect(empireIntegrity(1, 0, 1)).toBe(1);
    expect(empireIntegrity(1, 4, 1)).toBe(1);

    // 4 tiles: idealExposure=8, fullScoreThreshold=10
    expect(empireIntegrity(4, 0, 4)).toBe(1);
    expect(empireIntegrity(4, 8, 4)).toBe(1);
  });

  test("a ragged territory with high exposure scores well below 1", () => {
    // Ts=100, Es=800: ideal=40, ratio=0.05, score=0.05/(0.2+0.04)≈0.21
    expect(integrityParts(100, 800, 100).shape).toBeLessThan(0.5);
    expect(empireIntegrity(100, 800, 0)).toBeLessThan(0.5);
  });

  test("returns values in [0,1]", () => {
    for (const [T, E] of [[0, 0], [1, 4], [100, 40], [500, 0], [1, 1000]] as [number, number][]) {
      const s = empireIntegrity(T, E, T);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  test("monotonically non-decreasing as exposure decreases (tiles fixed)", () => {
    const T = 50;
    let prev = empireIntegrity(T, 200, T);
    for (const E of [150, 100, 60, 30, 10, 0]) {
      const curr = empireIntegrity(T, E, T);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });
});

describe("integrity multipliers respond to real shape, not a fixed ~50% (the bug this replaces)", () => {
  test("a maximally sprawling empire (t=0) takes the full penalty", () => {
    expect(integrityEconomyMult(0)).toBeCloseTo(0.85, 5);
    expect(integrityGrowthMult(0)).toBeCloseTo(0.9, 5);
  });

  test("a maximally compact/garrisoned empire (t=1) gets the full bonus", () => {
    expect(integrityEconomyMult(1)).toBeCloseTo(1.15, 5);
    expect(integrityGrowthMult(1)).toBeCloseTo(1.1, 5);
  });

  test("a higher integrity value always yields higher multipliers", () => {
    expect(integrityEconomyMult(0.25)).toBeLessThan(integrityEconomyMult(0.75));
    expect(integrityGrowthMult(0.25)).toBeLessThan(integrityGrowthMult(0.75));
  });

  // Owner call 2026-11-24: no new-empire floor; a ragged small empire scores its real shape.
  test("has no new-empire floor", () => {
    expect(empireIntegrity(30, 10_000, 30)).toBeLessThan(0.1);
    expect(empireIntegrity(200, 10_000, 0)).toBeCloseTo(Math.max(0, defensibilityScore(200, 10_000) - INTEGRITY_UNGARRISONED_PENALTY), 5);
  });

  test("a perfect, fully garrisoned empire scores 1", () => {
    expect(empireIntegrity(100, 0, 100)).toBe(1);
  });
});

// Owner rule (Playtest Run 4 follow-up): Integrity is the shape of all owned land, less a penalty when under 10%
// of it is garrisoned.
describe("empireIntegrity: shape and the garrison penalty", () => {
  test("is the shape alone at 10% garrisoned or more", () => {
    expect(INTEGRITY_MIN_GARRISON_SHARE).toBe(0.1);
    expect(empireIntegrity(200, 0, 20)).toBe(1);
    expect(empireIntegrity(200, 0, 200)).toBe(1);
  });

  test("loses up to 30 points below 10% garrisoned, scaling to the full penalty at none", () => {
    expect(INTEGRITY_UNGARRISONED_PENALTY).toBe(0.3);
    expect(integrityParts(200, 0, 10)).toEqual({ shape: 1, garrisonShare: 0.05, garrisonPenalty: 0.15 });
    expect(empireIntegrity(200, 0, 10)).toBeCloseTo(0.85, 5);
    expect(empireIntegrity(200, 0, 0)).toBeCloseTo(0.7, 5);
  });

  test("a new player with only a garrisoned AFC starts at 100%", () => {
    expect(empireIntegrity(1, 4, 1)).toBe(1);
  });
});

describe("INTEGRITY_PENALTY_PCT", () => {
  test("is where the multipliers stop being a bonus and become a penalty", () => {
    const t = INTEGRITY_PENALTY_PCT / 100;
    expect(integrityEconomyMult(t)).toBeCloseTo(1, 5);
    expect(integrityGrowthMult(t)).toBeCloseTo(1, 5);
    expect(integrityEconomyMult(t - 0.01)).toBeLessThan(1);
  });
});
