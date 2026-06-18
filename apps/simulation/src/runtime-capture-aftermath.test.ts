import { describe, expect, it } from "vitest";
import { capturedTownAftermath } from "./runtime-capture-aftermath.js";
import { TOWN_CAPTURE_POPULATION_LOSS_MULT, TOWN_CAPTURE_SHOCK_MS } from "./runtime-structure-rules/runtime-structure-rules.js";

describe("captured town aftermath", () => {
  it("evacuates captured settlements and returns relocation population", () => {
    const result = capturedTownAftermath(
      { type: "FARMING", populationTier: "SETTLEMENT", population: 100 },
      "defender",
      "attacker",
      1_000
    );

    expect(result.town).toBeUndefined();
    expect(result.settlementRelocationPopulation).toBeCloseTo(100 * TOWN_CAPTURE_POPULATION_LOSS_MULT, 5);
  });

  it("keeps non-settlement towns on the captured tile with capture shock", () => {
    const result = capturedTownAftermath(
      { type: "FARMING", populationTier: "CITY", population: 1_000 },
      "defender",
      "attacker",
      2_000
    );

    expect(result.settlementRelocationPopulation).toBeUndefined();
    expect(result.town).toMatchObject({
      populationTier: "CITY",
      population: 1_000 * TOWN_CAPTURE_POPULATION_LOSS_MULT,
      populationBeforeCapture: 1_000,
      captureShockUntil: 2_000 + TOWN_CAPTURE_SHOCK_MS
    });
  });

  it("leaves own-town captures unchanged", () => {
    const town = { type: "FARMING" as const, populationTier: "CITY" as const, population: 1_000 };
    expect(capturedTownAftermath(town, "attacker", "attacker", 2_000)).toEqual({
      town,
      settlementRelocationPopulation: undefined
    });
  });
});
