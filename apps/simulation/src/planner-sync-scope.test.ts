import { describe, expect, it } from "vitest";

import { buildPlannerRelevantTileKeys, createPlannerRelevantTileKeyIndex } from "./planner-sync-scope.js";
import type { PlannerPlayerView } from "./planner-world-view.js";

const makePlayer = (overrides: Partial<PlannerPlayerView> = {}): PlannerPlayerView => ({
  id: "p1",
  points: 0,
  manpower: 0,
  tileCollectionVersion: 1,
  topologyVersion: 1,
  hasActiveLock: false,
  territoryTileKeys: [],
  frontierTileKeys: [],
  hotFrontierTileKeys: [],
  strategicFrontierTileKeys: [],
  buildCandidateTileKeys: [],
  pendingSettlementTileKeys: [],
  activeDevelopmentProcessCount: 0,
  ...overrides
});

describe("buildPlannerRelevantTileKeys", () => {
  it("includes radius around territory, frontier, and pending-settlement tiles", () => {
    const keys = buildPlannerRelevantTileKeys({
      players: [
        makePlayer({
          territoryTileKeys: ["10,10"],
          frontierTileKeys: ["20,20"],
          pendingSettlementTileKeys: ["30,30"]
        })
      ],
      tiles: [],
      docks: []
    });

    expect(keys.has("10,10")).toBe(true);
    expect(keys.has("12,12")).toBe(true);
    expect(keys.has("20,22")).toBe(true);
    expect(keys.has("30,28")).toBe(true);
    expect(keys.has("40,40")).toBe(false);
  });

  it("unions scoped keys across players", () => {
    const keys = buildPlannerRelevantTileKeys({
      players: [
        makePlayer({ id: "p1", territoryTileKeys: ["0,0"] }),
        makePlayer({ id: "p2", territoryTileKeys: ["50,50"] })
      ],
      tiles: [],
      docks: []
    }, 0);

    expect(keys).toEqual(new Set(["0,0", "50,50"]));
  });

  it("includes linked dock neighborhoods for owned dock territory", () => {
    const keys = buildPlannerRelevantTileKeys({
      players: [makePlayer({ territoryTileKeys: ["10,10"] })],
      tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "p1", dockId: "dock-a" }],
      docks: [{ dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] }, { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }]
    }, 0);

    expect(keys.has("50,50")).toBe(true);
    expect(keys.has("49,49")).toBe(true);
  });

  it("updates only the changed player's scoped keys when replacing players incrementally", () => {
    const playerOne = makePlayer({ id: "p1", territoryTileKeys: ["10,10"] });
    const playerTwo = makePlayer({ id: "p2", territoryTileKeys: ["50,50"] });
    const index = createPlannerRelevantTileKeyIndex({
      players: [playerOne, playerTwo],
      tiles: [],
      docks: []
    }, 0);

    expect(index.keys()).toEqual(new Set(["10,10", "50,50"]));

    // Bump topologyVersion: in production replaceTileState calls
    // markPlannerPlayerTopologyDirty only when tile ownership changes
    // (!sameOwner). A test that mutated territory without bumping the
    // topologyVersion would represent a runtime bug, not a use case.
    index.replacePlayers(
      [makePlayer({ id: "p1", tileCollectionVersion: 2, topologyVersion: 2, territoryTileKeys: ["12,12"] })],
      new Map()
    );

    expect(index.keys()).toEqual(new Set(["12,12", "50,50"]));
  });

  it("skips the rebuild when topologyVersion is unchanged", () => {
    const player = makePlayer({ id: "p1", tileCollectionVersion: 7, topologyVersion: 7, territoryTileKeys: ["10,10"] });
    const rebuilds: Array<{ playerId: string; inputTileKeyCount: number }> = [];
    const index = createPlannerRelevantTileKeyIndex({
      players: [player],
      tiles: [],
      docks: []
    }, 0, {
      onPlayerRelevanceRebuild: (playerId, inputTileKeyCount) => rebuilds.push({ playerId, inputTileKeyCount })
    });

    expect(index.keys()).toEqual(new Set(["10,10"]));
    expect(rebuilds).toEqual([{ playerId: "p1", inputTileKeyCount: 1 }]);

    // Same version → cache hit. Even if territoryTileKeys is mutated in the
    // input (which would never happen in production without a version bump),
    // the cache holds the previous result.
    index.replacePlayers(
      [makePlayer({ id: "p1", tileCollectionVersion: 7, topologyVersion: 7, territoryTileKeys: ["99,99"] })],
      new Map()
    );

    expect(index.keys()).toEqual(new Set(["10,10"]));
    expect(rebuilds).toEqual([{ playerId: "p1", inputTileKeyCount: 1 }]);
  });

  it("does not rescan large unchanged empires during incremental player replacement", () => {
    const makeTerritory = (offset: number, count: number): string[] =>
      Array.from({ length: count }, (_, index) => `${offset + index},10`);
    const players = Array.from({ length: 8 }, (_, index) =>
      makePlayer({
        id: `p${index + 1}`,
        tileCollectionVersion: 3,
        topologyVersion: 3,
        territoryTileKeys: makeTerritory(index * 100, 100)
      })
    );
    const rebuilds: Array<{ playerId: string; inputTileKeyCount: number }> = [];
    const index = createPlannerRelevantTileKeyIndex({
      players,
      tiles: [],
      docks: []
    }, 0, {
      onPlayerRelevanceRebuild: (playerId, inputTileKeyCount) => rebuilds.push({ playerId, inputTileKeyCount })
    });

    expect(index.keys().size).toBe(800);
    expect(rebuilds).toHaveLength(8);
    rebuilds.length = 0;

    index.replacePlayers(
      [
        ...players.slice(0, 3),
        makePlayer({ ...players[3]!, tileCollectionVersion: 4, topologyVersion: 4, territoryTileKeys: ["50,50"] }),
        ...players.slice(4)
      ],
      new Map()
    );

    expect(rebuilds).toEqual([{ playerId: "p4", inputTileKeyCount: 1 }]);
    expect(index.keys().has("50,50")).toBe(true);
  });
});
