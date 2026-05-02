import { describe, expect, it } from "vitest";

import { displayTownPopulationTierLabel, townNextGrowthEtaLabel, townNextPopulationMilestone } from "./client-town-growth.js";
import type { Tile } from "./client-types.js";

const makeTown = (populationTier: NonNullable<NonNullable<Tile["town"]>["populationTier"]>, population: number, growth = 100): NonNullable<Tile["town"]> => ({
  name: "Highspire",
  type: "MARKET",
  baseGoldPerMinute: 2,
  supportCurrent: 8,
  supportMax: 8,
  goldPerMinute: 12,
  cap: 300,
  isFed: true,
  population,
  maxPopulation: 10_000_000,
  populationGrowthPerMinute: growth,
  populationTier,
  connectedTownCount: 2,
  connectedTownBonus: 0.2,
  hasMarket: false,
  marketActive: false,
  hasGranary: false,
  granaryActive: false,
  hasBank: false,
  bankActive: false
});

describe("client town growth labels", () => {
  it("formats the final tier as Monumental City", () => {
    expect(displayTownPopulationTierLabel("METROPOLIS")).toBe("Monumental City");
  });

  it("uses Monumental City as the next label for great cities", () => {
    expect(townNextPopulationMilestone(makeTown("GREAT_CITY", 2_000_000))).toEqual({
      label: "Monumental City",
      targetPopulation: 5_000_000
    });
  });

  it("uses Monumental City in the growth eta text", () => {
    expect(townNextGrowthEtaLabel(makeTown("GREAT_CITY", 4_900_000, 1_000))).toContain("Monumental City");
  });
});
