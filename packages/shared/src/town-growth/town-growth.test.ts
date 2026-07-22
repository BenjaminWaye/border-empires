import { describe, expect, it } from "vitest";

import { capTownPopulationTier, initialTownGrowthTierCap, nextTownGrowthUpgrade, townPopulationTierFromPopulation } from "./town-growth.js";

describe("town growth", () => {
  it("keeps higher population bands locked behind the purchased growth cap", () => {
    expect(townPopulationTierFromPopulation(250_000, 10_000)).toBe("CITY");
    expect(capTownPopulationTier("CITY", "TOWN")).toBe("TOWN");
    expect(capTownPopulationTier("GREAT_CITY", "CITY")).toBe("CITY");
  });

  it("initializes fresh settlements without downgrading legacy founded cities", () => {
    expect(initialTownGrowthTierCap(3_500, 10_000, true)).toBe("TOWN");
    expect(initialTownGrowthTierCap(50_000, 10_000, true)).toBe("TOWN");
    expect(initialTownGrowthTierCap(150_000, 10_000, true)).toBe("CITY");
    expect(initialTownGrowthTierCap(150_000, 10_000)).toBe("CITY");
  });

  it("surfaces a free settlement-to-town upgrade regardless of population", () => {
    expect(nextTownGrowthUpgrade("SETTLEMENT", 500)).toEqual({
      targetTier: "TOWN",
      requiredPopulation: 0,
      foodCost: 0,
      available: true
    });
  });

  it("surfaces the next manual growth step for towns and cities", () => {
    expect(nextTownGrowthUpgrade("TOWN", 120_000)).toEqual({
      targetTier: "CITY",
      requiredPopulation: 100_000,
      foodCost: 500,
      available: true
    });
    expect(nextTownGrowthUpgrade("CITY", 500_000)).toEqual({
      targetTier: "GREAT_CITY",
      requiredPopulation: 1_000_000,
      foodCost: 2_000,
      available: false
    });
    expect(nextTownGrowthUpgrade("GREAT_CITY", 6_000_000)).toEqual({
      targetTier: "METROPOLIS",
      requiredPopulation: 5_000_000,
      foodCost: 8_000,
      available: true
    });
    expect(nextTownGrowthUpgrade("METROPOLIS", 6_000_000)).toBeUndefined();
  });
});
