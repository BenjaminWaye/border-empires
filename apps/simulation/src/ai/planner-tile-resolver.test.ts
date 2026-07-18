/**
 * Behavior tests for planner-tile-resolver (fix #5).
 *
 * Verifies:
 * - Golden output equivalence (same result as original inline code)
 * - tileCollectionVersion short-circuit preserved
 * - Empty scope
 * - Single-tile player
 * - Missing-from-tilesByKey filtered (not nulled)
 */
import { describe, expect, it, vi } from "vitest";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";
import { resolvePlayerTiles } from "./planner-tile-resolver.js";

const mkTile = (x: number, y: number): PlannerTileView => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "p1",
  ownershipState: "SETTLED"
});

const mkPlayer = (
  overrides: Partial<PlannerPlayerView> = {}
): PlannerPlayerView => ({
  id: "p1",
  points: 100,
  manpower: 100,
  hasActiveLock: false,
  tileCollectionVersion: 1,
  topologyVersion: 1,
  topologyDirtyTileKeys: [],
  activeDevelopmentProcessCount: 0,
  territoryTileKeys: [],
  frontierTileKeys: [],
  hotFrontierTileKeys: [],
  strategicFrontierTileKeys: [],
  buildCandidateTileKeys: [],
  pendingSettlementTileKeys: [],
  townTileKeys: [],
  ...overrides
});

describe("resolvePlayerTiles", () => {
  it("empty scope returns empty arrays", () => {
    const cache = new Map();
    const result = resolvePlayerTiles(mkPlayer(), new Map(), cache);
    expect(result.ownedTiles).toHaveLength(0);
    expect(result.frontierTiles).toHaveLength(0);
    expect(result.hotFrontierTiles).toHaveLength(0);
    expect(result.strategicFrontierTiles).toHaveLength(0);
    expect(result.buildCandidateTiles).toHaveLength(0);
    expect(result.pendingSettlementTileKeys.size).toBe(0);
  });

  it("single-tile player: owned tile resolved correctly", () => {
    const tile = mkTile(5, 5);
    const tilesByKey = new Map([["5,5", tile]]);
    const cache = new Map();
    const player = mkPlayer({ territoryTileKeys: ["5,5"] });
    const result = resolvePlayerTiles(player, tilesByKey, cache);
    expect(result.ownedTiles).toHaveLength(1);
    expect(result.ownedTiles[0]).toBe(tile);
  });

  it("missing-from-tilesByKey filtered, not nulled", () => {
    const tile = mkTile(5, 5);
    const tilesByKey = new Map([["5,5", tile]]);
    const cache = new Map();
    const player = mkPlayer({
      territoryTileKeys: ["5,5", "99,99"] // 99,99 not in map
    });
    const result = resolvePlayerTiles(player, tilesByKey, cache);
    expect(result.ownedTiles).toHaveLength(1);
    expect(result.ownedTiles[0]).toBe(tile);
    // No null in the array
    expect(result.ownedTiles.every((t) => t !== null && t !== undefined)).toBe(true);
  });

  it("tileCollectionVersion short-circuit: no map lookups on cache hit", () => {
    const tile = mkTile(5, 5);
    const tilesByKey = new Map([["5,5", tile]]);
    const cache = new Map();
    const player = mkPlayer({ territoryTileKeys: ["5,5"], tileCollectionVersion: 42, topologyVersion: 42, topologyDirtyTileKeys: [] });

    // First call populates cache
    resolvePlayerTiles(player, tilesByKey, cache);
    expect(cache.has("p1")).toBe(true);

    // Spy on map.get to verify no lookups on second call
    const getSpy = vi.spyOn(tilesByKey, "get");
    const result2 = resolvePlayerTiles(player, tilesByKey, cache);
    expect(getSpy).not.toHaveBeenCalled();
    expect(result2.ownedTiles[0]).toBe(tile);
    getSpy.mockRestore();
  });

  it("cache invalidated on version change: recomputes correctly", () => {
    const tile1 = mkTile(5, 5);
    const tile2 = mkTile(6, 6);
    const tilesByKey = new Map([["5,5", tile1], ["6,6", tile2]]);
    const cache = new Map();
    const playerV1 = mkPlayer({ territoryTileKeys: ["5,5"], tileCollectionVersion: 1, topologyVersion: 1, topologyDirtyTileKeys: [] });
    resolvePlayerTiles(playerV1, tilesByKey, cache);

    const playerV2 = mkPlayer({ territoryTileKeys: ["5,5", "6,6"], tileCollectionVersion: 2, topologyVersion: 2, topologyDirtyTileKeys: [] });
    const result = resolvePlayerTiles(playerV2, tilesByKey, cache);
    expect(result.ownedTiles).toHaveLength(2);
  });

  it("golden equivalence: resolves all 5 tile lists correctly", () => {
    const tiles: PlannerTileView[] = [
      { x: 1, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" },
      { x: 2, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
      { x: 3, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
      { x: 4, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" },
      { x: 5, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" },
    ];
    const tilesByKey = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
    const cache = new Map();
    const player = mkPlayer({
      territoryTileKeys: ["1,1"],
      frontierTileKeys: ["2,1"],
      hotFrontierTileKeys: ["3,1"],
      strategicFrontierTileKeys: ["3,1"],
      buildCandidateTileKeys: ["4,1", "5,1"],
      pendingSettlementTileKeys: ["6,1"],  // missing from map — stays in set
      townTileKeys: ["4,1"]
    });
    const result = resolvePlayerTiles(player, tilesByKey, cache);
    expect(result.ownedTiles.map((t) => `${t.x},${t.y}`)).toEqual(["1,1"]);
    expect(result.frontierTiles.map((t) => `${t.x},${t.y}`)).toEqual(["2,1"]);
    expect(result.hotFrontierTiles.map((t) => `${t.x},${t.y}`)).toEqual(["3,1"]);
    expect(result.strategicFrontierTiles.map((t) => `${t.x},${t.y}`)).toEqual(["3,1"]);
    expect(result.buildCandidateTiles.map((t) => `${t.x},${t.y}`)).toEqual(["4,1", "5,1"]);
    expect(result.townTiles.map((t) => `${t.x},${t.y}`)).toEqual(["4,1"]);
    // pendingSettlementTileKeys is a Set from the raw keys, missing key included
    expect(result.pendingSettlementTileKeys.has("6,1")).toBe(true);
  });

  it("preserves per-list input order", () => {
    const tiles: PlannerTileView[] = [
      { x: 5, y: 1, terrain: "LAND" },
      { x: 3, y: 1, terrain: "LAND" },
      { x: 7, y: 1, terrain: "LAND" },
    ];
    const tilesByKey = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
    const cache = new Map();
    const player = mkPlayer({
      territoryTileKeys: ["5,1", "3,1", "7,1"]  // intentionally non-sorted
    });
    const result = resolvePlayerTiles(player, tilesByKey, cache);
    // Order must be preserved as given in the key list
    expect(result.ownedTiles.map((t) => `${t.x},${t.y}`)).toEqual(["5,1", "3,1", "7,1"]);
  });
});
