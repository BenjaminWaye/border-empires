import { describe, expect, test } from "vitest";
import { structureShowsOnTile, type StructurePlacementType } from "./structure-placement.js";

const RESOURCE_TILE = {
  ownershipState: "SETTLED" as const,
  resource: "TITANIUM" as const,
};

const BARE_FRONTIER_TILE = {
  ownershipState: "FRONTIER" as const,
};

describe("structure placement metadata", () => {
  test("allows fort and siege variants on resource tiles", () => {
    for (const structureType of [
      "FORT",
      "TITANIUM_BASTION",
      "THUNDER_BASTION",
      "SIEGE_BATTERY",
      "SIEGE_TOWER",
      "DREAD_TOWER",
    ] satisfies StructurePlacementType[]) {
      expect(structureShowsOnTile(structureType, RESOURCE_TILE), structureType).toBe(true);
    }
  });

  test("allows siege variants on bare frontier tiles (owned, unsettled, no resource/town/dock)", () => {
    for (const structureType of [
      "SIEGE_BATTERY",
      "SIEGE_TOWER",
      "DREAD_TOWER",
    ] satisfies StructurePlacementType[]) {
      expect(structureShowsOnTile(structureType, BARE_FRONTIER_TILE), structureType).toBe(true);
    }
  });

  test("does not allow fort or observatory on bare frontier tiles", () => {
    for (const structureType of ["FORT", "OBSERVATORY"] satisfies StructurePlacementType[]) {
      expect(structureShowsOnTile(structureType, BARE_FRONTIER_TILE), structureType).toBe(false);
    }
  });

  test("allows Hydrogarden on a FARM tile but not a FISH tile (§5.3: Hydrogarden has no effect on fish production)", () => {
    expect(structureShowsOnTile("HYDROGARDEN", { ownershipState: "SETTLED", resource: "FARM" })).toBe(true);
    expect(structureShowsOnTile("HYDROGARDEN", { ownershipState: "SETTLED", resource: "FISH" })).toBe(false);
  });

  test("Farm Plots go only on a plain town support tile, never a resource tile or the open map", () => {
    const support = { ownershipState: "SETTLED" as const, supportedTownCount: 1 };
    for (const structureType of ["FARM_PLOT", "HYDROGARDEN_PLOT"] satisfies StructurePlacementType[]) {
      expect(structureShowsOnTile(structureType, support), structureType).toBe(true);
      expect(structureShowsOnTile(structureType, { ...support, resource: "FARM" }), structureType).toBe(false);
      expect(structureShowsOnTile(structureType, { ownershipState: "SETTLED" }), structureType).toBe(false);
    }
  });
});
