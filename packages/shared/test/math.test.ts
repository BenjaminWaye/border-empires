import { describe, expect, test } from "vitest";
import {
  combatWinChance,
  defensibilityScore,
  defensivenessMultiplier,
  exposureWeightFromSides,
  pvpPointsReward,
  ratingFromPointsLevel,
  underdogMultiplier,
  wrapX,
  wrapY
} from "../src/index.js";

describe("wrap", () => {
  test("wraps coordinates toroidally", () => {
    expect(wrapX(-1, 10_000)).toBe(9999);
    expect(wrapY(10_000, 10_000)).toBe(0);
  });
});

describe("defensiveness", () => {
  test("buckets exposure by exposed side count", () => {
    expect(exposureWeightFromSides(0)).toBe(0);
    expect(exposureWeightFromSides(1)).toBe(0);
    expect(exposureWeightFromSides(2)).toBe(1);
    expect(exposureWeightFromSides(3)).toBe(2.5);
    expect(exposureWeightFromSides(4)).toBe(4);
  });

  test("clamps multiplier", () => {
    expect(defensivenessMultiplier(1, 999)).toBeCloseTo(0.02, 3);
    expect(defensivenessMultiplier(10, 1)).toBe(1);
  });

  test("lifts practical mid-range shapes without maxing them out", () => {
    expect(defensibilityScore(16, 32)).toBeCloseTo(0.833, 3);
    expect(defensibilityScore(16, 16)).toBe(1);
    expect(defensibilityScore(16, 40)).toBeCloseTo(0.769, 3);
    expect(defensibilityScore(16, 64)).toBeCloseTo(0.625, 3);
  });
});

describe("pvp scaling", () => {
  test("rewards underdog more", () => {
    const weak = ratingFromPointsLevel(100, 2);
    const strong = ratingFromPointsLevel(100_000, 40);
    expect(underdogMultiplier(weak, strong)).toBeGreaterThan(1);
    expect(underdogMultiplier(strong, weak)).toBeLessThan(1);
    expect(pvpPointsReward(20, weak, strong)).toBeGreaterThan(20);
  });
});

describe("combat", () => {
  test("win chance bounded", () => {
    expect(combatWinChance(1, 1)).toBe(0.5);
    expect(combatWinChance(0, 1)).toBe(0);
    expect(combatWinChance(1, 0)).toBe(1);
  });
});
