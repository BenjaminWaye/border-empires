import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import { preparePlayerRespawnNotice, respawnIfEliminated, type RuntimeRespawnContext } from "../runtime-respawn-helpers.js";
import { createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// Wipe-out detection: a player who loses their last tile is respawned with a
// notice naming who took the most of their land, and the PLAYER_RESPAWNED
// message carries the new start for the gateway's "empire fell" email.
const buildContext = (topCaptor: string | undefined) => {
  const tiles = new Map<string, DomainTileState>();
  for (let y = 0; y <= 20; y += 1) for (let x = 0; x <= 20; x += 1) tiles.set(simulationTileKey(x, y), { x, y, terrain: "LAND" });
  const summary = createEmptyPlayerRuntimeSummary();
  const events: SimulationEvent[] = [];
  const ctx: RuntimeRespawnContext = {
    now: () => 1_000,
    players: new Map([["player-1", buildPlayer("player-1", { manpower: 0 })]]),
    tiles,
    playerSummaries: new Map([["player-1", summary]]),
    plannerPlayerTileCollectionVersionByPlayer: new Map(),
    pendingRespawnNoticeByPlayerId: new Map(),
    lastRespawnNoticeByPlayerId: new Map(),
    pendingSettlementsByTile: new Map(),
    locksByTile: new Map(),
    rememberedAutomationVictoryPathByPlayer: new Map(),
    summaryForPlayer: () => summary,
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
    claimFairSpawnSite: () => ({ x: 10, y: 12 }),
    reachOwnerAt: () => undefined,
    topCaptorOf: () => topCaptor
  };
  const respawnedPayload = (): Record<string, unknown> | undefined => {
    const event = events.find((candidate) => candidate.eventType === "PLAYER_MESSAGE" && candidate.messageType === "PLAYER_RESPAWNED");
    return event && "payloadJson" in event ? (JSON.parse(event.payloadJson) as Record<string, unknown>) : undefined;
  };
  return { ctx, respawnedPayload };
};

describe("empire fell respawn notice", () => {
  it("names who took the most and where the new start is", () => {
    const { ctx, respawnedPayload } = buildContext("ai-4");
    respawnIfEliminated(ctx, "player-1", "lock-1");
    const notice = ctx.lastRespawnNoticeByPlayerId.get("player-1");
    expect(notice).toMatchObject({ reasonCode: "eliminated", fellToPlayerId: "ai-4", spawnTileKey: "10,12" });
    expect(respawnedPayload()).toEqual({ reason: "eliminated", x: 10, y: 12, fellToPlayerId: "ai-4" });
  });

  it("does not respawn or notify a player who still holds land", () => {
    const { ctx, respawnedPayload } = buildContext("ai-4");
    ctx.summaryForPlayer("player-1").territoryTileKeys.add("3,3");
    respawnIfEliminated(ctx, "player-1", "lock-2");
    expect(ctx.lastRespawnNoticeByPlayerId.has("player-1")).toBe(false);
    expect(respawnedPayload()).toBeUndefined();
  });

  it("marks a withdrawal and names no captor", () => {
    const { ctx, respawnedPayload } = buildContext("ai-4");
    preparePlayerRespawnNotice(ctx, "player-1", "eliminated", "withdraw-1", { withdrawn: true });
    respawnIfEliminated(ctx, "player-1", "withdraw-1");
    expect(ctx.lastRespawnNoticeByPlayerId.get("player-1")?.fellToPlayerId).toBeUndefined();
    expect(respawnedPayload()).toEqual({ reason: "eliminated", x: 10, y: 12, withdrawn: true });
  });

  it("names no captor for a recovery respawn", () => {
    const { ctx } = buildContext("ai-4");
    preparePlayerRespawnNotice(ctx, "player-1", "auth_recovery", "login");
    expect(ctx.pendingRespawnNoticeByPlayerId.get("player-1")?.fellToPlayerId).toBeUndefined();
  });
});
