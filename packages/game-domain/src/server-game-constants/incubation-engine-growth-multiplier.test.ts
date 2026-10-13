import { describe, expect, test } from "vitest";
import { INCUBATION_ENGINE_ONGOING_GROWTH_MULT, incubationEngineGrowthMultiplier } from "./server-game-constants.js";

// Regression for the 2026-08-26 decision to give the Incubation Engine
// (Incubation Engine) a flat ongoing population growth-rate multiplier on top of its
// existing one-time burst — reversing commit 7a51b06b's "instant burst
// only" removal, at a lower rate (10% vs. the old 15%). Seed Incubation Engine, which
// used to add a further buffed-radius multiplier on top of this, was
// removed from the game (Manifest/Coin rework) — incubationEngineGrowthMultiplier
// now takes just the plain-Incubation-Engine flag.
describe("incubationEngineGrowthMultiplier", () => {
  test("no Incubation Engine at all: no bonus", () => {
    expect(incubationEngineGrowthMultiplier(false)).toBe(1);
  });

  test("plain Incubation Engine: flat ongoing growth bonus", () => {
    expect(incubationEngineGrowthMultiplier(true)).toBeCloseTo(INCUBATION_ENGINE_ONGOING_GROWTH_MULT);
    expect(incubationEngineGrowthMultiplier(true)).toBeCloseTo(1.10);
  });
});
