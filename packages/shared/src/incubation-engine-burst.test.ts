import { describe, expect, it } from "vitest";
import { INCUBATION_ENGINE_INSTANT_POPULATION_BURST, SETTLEMENT_TO_TOWN_POPULATION_MIN } from "./config.js";
import { CITY_POPULATION_MIN } from "./town-growth/town-growth.js";

// Regression for the 2026-11-21 buff: the Incubation Engine's one-time
// population burst must be a serious strategic gain (half the way to CITY in
// one build), not the old 10,000 that a town regrew on its own quickly.
describe("INCUBATION_ENGINE_INSTANT_POPULATION_BURST", () => {
  it("grants 50,000 population — half of the CITY threshold", () => {
    expect(INCUBATION_ENGINE_INSTANT_POPULATION_BURST).toBe(50_000);
    expect(INCUBATION_ENGINE_INSTANT_POPULATION_BURST * 2).toBe(CITY_POPULATION_MIN);
    expect(INCUBATION_ENGINE_INSTANT_POPULATION_BURST).toBeGreaterThan(SETTLEMENT_TO_TOWN_POPULATION_MIN);
  });
});
