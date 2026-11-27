import { describe, expect, it } from "vitest";
import { afcBuildCost, afcReplacementCost } from "./afc-build-cost.js";

describe("afcBuildCost", () => {
  it("starts at 290 Coin for the second AFC and doubles for each later one", () => {
    expect(afcBuildCost(1)).toBe(290);
    expect(afcBuildCost(2)).toBe(580);
    expect(afcBuildCost(3)).toBe(1160);
  });
});

describe("AFC replacement price", () => {
  it("is one flat 20 Coin, however many AFCs have been lost on the planet", () => {
    expect(afcReplacementCost()).toBe(20);
  });
});
