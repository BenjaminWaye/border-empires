import { describe, expect, it } from "vitest";

import { createSimulationChunkState } from "./chunk-state.js";

describe("createSimulationChunkState", () => {
  it("invalidates cached chunk summaries when a tile changes", () => {
    const key = (x: number, y: number): `${number},${number}` => `${x},${y}`;
    const ownership = new Map<`${number},${number}`, string>([[key(0, 0), "p1"]]);
    const state = createSimulationChunkState({
      worldWidth: 4,
      worldHeight: 4,
      chunkSize: 2,
      now: () => 1,
      wrapX: (x, mod) => ((x % mod) + mod) % mod,
      wrapY: (y, mod) => ((y % mod) + mod) % mod,
      chunkKeyAtTile: (x, y) => `${Math.floor(x / 2)},${Math.floor(y / 2)}`,
      key,
      barbarianOwnerId: "barbarian",
      terrainAtRuntime: () => "LAND",
      ownership,
      ownershipStateByTile: new Map([[key(0, 0), "FRONTIER" as const]]),
      resourceAt: () => undefined,
      applyClusterResources: (_x, _y, resource) => resource,
      clusterByTile: new Map(),
      clustersById: new Map(),
      docksByTile: new Map(),
      shardSiteViewAt: () => undefined,
      townsByTile: new Map(),
      fortsByTile: new Map(),
      observatoriesByTile: new Map(),
      siegeOutpostsByTile: new Map(),
      siphonByTile: new Map(),
      breachShockByTile: new Map(),
      regionTypeAtLocal: () => undefined,
      thinTownSummaryForTile: () => ({ type: "TOWN", supportCurrent: 0, supportMax: 0, goldPerMinute: 0, cap: 0, isFed: true, baseGoldPerMinute: 0 } as any),
      townSummaryForTile: () => ({ type: "TOWN", supportCurrent: 0, supportMax: 0, goldPerMinute: 0, cap: 0, isFed: true, baseGoldPerMinute: 0 } as any),
      observatoryStatusForTile: () => "active",
      applyTileYieldSummary: () => undefined,
      activeSettlementTileKeyForPlayer: () => undefined,
      economicStructuresByTile: new Map(),
      siphonShare: 0.25
    });

    const first = state.summaryChunkTiles(0, 0, "thin");
    expect(first.length).toBe(4);
    expect(state.cachedSummaryChunkByChunkKey.size).toBe(1);

    state.markSummaryChunkDirtyAtTile(0, 0);

    expect(state.summaryChunkVersionByChunkKey.get("0,0")).toBe(1);
    const second = state.summaryChunkTiles(0, 0, "thin");
    expect(second).not.toBe(first);
  });
});
