import { describe, expect, test } from "vitest";
import { structureShowsOnTile, type StructurePlacementType } from "./structure-placement.js";

const RESOURCE_TILE = {
  ownershipState: "SETTLED" as const,
  resource: "IRON" as const,
};

describe("structure placement metadata", () => {
  test("allows fort and siege variants on resource tiles", () => {
    for (const structureType of [
      "FORT",
      "IRON_BASTION",
      "THUNDER_BASTION",
      "SIEGE_OUTPOST",
      "SIEGE_TOWER",
      "DREAD_TOWER",
    ] satisfies StructurePlacementType[]) {
      expect(structureShowsOnTile(structureType, RESOURCE_TILE), structureType).toBe(true);
    }
  });
});
