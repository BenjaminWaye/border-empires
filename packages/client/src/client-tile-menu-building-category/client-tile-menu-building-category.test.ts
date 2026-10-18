import { describe, expect, it } from "vitest";
import type { StructurePlacementType } from "@border-empires/shared";
import { structureBuildingCategory, type BuildingCategory } from "./client-tile-menu-building-category.js";

const expectCategory = (category: BuildingCategory, types: StructurePlacementType[]): void => {
  for (const type of types) expect([type, structureBuildingCategory(type)]).toEqual([type, category]);
};

describe("structureBuildingCategory", () => {
  it("puts fort, siege, bombardment and detection structures in Military", () => {
    expectCategory("military", [
      "FORT",
      "PALISADE",
      "SIEGE_BATTERY",
      "SKY_DOCK",
      "OBSERVATORY",
      "RESONANCE_GRID"
    ]);
  });

  it("puts every monument and each of its components in Monuments", () => {
    expectCategory("monument", [
      "IMPERIAL_EXCHANGE",
      "IMPERIAL_EXCHANGE_PART_2",
      "SOVEREIGN_SIEGE_ENGINE",
      "SOVEREIGN_SIEGE_ENGINE_PART_1",
      "AEGIS_DOME_PART_3",
      "ASTRAL_DOCK",
      "CENSUS_DIRECTORATE_PART_1",
      "TITANIUM_LEVY",
      "TITANIUM_LEVY_PART_3"
    ]);
  });

  it("puts resource-tile-gated structures in Resource", () => {
    expectCategory("resource", ["HYDROGARDEN", "MINE", "UMBRITE_RIG"]);
  });

  // Regression: MANUFACTORY is placementMode "same_tile" only so it can stack
  // several per town, but it still only shows on town/support tiles. A
  // placementMode-based rule dumped it into Infrastructure.
  it("puts support-ring-only structures in Town Support, including stacking same_tile ones like Manufactory", () => {
    expectCategory("town_support", [
      "MANUFACTORY",
      "ANCILLARY_DEPOT",
      "TITANIUM_WEAPONS_FACTORY",
      "UMBRITE_WEAPONS_FACTORY",
      "TRADE_NEXUS",
      "INCUBATION_ENGINE",
      "CENSUS_HALL",
      "CLEARING_HOUSE",
      "NEURAL_WORKS",
      "UMBRITE_WORKS",
      "TITANIUM_WORKS",
      "AETHER_CONDENSER",
      "ANCILLARY_FACTORY",
      "RESERVE_LATTICE"
    ]);
  });

  it("puts structures buildable on any owned settled tile in Infrastructure", () => {
    expectCategory("infrastructure", ["RELAY_BEACON", "AMBARIC_TRANSFORMER", "HYDROWORKS", "ORE_REFINERY", "MINISTRY_HALL"]);
  });
});
