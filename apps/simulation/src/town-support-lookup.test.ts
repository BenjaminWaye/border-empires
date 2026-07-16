import { describe, expect, it } from "vitest";

import {
  openTownSupportNeighborTiles,
  townSupportStructureShowsOnTile,
  type TownSupportTile
} from "./town-support-lookup.js";

const tile = (x: number, y: number, overrides: Partial<TownSupportTile> = {}): TownSupportTile => ({
  x,
  y,
  ...overrides
});

describe("openTownSupportNeighborTiles", () => {
  it("returns an empty list when every neighbor is FRONTIER (boxed in, no open support tile)", () => {
    const town = tile(0, 0, { ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "TOWN" } });
    const neighbors = [
      [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]
    ].map(([dx, dy]) => tile(dx, dy, { ownerId: "p1", ownershipState: "FRONTIER" }));
    const tiles = new Map<string, TownSupportTile>([
      ["0,0", town],
      ...neighbors.map((n) => [`${n.x},${n.y}`, n] as const)
    ]);

    expect(openTownSupportNeighborTiles(tiles, "p1", "0,0")).toHaveLength(0);
  });

  it("excludes SETTLED neighbors that already have a structure", () => {
    const town = tile(0, 0, { ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "TOWN" } });
    const occupied = tile(1, 0, { ownerId: "p1", ownershipState: "SETTLED", fort: { ownerId: "p1" } });
    const tiles = new Map<string, TownSupportTile>([
      ["0,0", town],
      ["1,0", occupied]
    ]);

    expect(openTownSupportNeighborTiles(tiles, "p1", "0,0")).toHaveLength(0);
  });

  it("returns an open SETTLED neighbor assigned to this town", () => {
    const town = tile(0, 0, { ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "TOWN" } });
    const open = tile(1, 0, { ownerId: "p1", ownershipState: "SETTLED" });
    const tiles = new Map<string, TownSupportTile>([
      ["0,0", town],
      ["1,0", open]
    ]);

    const result = openTownSupportNeighborTiles(tiles, "p1", "0,0");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(open);
  });

  it("does not double-count a shared neighbor for a farther town when a closer town exists", () => {
    // assignedTownKeyForSupportTile ties on distance and picks the lowest
    // (x,y) via sortTiles, so a tile adjacent to two towns is assigned to
    // exactly one of them.
    const closerTown = tile(0, 0, { ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "TOWN" } });
    const fartherTown = tile(1, 1, { ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "TOWN" } });
    const shared = tile(1, 0, { ownerId: "p1", ownershipState: "SETTLED" });
    const tiles = new Map<string, TownSupportTile>([
      ["0,0", closerTown],
      ["1,1", fartherTown],
      ["1,0", shared]
    ]);

    expect(openTownSupportNeighborTiles(tiles, "p1", "0,0")).toHaveLength(1);
    expect(openTownSupportNeighborTiles(tiles, "p1", "1,1")).toHaveLength(0);
  });
});

describe("townSupportStructureShowsOnTile", () => {
  it("shows MARKET on a plain settled tile adjacent to a town", () => {
    const town = tile(0, 0, { ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "TOWN" } });
    const supportTile = tile(1, 0, { ownerId: "p1", ownershipState: "SETTLED" });
    const tiles = new Map<string, TownSupportTile>([
      ["0,0", town],
      ["1,0", supportTile]
    ]);
    expect(townSupportStructureShowsOnTile(tiles, "p1", supportTile, "MARKET")).toBe(true);
  });

  it("does not show MARKET on a settled tile with no adjacent town", () => {
    const isolated = tile(5, 5, { ownerId: "p1", ownershipState: "SETTLED" });
    const tiles = new Map<string, TownSupportTile>([["5,5", isolated]]);
    expect(townSupportStructureShowsOnTile(tiles, "p1", isolated, "MARKET")).toBe(false);
  });
});
