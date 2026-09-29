import { describe, expect, test } from "vitest";
import { GRANARY_ONGOING_GROWTH_MULT, granaryGrowthMultiplier } from "./server-game-constants.js";

// Regression for the 2026-08-26 decision to give the Incubation Engine
// (Granary) a flat ongoing population growth-rate multiplier on top of its
// existing one-time burst — reversing commit 7a51b06b's "instant burst
// only" removal, at a lower rate (10% vs. the old 15%). Seed Granary, which
// used to add a further buffed-radius multiplier on top of this, was
// removed from the game (Manifest/Coin rework) — granaryGrowthMultiplier
// now takes just the plain-Granary flag.
describe("granaryGrowthMultiplier", () => {
  test("no Granary at all: no bonus", () => {
    expect(granaryGrowthMultiplier(false)).toBe(1);
  });

  test("plain Granary: flat ongoing growth bonus", () => {
    expect(granaryGrowthMultiplier(true)).toBeCloseTo(GRANARY_ONGOING_GROWTH_MULT);
    expect(granaryGrowthMultiplier(true)).toBeCloseTo(1.10);
  });
});
