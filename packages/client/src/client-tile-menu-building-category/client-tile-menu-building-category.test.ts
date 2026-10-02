import { describe, expect, it } from "vitest";
import type { StructurePlacementType } from "@border-empires/shared";
import { structureBuildingCategory, type BuildingCategory } from "./client-tile-menu-building-category.js";

const expectCategory = (category: BuildingCategory, types: StructurePlacementType[]): void => {
  for (const type of types) expect([type, structureBuildingCategory(type)]).toEqual([type, category]);
};

describe("structureBuildingCategory", () => {
  it("puts fort, siege, detection, and attack/defense wonder structures in Military", () => {
    expectCategory("military", [
      "FORT",
      "WOODEN_FORT",
      "SIEGE_OUTPOST",
      "AIRPORT",
      "OBSERVATORY",
      "RADAR_SYSTEM",
      "AEGIS_DOME",
      "WORLD_ENGINE_PART_1"
    ]);
  });

  it("puts resource-tile-gated structures in Resource", () => {
    expectCategory("resource", ["FARMSTEAD", "MINE", "UMBRITE_RIG"]);
  });

  // Regression: MINTWORKS is placementMode "same_tile" only so it can stack
  // several per town, but it still only shows on town/support tiles. A
  // placementMode-based rule dumped it into Infrastructure.
  it("puts support-ring-only structures in Town Support, including stacking same_tile ones like Mintworks", () => {
    expectCategory("town_support", [
      "MINTWORKS",
      "GARRISON_HALL",
      "TITANIUM_WEAPONS_FACTORY",
      "UMBRITE_WEAPONS_FACTORY",
      "CARAVANARY",
      "GRANARY",
      "CENSUS_HALL",
      "CLEARING_HOUSE",
      "RAIL_DEPOT",
      "UMBRITE_SYNTHESIZER",
      "TITANIUM_WORKS",
      "CRYSTAL_SYNTHESIZER",
      "LOGISTICS_GUILD",
      "ASSEMBLY_WORKS"
    ]);
  });

  it("puts structures buildable on any owned settled tile in Infrastructure", () => {
    expectCategory("infrastructure", ["RELAY_BEACON", "AETHER_TOWER", "WATERWORKS", "FOUNDRY", "GOVERNORS_OFFICE"]);
  });
});
