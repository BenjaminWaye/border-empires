import type { DomainTileState } from "@border-empires/game-domain";
import type { MonumentalStructureType } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { activeMonumentOnTile, monumentClaimOwnerId, refreshMonumentOwnerIndexForTile } from "./monument-uniqueness.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

type MonumentIndex = Map<MonumentalStructureType, { ownerId: string; tileKey: string }>;

const tileWithMonument = (
  x: number,
  y: number,
  overrides: {
    type?: string;
    structureOwnerId?: string;
    status?: string;
    tileOwnerId?: string;
  } = {}
): DomainTileState =>
  ({
    x,
    y,
    terrain: "LAND",
    ...(overrides.tileOwnerId ? { ownerId: overrides.tileOwnerId, ownershipState: "SETTLED" } : {}),
    economicStructure: {
      type: overrides.type ?? "POPULATION_BUREAU",
      ownerId: overrides.structureOwnerId ?? "player-1",
      status: overrides.status ?? "active"
    }
  }) as DomainTileState;

/** Seeds the index the way SimulationRuntime's boot pass does. */
const seedIndex = (tiles: Map<string, DomainTileState>): MonumentIndex => {
  const index: MonumentIndex = new Map();
  for (const [tileKey, tile] of tiles) {
    const monument = activeMonumentOnTile(tile);
    if (monument) index.set(monument.type, { ownerId: monument.ownerId, tileKey });
  }
  return index;
};

describe("activeMonumentOwnerByType index", () => {
  it("agrees with the monumentClaimOwnerId scan it mirrors, including on a tile whose owner differs from the structure's", () => {
    // monumentClaimOwnerId never consults tile.ownerId — it keys purely off
    // the STRUCTURE's owner. This case (structure owned by player-1, tile
    // unowned) is exactly the divergence an ownership-gated boot seed would
    // have introduced between a booted world and a live-built one.
    const tiles = new Map<string, DomainTileState>();
    tiles.set(simulationTileKey(3, 4), tileWithMonument(3, 4, { structureOwnerId: "player-1" }));

    const index = seedIndex(tiles);

    expect(index.get("POPULATION_BUREAU")?.ownerId).toBe(monumentClaimOwnerId(tiles, "POPULATION_BUREAU"));
    expect(index.get("POPULATION_BUREAU")?.ownerId).toBe("player-1");
  });

  it("ignores a monument that is still under construction, matching the scan", () => {
    const tiles = new Map<string, DomainTileState>();
    tiles.set(simulationTileKey(1, 1), tileWithMonument(1, 1, { status: "under_construction" }));

    expect(seedIndex(tiles).get("POPULATION_BUREAU")).toBeUndefined();
    expect(monumentClaimOwnerId(tiles, "POPULATION_BUREAU")).toBeUndefined();
  });

  it("ignores non-monument economic structures", () => {
    const tiles = new Map<string, DomainTileState>();
    tiles.set(simulationTileKey(1, 1), tileWithMonument(1, 1, { type: "GARRISON_HALL" }));

    expect(seedIndex(tiles).size).toBe(0);
  });

  it("tracks ownership transfer on capture without dropping the claim", () => {
    const index: MonumentIndex = new Map();
    const tileKey = simulationTileKey(5, 5);
    const before = tileWithMonument(5, 5, { structureOwnerId: "player-1", tileOwnerId: "player-1" });
    refreshMonumentOwnerIndexForTile({ tileKey, previous: undefined, next: before, activeMonumentOwnerByType: index });
    expect(index.get("POPULATION_BUREAU")?.ownerId).toBe("player-1");

    // Capture rewrites both the tile owner and the structure owner.
    const after = tileWithMonument(5, 5, { structureOwnerId: "player-2", tileOwnerId: "player-2" });
    refreshMonumentOwnerIndexForTile({ tileKey, previous: before, next: after, activeMonumentOwnerByType: index });
    expect(index.get("POPULATION_BUREAU")?.ownerId).toBe("player-2");
  });

  it("clears the claim when the monument is removed from its tile", () => {
    const index: MonumentIndex = new Map();
    const tileKey = simulationTileKey(7, 7);
    const before = tileWithMonument(7, 7);
    refreshMonumentOwnerIndexForTile({ tileKey, previous: undefined, next: before, activeMonumentOwnerByType: index });

    const cleared: DomainTileState = { x: 7, y: 7, terrain: "LAND" };
    refreshMonumentOwnerIndexForTile({ tileKey, previous: before, next: cleared, activeMonumentOwnerByType: index });

    expect(index.get("POPULATION_BUREAU")).toBeUndefined();
  });

  it("does not let an unrelated tile's clear evict a still-standing monument's claim", () => {
    const index: MonumentIndex = new Map();
    const standingKey = simulationTileKey(2, 2);
    const standing = tileWithMonument(2, 2, { structureOwnerId: "player-1" });
    refreshMonumentOwnerIndexForTile({ tileKey: standingKey, previous: undefined, next: standing, activeMonumentOwnerByType: index });

    // A DIFFERENT tile that also had an active monument of the same type
    // (an invariant violation the tileKey guard is there to survive) losing
    // its structure must not evict the entry pointing at the standing one.
    const otherKey = simulationTileKey(9, 9);
    const otherBefore = tileWithMonument(9, 9, { structureOwnerId: "player-2" });
    const otherCleared: DomainTileState = { x: 9, y: 9, terrain: "LAND" };
    refreshMonumentOwnerIndexForTile({ tileKey: otherKey, previous: otherBefore, next: otherCleared, activeMonumentOwnerByType: index });

    expect(index.get("POPULATION_BUREAU")).toEqual({ ownerId: "player-1", tileKey: standingKey });
  });
});
