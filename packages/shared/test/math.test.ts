import { describe, expect, test } from "vitest";
import {
  combatWinChance,
  defensivenessMultiplier,
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
  test("clamps multiplier", () => {
    expect(defensivenessMultiplier(1, 999)).toBe(0.6);
    expect(defensivenessMultiplier(10, 1)).toBe(2.0);
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
