import { describe, expect, it } from "vitest";

import {
  assignedTownKeyForSupportTile,
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

// REGRESSION (2026-09-10): this module is the "SINGLE source of truth" for
// support-tile assignment (see its top-of-file doc comment) -- it gates real
// structure placement (BUILD_ECONOMIC_STRUCTURE), the AI planner's candidate
// selection, and auto-settle eligibility (runtime.ts's hasTownSupport). It
// used to scan a fixed 8-neighbor square regardless of the town's tier, so a
// GREAT_CITY/METROPOLIS town's distance-2 support tiles could never be
// built on, auto-settled, or recognized as belonging to that town at all --
// independent of (and more consequential than) the economic-bonus-only
// hardcoding fixed elsewhere in this branch.
describe("GREAT_CITY/METROPOLIS second ring", () => {
  // Skipped (2026-09-12 prod incident): second ring reverted again, see
  // town-growth.ts's supportRingRadiusForTier comment. Re-enable once the
  // ring returns with a properly-scoped cost bound.
  it.skip("assignedTownKeyForSupportTile finds a GREAT_CITY town two tiles away", () => {
    const town = tile(10, 10, { ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "GREAT_CITY" } });
    const farSupportTile = tile(12, 10, { ownerId: "p1", ownershipState: "SETTLED" }); // distance 2
    const tiles = new Map<string, TownSupportTile>([
      ["10,10", town],
      ["12,10", farSupportTile]
    ]);
    expect(assignedTownKeyForSupportTile(tiles, "p1", 12, 10)).toBe("10,10");
  });

  it("does not assign a distance-2 tile to a same-owner TOWN-tier town (its own radius is only 1)", () => {
    const town = tile(10, 10, { ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "TOWN" } });
    const farSupportTile = tile(12, 10, { ownerId: "p1", ownershipState: "SETTLED" }); // distance 2
    const tiles = new Map<string, TownSupportTile>([
      ["10,10", town],
      ["12,10", farSupportTile]
    ]);
    expect(assignedTownKeyForSupportTile(tiles, "p1", 12, 10)).toBeUndefined();
  });

  // Skipped (2026-09-12 prod incident): second ring reverted again, see
  // town-growth.ts's supportRingRadiusForTier comment. Re-enable once the
  // ring returns with a properly-scoped cost bound.
  it.skip("openTownSupportNeighborTiles finds an open distance-2 tile for a GREAT_CITY town", () => {
    const town = tile(10, 10, { ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "GREAT_CITY" } });
    const farOpenTile = tile(10, 8, { ownerId: "p1", ownershipState: "SETTLED" }); // distance 2
    const tiles = new Map<string, TownSupportTile>([
      ["10,10", town],
      ["10,8", farOpenTile]
    ]);
    const result = openTownSupportNeighborTiles(tiles, "p1", "10,10");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(farOpenTile);
  });

  it("openTownSupportNeighborTiles does not reach distance 2 for a CITY-tier town", () => {
    const town = tile(10, 10, { ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "CITY" } });
    const farOpenTile = tile(10, 8, { ownerId: "p1", ownershipState: "SETTLED" }); // distance 2
    const tiles = new Map<string, TownSupportTile>([
      ["10,10", town],
      ["10,8", farOpenTile]
    ]);
    expect(openTownSupportNeighborTiles(tiles, "p1", "10,10")).toHaveLength(0);
  });

  // Skipped (2026-09-12 prod incident): second ring reverted again, see
  // town-growth.ts's supportRingRadiusForTier comment. Re-enable once the
  // ring returns with a properly-scoped cost bound.
  it.skip("townSupportStructureShowsOnTile recognizes MINTWORKS eligibility at distance 2 for a METROPOLIS town", () => {
    const town = tile(10, 10, { ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "METROPOLIS" } });
    const farSupportTile = tile(8, 8, { ownerId: "p1", ownershipState: "SETTLED" }); // distance 2 (diagonal)
    const tiles = new Map<string, TownSupportTile>([
      ["10,10", town],
      ["8,8", farSupportTile]
    ]);
    expect(townSupportStructureShowsOnTile(tiles, "p1", farSupportTile, "MINTWORKS")).toBe(true);
  });
});

describe("townSupportStructureShowsOnTile", () => {
  it("shows MINTWORKS on a plain settled tile adjacent to a town", () => {
    const town = tile(0, 0, { ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "TOWN" } });
    const supportTile = tile(1, 0, { ownerId: "p1", ownershipState: "SETTLED" });
    const tiles = new Map<string, TownSupportTile>([
      ["0,0", town],
      ["1,0", supportTile]
    ]);
    expect(townSupportStructureShowsOnTile(tiles, "p1", supportTile, "MINTWORKS")).toBe(true);
  });

  it("does not show MINTWORKS on a settled tile with no adjacent town", () => {
    const isolated = tile(5, 5, { ownerId: "p1", ownershipState: "SETTLED" });
    const tiles = new Map<string, TownSupportTile>([["5,5", isolated]]);
    expect(townSupportStructureShowsOnTile(tiles, "p1", isolated, "MINTWORKS")).toBe(false);
  });
});
