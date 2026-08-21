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
      reachTileKeysForPlayer: () => [],
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

  it("exports townTileKeys from the summary's ownedTownTierByTile map (not the full territory)", () => {
    const player: DomainPlayer = {
      id: "ai-1",
      isAi: true,
      points: 500,
      manpower: 25,
      techIds: new Set(),
      allies: new Set()
    };
    const summary = createEmptyPlayerRuntimeSummary();
    summary.ownedTownTierByTile.set("2,2", "TOWN");
    summary.ownedTownTierByTile.set("4,4", "CITY");

    const [view] = buildRuntimePlannerPlayerViews({
      playerIds: ["ai-1"],
      tiles: new Map(),
      docks: [],
      players: new Map([["ai-1", player]]),
      summaryForPlayer: () => summary,
      plannerGatingLockPlayerIds: () => new Set(),
      refreshManpowerOnly: () => {},
      plannerPlayerTileKeys: () => ({
        tileCollectionVersion: 1,
        topologyVersion: 1,
        topologyDirtyTileKeys: [],
        territoryTileKeys: ["a", "b", "c", "d", "e"],
        frontierTileKeys: [],
        hotFrontierTileKeys: [],
        strategicFrontierTileKeys: [],
        buildCandidateTileKeys: [],
        pendingSettlementTileKeys: []
      }),
      ownedStructureCountsForPlayer: () => ({}),
      estimatedIncomePerMinuteForPlayer: () => 0,
      reachTileKeysForPlayer: () => [],
      neutralBeaconTileKeys: new Set(),
      beaconGeneration: 0,
      yieldBearingTilesByOwner: new Map(),
      expansionObjectiveCacheByPlayer: new Map(),
      musterTilesByOwner: new Map()
    });

    expect(view?.townTileKeys.sort()).toEqual(["2,2", "4,4"]);
    // The whole point of this field: it must stay decoupled from territory
    // size — a 5-tile territory here should still only export 2 town keys.
    expect(view?.townTileKeys.length).toBeLessThan(view?.territoryTileKeys.length ?? 0);
  });

  it(
    "computes the enemy-yield-key pool at most once per call, shared across every " +
      "player in the batch (regression: selectExpansionObjective used to rebuild it per player)",
    () => {
      let iterationCount = 0;
      const realMap = new Map([["enemy-1", new Set(["9,9"])]]);
      // A Map-alike that counts how many times it gets fully iterated, so the
      // test fails loudly if sampleEnemyYieldKeysAcrossPlayers runs once per
      // player instead of once per buildRuntimePlannerPlayerViews call.
      const countingYieldMap: ReadonlyMap<string, ReadonlySet<string>> = {
        [Symbol.iterator]: () => { iterationCount++; return realMap[Symbol.iterator](); },
        entries: () => realMap.entries(),
        get: (k: string) => realMap.get(k),
        has: (k: string) => realMap.has(k),
        size: realMap.size,
        forEach: realMap.forEach.bind(realMap),
        keys: () => realMap.keys(),
        values: () => realMap.values()
      } as unknown as ReadonlyMap<string, ReadonlySet<string>>;

      const makePlayer = (id: string): DomainPlayer => ({
        id, isAi: true, points: 0, manpower: 0, techIds: new Set(), allies: new Set()
      });

      buildRuntimePlannerPlayerViews({
        playerIds: ["ai-1", "ai-2", "ai-3"],
        tiles: new Map(),
        docks: [],
        players: new Map([["ai-1", makePlayer("ai-1")], ["ai-2", makePlayer("ai-2")], ["ai-3", makePlayer("ai-3")]]),
        summaryForPlayer: () => createEmptyPlayerRuntimeSummary(),
        plannerGatingLockPlayerIds: () => new Set(),
        refreshManpowerOnly: () => {},
        plannerPlayerTileKeys: () => ({
          tileCollectionVersion: 1, topologyVersion: 1, topologyDirtyTileKeys: [],
          territoryTileKeys: ["1,1"], frontierTileKeys: [], hotFrontierTileKeys: [],
          strategicFrontierTileKeys: [], buildCandidateTileKeys: [], pendingSettlementTileKeys: []
        }),
        ownedStructureCountsForPlayer: () => ({}),
        estimatedIncomePerMinuteForPlayer: () => 0,
      reachTileKeysForPlayer: () => [],
        // A neutral beacon so selectExpansionObjective doesn't short-circuit
        // before ever touching the enemy pool.
        neutralBeaconTileKeys: new Set(["5,5"]),
        beaconGeneration: 0,
        yieldBearingTilesByOwner: countingYieldMap,
        expansionObjectiveCacheByPlayer: new Map(), // cold cache for all 3 players
        musterTilesByOwner: new Map()
      });

      expect(iterationCount).toBe(1);
    }
  );
});
