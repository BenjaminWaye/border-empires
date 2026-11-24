import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import { ensurePlayerHasSpawnTerritory, preparePlayerRespawnNotice, respawnIfEliminated, type RuntimeRespawnContext } from "../runtime-respawn-helpers.js";
import { createEmptyPlayerRuntimeSummary, type PlayerRuntimeSummary } from "../player-runtime-summary.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// Redeploys after a knock-out are counted per House for the season awards
// (shared season-awards.ts). A first landing and a voluntary Withdraw and
// redeploy are not redeploys.
const buildContext = (options: { siteFree?: () => boolean } = {}) => {
  const tiles = new Map<string, DomainTileState>();
  for (let y = 0; y <= 20; y += 1) for (let x = 0; x <= 20; x += 1) tiles.set(simulationTileKey(x, y), { x, y, terrain: "LAND" });
  const summaries = new Map<string, PlayerRuntimeSummary>([["player-1", createEmptyPlayerRuntimeSummary()]]);
  const events: SimulationEvent[] = [];
  const ctx: RuntimeRespawnContext = {
    now: () => 1_000,
    players: new Map([["player-1", buildPlayer("player-1", { manpower: 0 })]]),
    tiles,
    playerSummaries: summaries,
    plannerPlayerTileCollectionVersionByPlayer: new Map(),
    pendingRespawnNoticeByPlayerId: new Map(),
    lastRespawnNoticeByPlayerId: new Map(),
    pendingSettlementsByTile: new Map(),
    locksByTile: new Map(),
    rememberedAutomationVictoryPathByPlayer: new Map(),
    summaryForPlayer: (playerId) => {
      const summary = summaries.get(playerId) ?? createEmptyPlayerRuntimeSummary();
      summaries.set(playerId, summary);
      return summary;
    },
    replaceTileState: (tileKey, tile) => void tiles.set(tileKey, tile),
    bumpTerrainEpoch: () => {},
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
    emitEvent: (event) => void events.push(event),
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
    claimFairSpawnSite: () => ((options.siteFree?.() ?? true) ? { x: 10, y: 12 } : undefined),
    reachOwnerAt: () => undefined,
    topCaptorOf: () => undefined
  };
  const redeployBatches = (): number => events.filter((event) => event.eventType === "TILE_DELTA_BATCH" && (event.redeployPlayerIds?.length ?? 0) > 0).length;
  const redeploys = (playerId = "player-1"): number | undefined => ctx.players.get(playerId)?.redeploys;
  /** Takes the House's land away again so the next knock-out can land. */
  const loseLanding = (): void => void tiles.set(simulationTileKey(10, 12), { x: 10, y: 12, terrain: "LAND" });
  return { ctx, redeployBatches, redeploys, loseLanding };
};

describe("redeploy counting", () => {
  it("counts each landing after a knock-out and marks its tile batch for recovery", () => {
    const { ctx, redeployBatches, redeploys, loseLanding } = buildContext();
    respawnIfEliminated(ctx, "player-1", "lock-1");
    expect(redeploys()).toBe(1);
    loseLanding();
    respawnIfEliminated(ctx, "player-1", "lock-2");
    expect(redeploys()).toBe(2);
    expect(redeployBatches()).toBe(2);
  });

  it("does not count a voluntary Withdraw and redeploy", () => {
    const { ctx, redeployBatches, redeploys } = buildContext();
    preparePlayerRespawnNotice(ctx, "player-1", "eliminated", "withdraw-1", { wasOnline: true, withdrawn: true });
    respawnIfEliminated(ctx, "player-1", "withdraw-1", { voluntary: true });
    expect(ctx.tiles.get(simulationTileKey(10, 12))?.ownerId).toBe("player-1");
    expect(redeploys()).toBeUndefined();
    expect(redeployBatches()).toBe(0);
  });

  it("does not count a new House's first landing", () => {
    const { ctx, redeployBatches, redeploys } = buildContext();
    expect(ensurePlayerHasSpawnTerritory(ctx, "newcomer")).toBe(true);
    expect(redeploys("newcomer")).toBeUndefined();
    expect(redeployBatches()).toBe(0);
  });

  it("does not count a knock-out that found no landing site until the House actually lands", () => {
    let siteFree = false;
    const { ctx, redeployBatches, redeploys } = buildContext({ siteFree: () => siteFree });
    for (const [key, tile] of ctx.tiles) ctx.tiles.set(key, { ...tile, ownerId: "rival", ownershipState: "SETTLED" });
    respawnIfEliminated(ctx, "player-1", "lock-1");
    expect(redeploys()).toBeUndefined();
    siteFree = true;
    ctx.tiles.set(simulationTileKey(10, 12), { x: 10, y: 12, terrain: "LAND" });
    // The sign-in recovery landing completes the redeploy that was waiting.
    expect(ensurePlayerHasSpawnTerritory(ctx, "player-1")).toBe(true);
    expect(redeploys()).toBe(1);
    expect(redeployBatches()).toBe(1);
  });
});
