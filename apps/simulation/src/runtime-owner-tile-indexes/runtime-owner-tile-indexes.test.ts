import type { DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";

import { RuntimeOwnerTileIndexes } from "./runtime-owner-tile-indexes.js";

const tile = (overrides: Partial<DomainTileState>): DomainTileState => ({ x: 0, y: 0, terrain: "LAND", ...overrides });

describe("RuntimeOwnerTileIndexes boot seeding", () => {
  it("indexes non-barbarian frontier tiles by owner", () => {
    const indexes = new RuntimeOwnerTileIndexes();
    indexes.seedFromBootTile("1,1", tile({ ownerId: "p1", ownershipState: "FRONTIER" }));
    indexes.seedFromBootTile("2,2", tile({ ownerId: "barbarian-1", ownershipState: "FRONTIER" }));
    indexes.seedFromBootTile("3,3", tile({ ownerId: "p1", ownershipState: "SETTLED" }));
    expect([...indexes.frontierTilesByOwner]).toEqual([["p1", new Set(["1,1"])]]);
  });

  it("indexes musters and active manpower buildings by their own owner", () => {
    const indexes = new RuntimeOwnerTileIndexes();
    indexes.seedMusterAndManpowerStructuresFromBootTile(
      "1,1",
      tile({ ownerId: "p1", muster: { ownerId: "p1", amount: 5, mode: "HOLD", updatedAt: 0 }, economicStructure: { ownerId: "p1", type: "NEURAL_WORKS", status: "active" } })
    );
    indexes.seedMusterAndManpowerStructuresFromBootTile("2,2", tile({ ownerId: "p2", economicStructure: { ownerId: "p2", type: "CENSUS_HALL", status: "active" } }));
    indexes.seedMusterAndManpowerStructuresFromBootTile("3,3", tile({ ownerId: "p2", economicStructure: { ownerId: "p2", type: "ANCILLARY_DEPOT", status: "under_construction" } }));
    expect(indexes.musterTilesByOwner.get("p1")).toEqual(new Set(["1,1"]));
    expect(indexes.neuralWorksTilesByOwner.get("p1")).toEqual(new Set(["1,1"]));
    expect(indexes.censusHallTilesByOwner.get("p2")).toEqual(new Set(["2,2"]));
    expect(indexes.ancillaryDepotTilesByOwner.size).toBe(0);
  });

  it("matches what live tile writes build for the same tiles", () => {
    const tiles: Array<[string, DomainTileState]> = [
      ["1,1", tile({ ownerId: "p1", ownershipState: "FRONTIER" })],
      ["2,2", tile({ ownerId: "p1", ownershipState: "SETTLED", economicStructure: { ownerId: "p1", type: "RESERVE_LATTICE", status: "active" } })],
      ["3,3", tile({ ownerId: "p2", ownershipState: "SETTLED", muster: { ownerId: "p2", amount: 1, mode: "HOLD", updatedAt: 0 } })]
    ];
    const booted = new RuntimeOwnerTileIndexes();
    const live = new RuntimeOwnerTileIndexes();
    for (const [key, t] of tiles) {
      booted.seedFromBootTile(key, t);
      booted.seedActiveStructuresFromBootTile(key, t);
      booted.seedMusterAndManpowerStructuresFromBootTile(key, t);
      live.refreshForTileChange(key, undefined, t);
    }
    expect(booted.frontierTilesByOwner).toEqual(live.frontierTilesByOwner);
    expect(booted.musterTilesByOwner).toEqual(live.musterTilesByOwner);
    expect(booted.reserveLatticeTilesByOwner).toEqual(live.reserveLatticeTilesByOwner);
  });
});
