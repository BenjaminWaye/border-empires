import { describe, expect, it } from "vitest";
import { FORT_TIER_LADDER, structureBuildDurationMsForManpowerCost } from "@border-empires/shared";

import { writeOptimisticStructureBuild, writeOptimisticStructureCancel } from "./client-optimistic-structure-writes.js";
import type { Tile } from "../client-types.js";
import { constructionSiteForTile } from "../client-construction-phase/client-construction-phase.js";

const techs = (...ids: string[]) => (id: string) => ids.includes(id);
const beacon = { ownerId: "me", type: "RELAY_BEACON" as const, status: "active" as const };
const tierMs = (variant: keyof typeof FORT_TIER_LADDER): number => structureBuildDurationMsForManpowerCost(FORT_TIER_LADDER[variant].manpower);
const baseTile = (): Tile => ({ x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });

describe("writeOptimisticStructureBuild", () => {
  it("puts a pending Palisade in the fort slot, leaving a Relay Beacon on the tile untouched", () => {
    const tile: Tile = { ...baseTile(), economicStructure: beacon };
    writeOptimisticStructureBuild(tile, "WOODEN_FORT", "me", techs(), 5_000, 1_000);

    expect(tile.fort).toEqual({ ownerId: "me", status: "under_construction", variant: "WOODEN_FORT", startedAt: 1_000, completesAt: 1_000 + tierMs("WOODEN_FORT") });
    expect(tile.economicStructure).toEqual(beacon);
  });

  it("doesn't write a Palisade onto a tile that already has a fortification", () => {
    const tile: Tile = { ...baseTile(), fort: { ownerId: "me", status: "active", variant: "FORT" } };
    writeOptimisticStructureBuild(tile, "WOODEN_FORT", "me", techs(), 5_000, 1_000);

    expect(tile.fort).toEqual({ ownerId: "me", status: "active", variant: "FORT" });
  });

  it("upgrades a Palisade to the best tier the tech allows and keeps it standing meanwhile", () => {
    const tile: Tile = { ...baseTile(), fort: { ownerId: "me", status: "active", variant: "WOODEN_FORT" } };
    writeOptimisticStructureBuild(tile, "FORT", "me", techs("masonry", "fortified-walls"), 5_000, 1_000);

    expect(tile.fort).toEqual({ ownerId: "me", status: "under_construction", variant: "TITANIUM_BASTION", startedAt: 1_000, completesAt: 1_000 + tierMs("TITANIUM_BASTION"), upgradingFrom: "WOODEN_FORT" });
  });

  // Regression: without startedAt the renderers guessed the window from the base Fort's duration,
  // so a quicker tier (a Palisade) showed up part-built the moment it was placed.
  it("stamps startedAt so a fresh optimistic build renders at phase 0", () => {
    const tile: Tile = baseTile();
    writeOptimisticStructureBuild(tile, "WOODEN_FORT", "me", techs(), 5_000, 1_000);

    expect(constructionSiteForTile(tile, 1_000, "fort")).toMatchObject({ fraction: 0, phase: 0, visibleBands: 1 });
  });

  it("stamps startedAt on economic structures too", () => {
    const tile: Tile = baseTile();
    writeOptimisticStructureBuild(tile, "RELAY_BEACON", "me", techs(), 9_000, 1_000);

    expect(tile.economicStructure).toMatchObject({ startedAt: 1_000, completesAt: 9_000 });
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
