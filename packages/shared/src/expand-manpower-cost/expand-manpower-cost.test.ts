import { describe, expect, it } from "vitest";
import { EXPAND_MANPOWER_COST } from "../config.js";
import { EXPAND_MANPOWER_COST_ANCHORS, expandManpowerCostForFrontierCount } from "./expand-manpower-cost.js";

describe("expandManpowerCostForFrontierCount", () => {
  it("charges the flat base cost below 100 frontier tiles", () => {
    expect(expandManpowerCostForFrontierCount(0)).toBe(EXPAND_MANPOWER_COST);
    expect(expandManpowerCostForFrontierCount(99)).toBe(EXPAND_MANPOWER_COST);
  });

  it("hits every anchor exactly", () => {
    for (const [frontierTiles, manpower] of EXPAND_MANPOWER_COST_ANCHORS) {
      expect(expandManpowerCostForFrontierCount(frontierTiles)).toBe(manpower);
    }
  });

  it("matches the agreed tiers", () => {
    expect(expandManpowerCostForFrontierCount(149)).toBe(11);
    expect(expandManpowerCostForFrontierCount(174)).toBe(12);
    expect(expandManpowerCostForFrontierCount(200)).toBe(15);
    expect(expandManpowerCostForFrontierCount(1_000)).toBe(50);
    expect(expandManpowerCostForFrontierCount(2_000)).toBe(100);
  });

  it("keeps climbing past the last anchor at the last slope", () => {
    expect(expandManpowerCostForFrontierCount(2_758)).toBe(137);
  });

  it("never decreases as frontier grows", () => {
    let previous = expandManpowerCostForFrontierCount(0);
    for (let count = 1; count <= 3_000; count += 1) {
      const cost = expandManpowerCostForFrontierCount(count);
      expect(cost).toBeGreaterThanOrEqual(previous);
      previous = cost;
    }
  });

  it("treats invalid counts as no frontier", () => {
    expect(expandManpowerCostForFrontierCount(Number.NaN)).toBe(EXPAND_MANPOWER_COST);
    expect(expandManpowerCostForFrontierCount(-5)).toBe(EXPAND_MANPOWER_COST);
  });
});
