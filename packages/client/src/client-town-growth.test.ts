import { describe, expect, it } from "vitest";

import { displayTownPopulationTierLabel, shouldShowTownSmoke, townNextGrowthEtaLabel, townNextPopulationMilestone } from "./client-town-growth.js";
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

  it("explains when growth is paused because the town is unfed", () => {
    expect(townNextGrowthEtaLabel({ ...makeTown("TOWN", 18_400, 0), isFed: false }, { explainUnfed: true })).toBe("City growth paused (town is unfed)");
  });

  it("does not guess an unfed reason without ownership context", () => {
    expect(townNextGrowthEtaLabel({ ...makeTown("TOWN", 18_400, 0), isFed: false })).toBe("City growth paused");
  });

  it("explains when growth is paused because the town was recently captured", () => {
    expect(
      townNextGrowthEtaLabel({
        ...makeTown("TOWN", 18_400, 0),
        growthModifiers: [{ label: "Recently captured", deltaPerMinute: -12 }]
      })
    ).toBe("City growth paused (recently captured)");
  });

  it("explains when growth is paused by nearby war shock", () => {
    expect(
      townNextGrowthEtaLabel({
        ...makeTown("TOWN", 18_400, 12),
        growthModifiers: [{ label: "Nearby war", deltaPerMinute: -12 }]
      })
    ).toBe("City growth paused (nearby war)");
  });

  it("only shows town smoke for settled fed towns with active growth", () => {
    const tile = {
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: makeTown("TOWN", 18_400, 12)
    } satisfies Tile;

    expect(shouldShowTownSmoke(tile)).toBe(true);
    expect(shouldShowTownSmoke({ ...tile, ownershipState: "FRONTIER" })).toBe(false);
    expect(shouldShowTownSmoke({ ...tile, town: { ...tile.town, isFed: false } })).toBe(false);
    expect(shouldShowTownSmoke({ ...tile, town: { ...tile.town, populationGrowthPerMinute: 0 } })).toBe(false);
    expect(shouldShowTownSmoke({ ...tile, town: { ...tile.town, growthModifiers: [{ label: "Nearby war", deltaPerMinute: -12 }] } })).toBe(false);
  });
});
