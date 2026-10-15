import { describe, expect, it } from "vitest";
import { createPlannerRelevantTileKeyIndex } from "./planner-sync-scope.js";
import type { PlannerPlayerView } from "./planner-world-view.js";

const player = (keys: string[]): PlannerPlayerView => ({ id: "ai-1", points: 1000, manpower: 1000,
  tileCollectionVersion: 1, topologyVersion: 1, topologyDirtyTileKeys: [], hasActiveLock: false,
  territoryTileKeys: ["0,0"], reachTileKeys: [], focusFrontTileKeys: ["0,0"], frontierTileKeys: [], hotFrontierTileKeys: [],
  strategicFrontierTileKeys: [], buildCandidateTileKeys: [], pendingSettlementTileKeys: [], townTileKeys: [], activeDevelopmentProcessCount: 0,
  ownedTileCount: 1, frontierTileCount: 0, tacticalView: { visibleTileKeys: keys, dormantObservatoryKeys: [], castRange: 20 } });

describe("tactical relevance without territory rescans", () => {
  it("backfills newly visible tactical ground even when topology is unchanged, and releases old scope", () => {
    let rebuilds = 0;
    const index = createPlannerRelevantTileKeyIndex({ players: [player(["100,100"])], tiles: [] }, 2,
      { onPlayerRelevanceRebuild: () => { rebuilds++; } });
    expect(index.keys().has("100,100")).toBe(true);
    rebuilds = 0;
    expect(index.replacePlayers([player(["101,100"])], new Map())).toContain("101,100");
    expect(index.keys().has("100,100")).toBe(false);
    expect(rebuilds).toBe(0);
    expect(index.replacePlayers([player(["101,100"])], new Map()).size).toBe(0);
  });
});
