import { describe, expect, it } from "vitest";
import type { DomainPlayer } from "@border-empires/game-domain";

import { createEmptyPlayerRuntimeSummary } from "./player-runtime-summary.js";
import { buildRuntimePlannerPlayerViews } from "./runtime-state-export.js";

describe("runtime state export", () => {
  it("serializes cached owned structure counts onto planner player views", () => {
    const player: DomainPlayer = {
      id: "ai-1",
      isAi: true,
      points: 500,
      manpower: 25,
      techIds: new Set(),
      allies: new Set()
    };

    const [view] = buildRuntimePlannerPlayerViews({
      playerIds: ["ai-1"],
      tiles: new Map(),
      docks: [],
      players: new Map([["ai-1", player]]),
      summaryForPlayer: () => createEmptyPlayerRuntimeSummary(),
      plannerGatingLockPlayerIds: () => new Set(),
      refreshManpowerOnly: () => {},
      plannerPlayerTileKeys: () => ({
        tileCollectionVersion: 1,
        topologyVersion: 1,
        topologyDirtyTileKeys: [],
        territoryTileKeys: ["a", "b", "c"],
        frontierTileKeys: ["x", "y"],
        hotFrontierTileKeys: [],
        strategicFrontierTileKeys: [],
        buildCandidateTileKeys: [],
        pendingSettlementTileKeys: []
      }),
      ownedStructureCountsForPlayer: () => ({ FORT: 2, SIEGE_OUTPOST: 3 }),
      estimatedIncomePerMinuteForPlayer: () => 0,
      neutralBeaconTileKeys: new Set(),
      beaconGeneration: 0,
      yieldBearingTilesByOwner: new Map(),
      expansionObjectiveCacheByPlayer: new Map(),
      musterTilesByOwner: new Map()
    });

    expect(view?.ownedStructureCounts).toEqual({ FORT: 2, SIEGE_OUTPOST: 3 });
    expect(view?.ownedTileCount).toBe(3);
    expect(view?.frontierTileCount).toBe(2);
  });
});
