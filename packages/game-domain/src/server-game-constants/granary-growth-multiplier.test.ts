import { describe, expect, test } from "vitest";
import { GRANARY_ONGOING_GROWTH_MULT, SEED_GRANARY_GROWTH_MULT, granaryGrowthMultiplier } from "./server-game-constants.js";

// Regression for the 2026-08-26 decision to give the Incubation Engine
// (Granary) a flat ongoing population growth-rate multiplier on top of its
// existing one-time burst — reversing commit 7a51b06b's "instant burst
// only" removal, at a lower rate (10% vs. the old 15%).
describe("granaryGrowthMultiplier", () => {
  test("no Granary at all: no bonus", () => {
    expect(granaryGrowthMultiplier(false, false)).toBe(1);
  });

  test("plain Granary, no Seed Granary buff: flat ongoing growth bonus", () => {
    expect(granaryGrowthMultiplier(true, false)).toBeCloseTo(GRANARY_ONGOING_GROWTH_MULT);
    expect(granaryGrowthMultiplier(true, false)).toBeCloseTo(1.10);
  });

  test("Granary/Seed Granary buffed radius: stacks multiplicatively with the base ongoing bonus", () => {
    expect(granaryGrowthMultiplier(true, true)).toBeCloseTo(GRANARY_ONGOING_GROWTH_MULT * SEED_GRANARY_GROWTH_MULT);
    expect(granaryGrowthMultiplier(true, true)).toBeCloseTo(1.43);
  });

  test("seedGranaryBuffed=true without any Granary is impossible per caller contract, but must not fabricate a bonus", () => {
    expect(granaryGrowthMultiplier(false, true)).toBe(1);
  });
});
