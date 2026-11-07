import { describe, expect, it } from "vitest";
import { afcBuildCost, afcReplacementCost } from "./afc-build-cost.js";

describe("afcBuildCost", () => {
  it("starts at 290 Coin for the second AFC and doubles for each later one", () => {
    expect(afcBuildCost(1)).toBe(290);
    expect(afcBuildCost(2)).toBe(580);
    expect(afcBuildCost(3)).toBe(1160);
  });
});

describe("global AFC replacement supply", () => {
  it("starts at 20 and adds 10 for each global loss after the first", () => {
    expect([0, 1, 2, 5, 10, 20].map(afcReplacementCost)).toEqual([20, 20, 30, 60, 110, 210]);
  });
});
