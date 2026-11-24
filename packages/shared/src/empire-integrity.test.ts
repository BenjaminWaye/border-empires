import { describe, expect, test } from "vitest";
import {
  INTEGRITY_SHAPE_WEIGHT,
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
    // Past the new-empire grace period (100 tiles, floor fully faded):
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

  test("stays at or above 90% until 50 settled tiles, however ragged", () => {
    for (const Ts of [1, 10, 30, 50]) {
      expect(empireIntegrity(Ts, 10_000, Ts)).toBeGreaterThanOrEqual(0.9);
    }
  });

  test("the grace floor fades out smoothly after 50 tiles instead of dropping off a cliff", () => {
    expect(empireIntegrity(51, 10_000, 0)).toBeLessThan(0.9);
    expect(empireIntegrity(51, 10_000, 0)).toBeGreaterThan(0.85);
    expect(empireIntegrity(75, 10_000, 0)).toBeCloseTo(0.45, 1);
    expect(empireIntegrity(100, 10_000, 0)).toBeLessThan(0.15);
    expect(empireIntegrity(200, 10_000, 0)).toBeCloseTo(INTEGRITY_SHAPE_WEIGHT * defensibilityScore(200, 10_000), 5);
  });

  test("never lowers a score that is already above the grace floor", () => {
    expect(empireIntegrity(100, 0, 100)).toBe(1);
  });
});

// Owner rule (Playtest Run 4 follow-up): the score is mostly the shape of all owned land, plus the share of it
// that is garrisoned. The calls above pass a fully garrisoned empire, so only the shape moves them.
describe("empireIntegrity: shape and garrison share", () => {
  test("is the two parts weighted together", () => {
    expect(INTEGRITY_SHAPE_WEIGHT).toBe(0.7);
    expect(integrityParts(200, 0, 50)).toEqual({ shape: 1, garrisonShare: 0.25 });
    expect(empireIntegrity(200, 0, 50)).toBeCloseTo(0.775, 5);
  });

  test("garrisoning always raises it and never garrisoning caps it at the shape weight", () => {
    expect(empireIntegrity(200, 0, 0)).toBeCloseTo(0.7, 5);
    expect(empireIntegrity(200, 0, 100)).toBeGreaterThan(empireIntegrity(200, 0, 50));
  });

  // Regression: grace counted garrisoned tiles, so an empire that never garrisoned kept 90% forever.
  test("the new-empire floor counts all owned land, not garrisoned tiles", () => {
    expect(empireIntegrity(30, 10_000, 0)).toBeGreaterThanOrEqual(0.9);
    expect(empireIntegrity(200, 10_000, 0)).toBeLessThan(0.1);
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
