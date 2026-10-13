import { describe, expect, test } from "vitest";
import {
  empireIntegrity,
  integrityEconomyMult,
  integrityGrowthMult,
  defensibilityScore,
  INTEGRITY_PENALTY_PCT
} from "./index.js";

describe("empireIntegrity", () => {
  test("a perfect blob (E=0) scores 1.0", () => {
    expect(empireIntegrity(100, 0)).toBeCloseTo(1.0, 5);
  });

  test("a small empire always scores 100% because actual exposure can't reach the generous full-score threshold", () => {
    // 1 tile: idealExposure=4, fullScoreThreshold=5, max possible Es=4
    expect(empireIntegrity(1, 0)).toBe(1);
    expect(empireIntegrity(1, 4)).toBe(1);

    // 4 tiles: idealExposure=8, fullScoreThreshold=10
    expect(empireIntegrity(4, 0)).toBe(1);
    expect(empireIntegrity(4, 8)).toBe(1);
  });

  test("a ragged territory with high exposure scores well below 1", () => {
    // Past the new-empire grace period (350 tiles, floor fully faded).
    const score = empireIntegrity(400, 8000);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(0.5);
  });

  test("returns values in [0,1]", () => {
    for (const [T, E] of [[0, 0], [1, 4], [100, 40], [500, 0], [1, 1000]] as [number, number][]) {
      const s = empireIntegrity(T, E);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  test("monotonically non-decreasing as exposure decreases (tiles fixed)", () => {
    const T = 50;
    let prev = empireIntegrity(T, 200);
    for (const E of [150, 100, 60, 30, 10, 0]) {
      const curr = empireIntegrity(T, E);
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

  test("stays at or above 90% until 150 settled tiles, however ragged", () => {
    for (const Ts of [1, 10, 50, 100, 150]) {
      expect(empireIntegrity(Ts, 100_000)).toBeGreaterThanOrEqual(0.9);
    }
  });

  test("never costs a new empire coin or growth before ~240 settled tiles, however ragged", () => {
    // Playtest feedback: the falling number read as punishment for
    // expanding. Below INTEGRITY_PENALTY_PCT the multipliers drop under 1x.
    for (const Ts of [1, 50, 150, 200, 238]) {
      expect(empireIntegrity(Ts, 100_000) * 100).toBeGreaterThanOrEqual(INTEGRITY_PENALTY_PCT);
      expect(integrityEconomyMult(empireIntegrity(Ts, 100_000))).toBeGreaterThanOrEqual(1);
      expect(integrityGrowthMult(empireIntegrity(Ts, 100_000))).toBeGreaterThanOrEqual(1);
    }
  });

  test("the grace floor fades out smoothly after 150 tiles instead of dropping off a cliff", () => {
    expect(empireIntegrity(151, 100_000)).toBeLessThan(0.9);
    expect(empireIntegrity(151, 100_000)).toBeGreaterThan(0.85);
    expect(empireIntegrity(250, 100_000)).toBeCloseTo(0.45, 1);
    expect(empireIntegrity(340, 100_000)).toBeLessThan(0.15);
    expect(empireIntegrity(500, 100_000)).toBeCloseTo(defensibilityScore(500, 100_000), 5);
  });

  test("never lowers a score that is already above the grace floor", () => {
    expect(empireIntegrity(100, 0)).toBe(1);
  });
});
