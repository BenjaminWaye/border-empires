import { describe, expect, it } from "vitest";

import { buildAiTrainingRecord } from "./ai-training-records.js";

const withEnv = (patch: Record<string, string | undefined>, fn: () => void): void => {
  const previous = new Map(Object.keys(patch).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

describe("buildAiTrainingRecord", () => {
  it("serializes planner state and chosen command into the labeling-record shape", () => {
    const record = buildAiTrainingRecord({
      player: {
        id: "ai-3",
        points: 140,
        manpower: 80,
        techIds: ["coinage"],
        strategicResources: { FOOD: 20 },
        settledTileCount: 2,
        townCount: 1,
        incomePerMinute: 5,
        tileCollectionVersion: 4,
        topologyVersion: 4,
        topologyDirtyTileKeys: [],
        hasActiveLock: false,
        territoryTileKeys: ["1,1"],
        frontierTileKeys: ["2,1"],
        hotFrontierTileKeys: ["2,1"],
        strategicFrontierTileKeys: ["2,1"],
        buildCandidateTileKeys: ["1,1"],
        pendingSettlementTileKeys: ["2,1"],
        activeDevelopmentProcessCount: 0
      },
      issuedAt: 1234,
      clientSeq: 9,
      ownedTiles: [{ x: 1, y: 1, terrain: "LAND", ownerId: "ai-3", ownershipState: "SETTLED" }],
      frontierTiles: [{ x: 2, y: 1, terrain: "LAND", ownerId: "ai-3", ownershipState: "FRONTIER", dockId: "dock-1" }],
      hotFrontierTiles: [{ x: 2, y: 1, terrain: "LAND", ownerId: "ai-3", ownershipState: "FRONTIER", dockId: "dock-1" }],
      strategicFrontierTiles: [{ x: 2, y: 1, terrain: "LAND", ownerId: "ai-3", ownershipState: "FRONTIER", dockId: "dock-1" }],
      buildCandidateTiles: [{ x: 1, y: 1, terrain: "LAND", ownerId: "ai-3", ownershipState: "SETTLED" }],
      pendingSettlementTileKeys: new Set(["2,1"]),
      docks: [{ dockId: "dock-1", tileKey: "2,1", pairedDockId: "dock-2", connectedDockIds: ["dock-2"] }],
      command: {
        commandId: "ai-runtime-ai-3-9-1234",
        sessionId: "ai-runtime:ai-3",
        playerId: "ai-3",
        clientSeq: 9,
        issuedAt: 1234,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 1, fromY: 1, toX: 2, toY: 1 })
      },
      diagnostic: {
        playerId: "ai-3",
        sessionPrefix: "ai-runtime",
        frontierEnemyTargetCount: 0,
        frontierNeutralTargetCount: 1,
        canAttack: true,
        canExpand: true
      }
    });

    expect(record.recordId).toBe("rewrite:ai-3:9:1234");
    expect(record.chosenAction).toEqual({
      type: "EXPAND",
      payload: { fromX: 1, fromY: 1, toX: 2, toY: 1 }
    });
    expect(record.plannerState.tileCounts).toEqual({
      owned: 1,
      frontier: 1,
      hotFrontier: 1,
      strategicFrontier: 1,
      buildCandidates: 1
    });
    expect(record.plannerState.tiles.strategicFrontier[0]).toMatchObject({ x: 2, y: 1, dockId: "dock-1" });
    expect(record.notes.pendingSettlementTileKeys).toEqual(["2,1"]);
  });

  it("caps tile samples while preserving chosen and high-signal tiles first", () => {
    withEnv({ SIMULATION_AI_TRAINING_TILE_SAMPLE_LIMIT: "2" }, () => {
      const record = buildAiTrainingRecord({
        player: {
          id: "ai-3",
          points: 140,
          manpower: 80,
          tileCollectionVersion: 4,
          topologyVersion: 4,
          topologyDirtyTileKeys: [],
          hasActiveLock: false,
          territoryTileKeys: ["1,1", "2,1", "3,1", "4,1"],
          frontierTileKeys: ["1,1", "2,1", "3,1", "4,1"],
          hotFrontierTileKeys: ["1,1", "2,1", "3,1", "4,1"],
          strategicFrontierTileKeys: ["1,1", "2,1", "3,1", "4,1"],
          buildCandidateTileKeys: ["1,1", "2,1", "3,1", "4,1"],
          pendingSettlementTileKeys: ["3,1"],
          activeDevelopmentProcessCount: 0
        },
        issuedAt: 1234,
        clientSeq: 9,
        ownedTiles: [
          { x: 1, y: 1, terrain: "LAND", ownerId: "ai-3", ownershipState: "SETTLED" },
          { x: 2, y: 1, terrain: "LAND", ownerId: "ai-3", ownershipState: "SETTLED", town: { type: "MARKET" } },
          { x: 3, y: 1, terrain: "LAND", ownerId: "ai-3", ownershipState: "FRONTIER" },
          { x: 4, y: 1, terrain: "LAND", ownerId: "ai-3", ownershipState: "FRONTIER" }
        ],
        frontierTiles: [
          { x: 1, y: 1, terrain: "LAND", ownerId: "ai-3", ownershipState: "FRONTIER" },
          { x: 2, y: 1, terrain: "LAND", ownerId: "ai-3", ownershipState: "FRONTIER", resource: "WHEAT" },
          { x: 3, y: 1, terrain: "LAND", ownerId: "ai-3", ownershipState: "FRONTIER" },
          { x: 4, y: 1, terrain: "LAND", ownerId: "ai-3", ownershipState: "FRONTIER" }
        ],
        hotFrontierTiles: [],
        strategicFrontierTiles: [],
        buildCandidateTiles: [],
        pendingSettlementTileKeys: new Set(["3,1"]),
        command: {
          commandId: "ai-runtime-ai-3-9-1234",
          sessionId: "ai-runtime:ai-3",
          playerId: "ai-3",
          clientSeq: 9,
          issuedAt: 1234,
          type: "EXPAND",
          payloadJson: JSON.stringify({ fromX: 1, fromY: 1, toX: 4, toY: 1 })
        },
        diagnostic: {
          playerId: "ai-3",
          sessionPrefix: "ai-runtime",
          frontierEnemyTargetCount: 0,
          frontierNeutralTargetCount: 1,
          canAttack: true,
          canExpand: true
        }
      });

      expect(record.plannerState.tileCounts.owned).toBe(4);
      expect(record.plannerState.tileSampleLimits.owned).toBe(2);
      expect(record.plannerState.tiles.owned.map((tile) => `${tile.x},${tile.y}`)).toEqual(["1,1", "4,1"]);
      expect(record.plannerState.tiles.frontier.map((tile) => `${tile.x},${tile.y}`)).toEqual(["1,1", "4,1"]);
    });
  });
});
