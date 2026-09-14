import { describe, expect, it } from "vitest";
import type { DomainPlayer } from "@border-empires/game-domain";

import { createEmptyPlayerRuntimeSummary } from "./player-runtime-summary.js";
import { buildRuntimeExportPlayers } from "./runtime-state-export.js";
import { TileDeltaStringifyCache } from "./tile-delta-stringify-cache/tile-delta-stringify-cache.js";

// Regression for: buildRuntimeExportPlayers (the source player-snapshot.ts's
// subscription/reconnect snapshot reads from) never exported
// wonderMusterExtraFlag, so a WARPRESS-owning player's musterFlagLimit was
// silently under-reported by 1 on first load/reconnect (correct only once a
// live PLAYER_UPDATE, which reads the real RuntimePlayer directly, happened
// to fire) -- see runtime-natural-wonders.ts's applyWonderBonusFields, which
// sets this field on the live player.
describe("buildRuntimeExportPlayers WARPRESS export", () => {
  it("carries wonderMusterExtraFlag through to the exported player", () => {
    const player: DomainPlayer & { wonderMusterExtraFlag?: number } = {
      id: "player-1",
      points: 0,
      manpower: 0,
      techIds: new Set(),
      allies: new Set(),
      wonderMusterExtraFlag: 1
    };

    const [exported] = buildRuntimeExportPlayers({
      tiles: new Map(),
      locksByCommandId: new Map(),
      players: new Map([["player-1", player]]),
      pendingSettlementsByTile: new Map(),
      tileYieldCollectedAtByTile: new Map(),
      playerYieldCollectionEpochByPlayer: new Map(),
      docks: [],
      terrainEpoch: 0,
      tileDeltaStringifyCache: new TileDeltaStringifyCache(),
      applyManpowerRegen: () => {},
      playerManpowerCap: () => 0,
      playerManpowerRegenPerMinute: () => 0,
      playerLogisticsThroughputPerMinute: () => 0,
      playerManpowerBreakdown: () => ({ cap: [], regen: [] }),
      growthStalledNoFoodCounter: 0,
      incomePerMinuteForPlayer: () => 0,
      summaryForPlayer: () => createEmptyPlayerRuntimeSummary()
    });

    expect(exported?.wonderMusterExtraFlag).toBe(1);
  });

  it("omits wonderMusterExtraFlag when the player doesn't have it (not exported as 0/undefined noise)", () => {
    const player: DomainPlayer = {
      id: "player-1",
      points: 0,
      manpower: 0,
      techIds: new Set(),
      allies: new Set()
    };

    const [exported] = buildRuntimeExportPlayers({
      tiles: new Map(),
      locksByCommandId: new Map(),
      players: new Map([["player-1", player]]),
      pendingSettlementsByTile: new Map(),
      tileYieldCollectedAtByTile: new Map(),
      playerYieldCollectionEpochByPlayer: new Map(),
      docks: [],
      terrainEpoch: 0,
      tileDeltaStringifyCache: new TileDeltaStringifyCache(),
      applyManpowerRegen: () => {},
      playerManpowerCap: () => 0,
      playerManpowerRegenPerMinute: () => 0,
      playerLogisticsThroughputPerMinute: () => 0,
      playerManpowerBreakdown: () => ({ cap: [], regen: [] }),
      growthStalledNoFoodCounter: 0,
      incomePerMinuteForPlayer: () => 0,
      summaryForPlayer: () => createEmptyPlayerRuntimeSummary()
    });

    expect(exported?.wonderMusterExtraFlag).toBeUndefined();
  });
});
