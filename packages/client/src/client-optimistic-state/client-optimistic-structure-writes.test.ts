import { describe, expect, it } from "vitest";

import { writeOptimisticStructureBuild, writeOptimisticStructureCancel } from "./client-optimistic-structure-writes.js";
import type { Tile } from "../client-types.js";

const techs = (...ids: string[]) => (id: string) => ids.includes(id);
const beacon = { ownerId: "me", type: "RELAY_BEACON" as const, status: "active" as const };
const baseTile = (): Tile => ({ x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });

describe("writeOptimisticStructureBuild", () => {
  it("puts a pending Palisade in the fort slot, leaving a Relay Beacon on the tile untouched", () => {
    const tile: Tile = { ...baseTile(), economicStructure: beacon };
    writeOptimisticStructureBuild(tile, "WOODEN_FORT", "me", techs(), 5_000);

    expect(tile.fort).toEqual({ ownerId: "me", status: "under_construction", variant: "WOODEN_FORT", completesAt: 5_000 });
    expect(tile.economicStructure).toEqual(beacon);
  });

  it("doesn't write a Palisade onto a tile that already has a fortification", () => {
    const tile: Tile = { ...baseTile(), fort: { ownerId: "me", status: "active", variant: "FORT" } };
    writeOptimisticStructureBuild(tile, "WOODEN_FORT", "me", techs(), 5_000);

    expect(tile.fort).toEqual({ ownerId: "me", status: "active", variant: "FORT" });
  });

  it("upgrades a Palisade to the best tier the tech allows and keeps it standing meanwhile", () => {
    const tile: Tile = { ...baseTile(), fort: { ownerId: "me", status: "active", variant: "WOODEN_FORT" } };
    writeOptimisticStructureBuild(tile, "FORT", "me", techs("masonry", "fortified-walls"), 5_000);

    expect(tile.fort).toEqual({ ownerId: "me", status: "under_construction", variant: "TITANIUM_BASTION", completesAt: 5_000, upgradingFrom: "WOODEN_FORT" });
  });
});

describe("writeOptimisticStructureCancel", () => {
  it("cancelling an upgrade restores the standing fort and keeps a stacked beacon", () => {
    const tile: Tile = {
      ...baseTile(),
      fort: { ownerId: "me", status: "under_construction", variant: "FORT", upgradingFrom: "WOODEN_FORT", completesAt: 5_000 },
      economicStructure: beacon
    };
    writeOptimisticStructureCancel(tile);

    expect(tile.fort).toEqual({ ownerId: "me", status: "active", variant: "WOODEN_FORT" });
    expect(tile.economicStructure).toEqual(beacon);
  });

  it("cancelling a fresh fort build clears only the fort", () => {
    const tile: Tile = { ...baseTile(), fort: { ownerId: "me", status: "under_construction", variant: "FORT", completesAt: 5_000 }, economicStructure: beacon };
    writeOptimisticStructureCancel(tile);

    expect(tile.fort).toBeUndefined();
    expect(tile.economicStructure).toEqual(beacon);
  });

  it("cancelling a removal restores the structure as active", () => {
    const tile: Tile = { ...baseTile(), economicStructure: { ...beacon, status: "removing", completesAt: 5_000 } };
    writeOptimisticStructureCancel(tile);

    expect(tile.economicStructure).toEqual(beacon);
  });
});
