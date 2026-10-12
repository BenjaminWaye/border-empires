import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import { respawnPlayerOnUnownedLand, type RuntimeRespawnContext } from "../runtime-respawn-helpers.js";
import { createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// respawnPlayerOnUnownedLand (the settlement-relocation-failed / zero-income rescue respawn) lands an AFC the
// same way a fresh spawn does, so it must clear barbarians inside the AFC's reach too. It is awkward to reach
// through real commands, so drive the helper directly with a minimal in-memory context.
const buildContext = (tiles: Map<string, DomainTileState>) => {
  const events: SimulationEvent[] = [];
  const player = buildPlayer("ai-1", { isAi: true });
  const summary = createEmptyPlayerRuntimeSummary();
  const ctx: RuntimeRespawnContext = {
    now: () => 1_000,
    players: new Map([["ai-1", player]]),
    tiles,
    playerSummaries: new Map([["ai-1", summary]]),
    plannerPlayerTileCollectionVersionByPlayer: new Map(),
    pendingRespawnNoticeByPlayerId: new Map(),
    lastRespawnNoticeByPlayerId: new Map(),
    pendingSettlementsByTile: new Map(),
    locksByTile: new Map(),
    rememberedAutomationVictoryPathByPlayer: new Map(),
    summaryForPlayer: () => summary,
    setTileYieldCollectedAt: () => {},
    replaceTileState: (tileKey, tile) => {
      tiles.set(tileKey, tile);
    },
    bumpTerrainEpoch: () => {},
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
    emitEvent: (event) => {
      events.push(event);
    },
    emitPlayerStateUpdate: () => {},
    runtimeLogInfo: () => {},
    incomePerMinuteForPlayer: () => 0,
    respawnMinimumGold: 0,
    incrementAuthRecoveryRespawn: () => {},
    incrementAuthRecoveryRespawnGuarded: () => {},
    coastalLandKeys: () => new Set(),
    hasNearbySettled: () => false,
    hasNearbyTown: () => false,
    hasNearbyFood: () => false,
    claimFairSpawnSite: () => undefined,
    reachOwnerAt: () => undefined
  };
  return { ctx, events };
};

describe("respawnPlayerOnUnownedLand", () => {
  it("rejects a roster opening whose only town is reserved by another action", () => {
    const tiles = new Map<string, DomainTileState>();
    for (let y = 0; y <= 20; y += 1) for (let x = 0; x <= 20; x += 1) tiles.set(simulationTileKey(x, y), { x, y, terrain: "LAND" });
    for (const x of [13, 14, 15, 16]) tiles.get(`${x},10`)!.resource = "FARM";
    tiles.get("18,10")!.town = { type: "MARKET", populationTier: "TOWN" };
    const { ctx } = buildContext(tiles);
    ctx.pendingSettlementsByTile = new Map([["18,10", {}]]);
    let rejected = false;
    ctx.claimFairSpawnSite = (isAvailable) => {
      rejected = !isAvailable(10, 10);
      return undefined;
    };
    expect(respawnPlayerOnUnownedLand(ctx, "ai-1", "reserved-goal")).toBe(true);
    expect(rejected).toBe(true);
  });
  it("accepts qualified-site spacing at ten tiles but rejects rival opening reach", () => {
    const tiles = new Map<string, DomainTileState>();
    for (let y = 0; y <= 20; y += 1) for (let x = 0; x <= 20; x += 1) tiles.set(simulationTileKey(x, y), { x, y, terrain: "LAND" });
    for (const x of [13, 14, 15, 16]) tiles.get(`${x},10`)!.resource = "FARM";
    tiles.get("18,10")!.town = { type: "MARKET", populationTier: "TOWN" };
    const { ctx } = buildContext(tiles);
    const radii: number[] = [];
    ctx.hasNearbySettled = (_x, _y, radius) => { radii.push(radius); return radius > 10; };
    ctx.reachOwnerAt = (x, y) => x === 13 && y === 10 ? "rival" : undefined;
    let checked = false;
    ctx.claimFairSpawnSite = (isAvailable) => {
      expect(isAvailable(10, 10)).toBe(false);
      ctx.reachOwnerAt = () => undefined;
      expect(isAvailable(10, 10)).toBe(true);
      // A rival can contest the economy beyond the AFC's starting disk too.
      ctx.reachOwnerAt = (x) => x >= 14 ? "rival" : undefined;
      expect(isAvailable(10, 10)).toBe(false);
      ctx.reachOwnerAt = () => undefined;
      checked = true;
      return { x: 10, y: 10 };
    };
    expect(respawnPlayerOnUnownedLand(ctx, "ai-1", "qualified-spawn")).toBe(true);
    expect(checked).toBe(true);
    expect(radii).toContain(10);
  });
  it("releases barbarian tiles inside the new AFC's reach and reports them in the spawn's tile batch", () => {
    // A land square with one open tile in the middle; everything else is barbarian-held.
    const tiles = new Map<string, DomainTileState>();
    for (let y = 0; y <= 20; y += 1) {
      for (let x = 0; x <= 20; x += 1) {
        const open = x === 10 && y === 10;
        tiles.set(simulationTileKey(x, y), open ? { x, y, terrain: "LAND" } : { x, y, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" });
      }
    }
    const { ctx, events } = buildContext(tiles);

    expect(respawnPlayerOnUnownedLand(ctx, "ai-1", "rescue-1")).toBe(true);

    expect(tiles.get("10,10")).toMatchObject({ ownerId: "ai-1", ownershipState: "SETTLED" });
    const barbariansInReach = [...tiles.values()].filter((tile) => tile.ownerId === "barbarian-1" && Math.max(Math.abs(tile.x - 10), Math.abs(tile.y - 10)) <= 3);
    expect(barbariansInReach).toEqual([]);
    expect(tiles.get("14,10")?.ownerId).toBe("barbarian-1"); // outside the radius: untouched

    const batch = events.find((event) => event.eventType === "TILE_DELTA_BATCH");
    expect(batch && "tileDeltas" in batch ? batch.tileDeltas.length : 0).toBe(49); // AFC tile + the 48 released barbarian tiles
  });
});
