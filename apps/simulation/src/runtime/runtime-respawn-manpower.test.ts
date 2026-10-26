import { describe, expect, it } from "vitest";
import { STARTING_CAPITAL_MANPOWER_CAP, type DomainTileState } from "@border-empires/game-domain";

import { respawnIfEliminated, respawnPlayerOnUnownedLand, type RuntimeRespawnContext } from "../runtime-respawn-helpers.js";
import { createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";
import { createHumanRuntimePlayer } from "../runtime-player-factory.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// A respawn is a fresh start, so it tops manpower up to the same full
// starting-capital amount a brand-new player gets (createHumanRuntimePlayer),
// not a token 100.
const buildContext = (manpower: number) => {
  const tiles = new Map<string, DomainTileState>();
  for (let y = 0; y <= 20; y += 1) for (let x = 0; x <= 20; x += 1) tiles.set(simulationTileKey(x, y), { x, y, terrain: "LAND" });
  const player = buildPlayer("player-1", { manpower });
  const summary = createEmptyPlayerRuntimeSummary();
  const ctx: RuntimeRespawnContext = {
    now: () => 1_000,
    players: new Map([["player-1", player]]),
    tiles,
    playerSummaries: new Map([["player-1", summary]]),
    plannerPlayerTileCollectionVersionByPlayer: new Map(),
    pendingRespawnNoticeByPlayerId: new Map(),
    lastRespawnNoticeByPlayerId: new Map(),
    pendingSettlementsByTile: new Map(),
    locksByTile: new Map(),
    rememberedAutomationVictoryPathByPlayer: new Map(),
    summaryForPlayer: () => summary,
    replaceTileState: (tileKey, tile) => {
      tiles.set(tileKey, tile);
    },
    bumpTerrainEpoch: () => {},
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
    emitEvent: () => {},
    emitPlayerStateUpdate: () => {},
    scheduleAfter: () => {},
    runtimeLogInfo: () => {},
    incomePerMinuteForPlayer: () => 0,
    respawnMinimumGold: 0,
    incrementAuthRecoveryRespawn: () => {},
    incrementAuthRecoveryRespawnGuarded: () => {},
    coastalLandKeys: () => new Set(),
    hasNearbySettled: () => false,
    hasNearbyTown: () => false,
    hasNearbyFood: () => false,
    claimFairSpawnSite: () => ({ x: 10, y: 10 }),
    reachOwnerAt: () => undefined
  };
  return { ctx, player, tiles };
};

describe("respawn manpower", () => {
  it("gives an eliminated player the same manpower as a brand-new player", () => {
    const { ctx, player, tiles } = buildContext(12);
    respawnIfEliminated(ctx, "player-1", "eliminated-1");
    expect(tiles.get("10,10")?.ownerId).toBe("player-1");
    expect(player.manpower).toBe(createHumanRuntimePlayer("fresh").manpower);
    expect(player.manpower).toBe(STARTING_CAPITAL_MANPOWER_CAP);
  });

  it("gives a rescue respawn the same manpower as a brand-new player", () => {
    const { ctx, player } = buildContext(0);
    expect(respawnPlayerOnUnownedLand(ctx, "player-1", "rescue-1")).toBe(true);
    expect(player.manpower).toBe(STARTING_CAPITAL_MANPOWER_CAP);
  });

  it("never lowers manpower a player already holds above the starting amount", () => {
    const { ctx, player } = buildContext(STARTING_CAPITAL_MANPOWER_CAP + 50);
    respawnIfEliminated(ctx, "player-1", "eliminated-2");
    expect(player.manpower).toBe(STARTING_CAPITAL_MANPOWER_CAP + 50);
  });
});
