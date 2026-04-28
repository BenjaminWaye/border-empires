import { describe, expect, it } from "vitest";

import { buildAiTrainingRecord } from "./ai-training-records.js";

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
        settlementEligible: true,
        settlementCandidateFound: false,
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
    expect(record.plannerState.tiles.strategicFrontier[0]).toMatchObject({ x: 2, y: 1, dockId: "dock-1" });
    expect(record.notes.pendingSettlementTileKeys).toEqual(["2,1"]);
  });
});
