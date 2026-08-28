import { describe, expect, it, vi } from "vitest";
import { COMBAT_LOCK_MS, structureBuildDurationMs } from "@border-empires/shared";
import { STARTING_CAPITAL_MANPOWER_CAP, STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE, SIPHON_CRYSTAL_COST, SIPHON_DURATION_MS, TOWN_BASE_GOLD_PER_MIN, TOWN_MANPOWER_BY_TIER } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { createPlayersFromRecoveredState } from "../runtime-hydration.js";
import { buildAiOpponent, buildPlayer, collectEvents, testRuntimePlayer } from "./runtime.test-helpers.js";

type SimulationRuntimeEventShape = SimulationEvent;

describe("simulation runtime", () => {
  it("applyPassiveIncome credits gold proportional to elapsed time for active players", () => {
    const startMs = 1_000_000;
    const elapsedMs = 60_000; // 1 minute
    const runtime = new SimulationRuntime({
      now: () => startMs,
      initialPlayers: new Map([["player-1", testRuntimePlayer("player-1", { points: 0 })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "SETTLEMENT", name: "Gold Town" }
          }
        ],
        activeLocks: []
      }
    });
    // Mark player as recently active
    runtime.updatePlayerLastActive("player-1", startMs);
    // Seed the income tick anchor
    runtime.applyPassiveIncome(startMs, 12 * 60 * 60 * 1000);
    const playerBefore = runtime.exportState().players.find((entry) => entry.id === "player-1");
    const pointsBefore = playerBefore?.points ?? 0;
    // Apply income for 1 minute elapsed
    runtime.applyPassiveIncome(startMs + elapsedMs, 12 * 60 * 60 * 1000);
    const playerAfter = runtime.exportState().players.find((entry) => entry.id === "player-1");
    // Should have earned some gold (town produces gold per minute)
    expect(playerAfter?.points ?? 0).toBeGreaterThan(pointsBefore);
  });

  it("applyPassiveIncome skips inactive players beyond the inactivity cap", () => {
    const startMs = 1_000_000;
    const inactivityCapMs = 60_000; // 1 minute cap for this test
    const runtime = new SimulationRuntime({
      now: () => startMs,
      initialPlayers: new Map([["player-1", testRuntimePlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "SETTLEMENT", name: "Gold Town" }
          }
        ],
        activeLocks: []
      }
    });
    // Player was last active 2 minutes ago (exceeds 1 minute cap)
    runtime.updatePlayerLastActive("player-1", startMs - 2 * inactivityCapMs);
    // Seed the income tick anchor
    runtime.applyPassiveIncome(startMs - 60_000, inactivityCapMs);
    const playerBefore = runtime.exportState().players.find((entry) => entry.id === "player-1");
    const pointsBefore = playerBefore?.points ?? 0;
    // Apply income — player is inactive so should be skipped
    runtime.applyPassiveIncome(startMs, inactivityCapMs);
    const playerAfter = runtime.exportState().players.find((entry) => entry.id === "player-1");
    expect(playerAfter?.points ?? 0).toBe(pointsBefore);
  });

  it("COLLECT_VISIBLE command emits COLLECT_RESULT", async () => {
    const nowMs = Date.now();
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([["player-1", testRuntimePlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "SETTLEMENT", name: "Gold Town" }
          }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);
    runtime.submitCommand({
      commandId: "collect-visible-gone",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: nowMs,
      type: "COLLECT_VISIBLE",
      payloadJson: "{}"
    });
    await Promise.resolve();
    expect(seen.some((event) => event.eventType === "COLLECT_RESULT")).toBe(true);
  });

  it("syncs gateway alliance changes into runtime player state", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1")],
        ["player-2", buildPlayer("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "sync-alliance-1",
      sessionId: "system-runtime:social",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 1_000,
      type: "SYNC_ALLIANCE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2", allied: true })
    });
    await Promise.resolve();

    expect(runtime.exportState().players.find((player) => player.id === "player-1")?.allies).toEqual(["player-2"]);
    expect(runtime.exportState().players.find((player) => player.id === "player-2")?.allies).toEqual(["player-1"]);
    expect(seen).toContainEqual(
      expect.objectContaining({
        eventType: "PLAYER_MESSAGE",
        messageType: "SOCIAL_STATE_SYNCED"
      })
    );

    runtime.submitCommand({
      commandId: "sync-alliance-2",
      sessionId: "system-runtime:social",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 2_000,
      type: "SYNC_ALLIANCE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2", allied: false })
    });
    await Promise.resolve();

    expect(runtime.exportState().players.find((player) => player.id === "player-1")?.allies).toEqual([]);
    expect(runtime.exportState().players.find((player) => player.id === "player-2")?.allies).toEqual([]);
  });

  it("spawns a settled tile for unknown subscribed players", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 10, y: 11, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });

    const changed = runtime.ensurePlayerHasSpawnTerritory("firebase-user-1");
    expect(changed).toBe(true);

    const state = runtime.exportState();
    expect(state.players.some((player) => player.id === "firebase-user-1")).toBe(true);
    const spawnedTile = state.tiles.find((tile) => tile.x === 10 && tile.y === 11 && tile.ownerId === "firebase-user-1");
    const spawnedTown = spawnedTile?.townJson ? JSON.parse(spawnedTile.townJson) : undefined;
    expect(spawnedTile).toEqual(
      expect.objectContaining({
        ownershipState: "SETTLED",
        townType: "FARMING",
        townPopulationTier: "SETTLEMENT"
      })
    );
    expect(spawnedTown).toEqual(
      expect.objectContaining({
        populationTier: "SETTLEMENT",
        population: 800,
        maxPopulation: 10_000_000
      })
    );
  });

  it("does not respawn players that already have territory", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 10, y: 11, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });

    const changed = runtime.ensurePlayerHasSpawnTerritory("player-1");
    expect(changed).toBe(false);

    const state = runtime.exportState();
    expect(state.tiles.filter((tile) => tile.ownerId === "player-1")).toHaveLength(1);
  });

  it("does not respawn (world-sanity guard) when the world tile map is empty", () => {
    // Regression: territoryTiles reads 0 from the same in-memory ctx.tiles map
    // that backs every ownership check. If the world itself never loaded
    // (e.g. a stale/incomplete startup recovery), that zero is not
    // trustworthy — placing a fresh auth_recovery spawn here would silently
    // overwrite the player's real empire once the world does load. See
    // ensurePlayerHasSpawnTerritory's world-sanity guard.
    let guardedCount = 0;
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialState: { tiles: [], activeLocks: [] },
      onAuthRecoveryRespawnGuarded: () => { guardedCount += 1; }
    });

    const respawned = runtime.ensurePlayerHasSpawnTerritory("returning-human");
    expect(respawned).toBe(false);
    expect(guardedCount).toBe(1);

    const state = runtime.exportState();
    expect(state.tiles.filter((tile) => tile.ownerId === "returning-human")).toHaveLength(0);
  });

  it("still respawns a genuinely zero-territory player when the world is populated", () => {
    // The legitimate case the guard must not break: an existing/new player
    // with no owned tiles reconnecting into a healthy, populated world.
    let respawnCount = 0;
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 10, y: 11, terrain: "LAND" }
        ],
        activeLocks: []
      },
      onAuthRecoveryRespawn: () => { respawnCount += 1; }
    });

    const respawned = runtime.ensurePlayerHasSpawnTerritory("firebase-user-1");
    expect(respawned).toBe(true);
    expect(respawnCount).toBe(1);

    const state = runtime.exportState();
    expect(state.tiles.some((tile) => tile.ownerId === "firebase-user-1")).toBe(true);
  });

  it("preserves recovered territory for a returning player missing from initialState.players", () => {
    // Regression: after a sim restart, recovery rebuilds per-player tile
    // summaries via lazy applyTileToPlayerSummaries even when the human
    // player isn't listed in the snapshot's `players` array. The previous
    // ensurePlayerHasSpawnTerritory path overwrote that lazily-populated
    // summary with an empty one, then immediately observed zero territory
    // and forced an unwanted respawn.
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 5, y: 5, terrain: "LAND", ownerId: "returning-human", ownershipState: "SETTLED" },
          { x: 5, y: 6, terrain: "LAND", ownerId: "returning-human", ownershipState: "FRONTIER" },
          { x: 6, y: 5, terrain: "LAND", ownerId: "returning-human", ownershipState: "SETTLED" }
        ],
        activeLocks: [],
        players: []
      }
    });

    const respawned = runtime.ensurePlayerHasSpawnTerritory("returning-human");
    expect(respawned).toBe(false);

    const state = runtime.exportState();
    const ownedTiles = state.tiles.filter((tile) => tile.ownerId === "returning-human");
    expect(ownedTiles).toHaveLength(3);
    expect(ownedTiles.find((tile) => tile.x === 5 && tile.y === 5)?.ownershipState).toBe("SETTLED");
    expect(ownedTiles.find((tile) => tile.x === 5 && tile.y === 6)?.ownershipState).toBe("FRONTIER");
    expect(ownedTiles.find((tile) => tile.x === 6 && tile.y === 5)?.ownershipState).toBe("SETTLED");
  });

  it("clears remembered automation victory paths when a player respawns from zero territory", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { isAi: true })]
      ]),
      seedTiles: new Map([
        ["10,10", { x: 10, y: 10, terrain: "LAND" }],
        ["10,11", { x: 10, y: 11, terrain: "LAND" }]
      ]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND" },
          { x: 10, y: 11, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });

    (
      runtime as unknown as {
        rememberedAutomationVictoryPathByPlayer: Map<string, "TOWN_CONTROL" | "DIPLOMATIC_DOMINANCE" | "ECONOMIC_HEGEMONY">;
      }
    ).rememberedAutomationVictoryPathByPlayer.set("player-1", "TOWN_CONTROL");

    expect(runtime.ensurePlayerHasSpawnTerritory("player-1")).toBe(true);
    expect(
      (
        runtime as unknown as {
          rememberedAutomationVictoryPathByPlayer: Map<string, "TOWN_CONTROL" | "DIPLOMATIC_DOMINANCE" | "ECONOMIC_HEGEMONY">;
        }
      ).rememberedAutomationVictoryPathByPlayer.get("player-1")
    ).toBeUndefined();
  });

  it("clears remembered automation victory paths when planning a player with no territory", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { isAi: true })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [],
        activeLocks: []
      }
    });

    (
      runtime as unknown as {
        rememberedAutomationVictoryPathByPlayer: Map<string, "TOWN_CONTROL" | "DIPLOMATIC_DOMINANCE" | "ECONOMIC_HEGEMONY">;
      }
    ).rememberedAutomationVictoryPathByPlayer.set("player-1", "ECONOMIC_HEGEMONY");

    runtime.explainNextAutomationCommand("player-1", 1, 1_000, "ai-runtime");

    expect(
      (
        runtime as unknown as {
          rememberedAutomationVictoryPathByPlayer: Map<string, "TOWN_CONTROL" | "DIPLOMATIC_DOMINANCE" | "ECONOMIC_HEGEMONY">;
        }
      ).rememberedAutomationVictoryPathByPlayer.get("player-1")
    ).toBeUndefined();
  });

  it("regenerates manpower from elapsed time before exporting player state", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 0, manpowerUpdatedAt: 0, manpowerCapSnapshot: STARTING_CAPITAL_MANPOWER_CAP })]
      ]),
      seedTiles: new Map(),
      initialState: { tiles: [], activeLocks: [] }
    });

    const player = runtime.exportState().players.find((entry) => entry.id === "player-1");
    expect(player?.manpower).toBe(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE);
  });

  it("emits town-scaled manpower regen and breakdown in player updates", async () => {
    let currentNow = 60_000;
    const runtime = new SimulationRuntime({
      now: () => currentNow,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 0, manpowerUpdatedAt: 0, manpowerCapSnapshot: STARTING_CAPITAL_MANPOWER_CAP })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Alpha", type: "MARKET", populationTier: "SETTLEMENT", goldPerMinute: 1 }
          },
          {
            x: 11,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Beta", type: "MARKET", populationTier: "SETTLEMENT", goldPerMinute: 1 }
          }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "collect-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 60_000,
      type: "COLLECT_TILE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });

    await Promise.resolve();

    const playerUpdateEvent = seen.find(
      (event): event is Extract<SimulationRuntimeEventShape, { eventType: "PLAYER_MESSAGE" }> =>
        event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE"
    );
    expect(playerUpdateEvent).toBeDefined();
    const payload = JSON.parse(playerUpdateEvent!.payloadJson) as {
      manpower: number;
      manpowerCap: number;
      manpowerRegenPerMinute: number;
      manpowerBreakdown: { cap: Array<{ label: string; amount: number }>; regen: Array<{ label: string; amount: number }> };
    };
    const settlementCap = TOWN_MANPOWER_BY_TIER.SETTLEMENT.cap;
    const settlementRegen = TOWN_MANPOWER_BY_TIER.SETTLEMENT.regenPerMinute;
    expect(payload.manpowerCap).toBe(STARTING_CAPITAL_MANPOWER_CAP + settlementCap * 2); // starting capital (§4.3) is additive on top of town cap/regen
    expect(payload.manpowerRegenPerMinute).toBe(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE + settlementRegen * 2);
    expect(payload.manpowerBreakdown.cap).toEqual([{ label: "Starting Capital", amount: STARTING_CAPITAL_MANPOWER_CAP }, { label: "2 Settlements", amount: settlementCap * 2 }]);
    expect(payload.manpowerBreakdown.regen).toEqual([{ label: "Starting Capital", amount: STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE }, { label: "2 Settlements", amount: settlementRegen * 2 }]);

    currentNow = 120_000;
    runtime.submitCommand({
      commandId: "collect-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 120_000,
      type: "COLLECT_TILE",
      payloadJson: JSON.stringify({ x: 11, y: 10 })
    });

    await Promise.resolve();

    const secondPlayerUpdateEvent = seen
      .slice()
      .reverse()
      .find(
        (event): event is Extract<SimulationRuntimeEventShape, { eventType: "PLAYER_MESSAGE" }> =>
          event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE"
      );
    const secondPayload = JSON.parse(secondPlayerUpdateEvent!.payloadJson) as { manpower: number };
    expect(secondPayload.manpower - payload.manpower).toBeCloseTo(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE + settlementRegen * 2, 10); // starting capital's regen (§4.3) too
  });

  it("does not grant town manpower boosts while a claimed town tile is still frontier", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 0, manpowerUpdatedAt: 0, manpowerCapSnapshot: STARTING_CAPITAL_MANPOWER_CAP })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER",
            town: { name: "Claimed", type: "MARKET", populationTier: "TOWN", goldPerMinute: 2 }
          }
        ],
        activeLocks: []
      }
    });
    const player = runtime.exportState().players.find((entry) => entry.id === "player-1");

    expect(player?.manpowerCap).toBe(STARTING_CAPITAL_MANPOWER_CAP);
    expect(player?.manpowerRegenPerMinute).toBe(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE);
    expect(player?.manpowerBreakdown).toEqual({
      cap: [{ label: "Starting Capital", amount: STARTING_CAPITAL_MANPOWER_CAP }],
      regen: [{ label: "Starting Capital", amount: STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE }]
    });
    expect(player?.ownedTownTileKeys).toEqual([]);
    expect(player?.townCount).toBe(0);
  });

  it("uses explicit plural labels for high-tier manpower breakdown groups", async () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 0, manpowerUpdatedAt: 0, manpowerCapSnapshot: 6_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "MARKET", populationTier: "GREAT_CITY", goldPerMinute: 1 }
          },
          {
            x: 11,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "MARKET", populationTier: "GREAT_CITY", goldPerMinute: 1 }
          },
          {
            x: 12,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "MARKET", populationTier: "METROPOLIS", goldPerMinute: 1 }
          },
          {
            x: 13,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "MARKET", populationTier: "METROPOLIS", goldPerMinute: 1 }
          }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "collect-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 60_000,
      type: "COLLECT_TILE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });

    await Promise.resolve();

    const playerUpdateEvent = seen.find(
      (event): event is Extract<SimulationRuntimeEventShape, { eventType: "PLAYER_MESSAGE" }> =>
        event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE"
    );
    const payload = JSON.parse(playerUpdateEvent!.payloadJson) as {
      manpowerBreakdown: { cap: Array<{ label: string; amount: number }>; regen: Array<{ label: string; amount: number }> };
    };
    expect(payload.manpowerBreakdown.cap.map((line) => line.label)).toEqual(["Starting Capital", "2 Great Cities", "2 Metropolises"]);
    expect(payload.manpowerBreakdown.regen.map((line) => line.label)).toEqual(["Starting Capital", "2 Great Cities", "2 Metropolises"]);
  });

  it("exports only the player's visible tiles for bootstrap snapshots", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 100 })],
        ["player-2", buildPlayer("player-2", { manpower: 100 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND" },
          { x: 30, y: 30, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const visibleState = runtime.exportVisibleStateForPlayer("player-1");

    expect(visibleState.tiles).toEqual([
      expect.objectContaining({ x: 10, y: 10, ownerId: "player-1", ownershipState: "SETTLED" }),
      expect.objectContaining({ x: 11, y: 10, terrain: "LAND" })
    ]);
    expect(visibleState.tiles.some((tile) => tile.x === 30 && tile.y === 30)).toBe(false);
  });

  it("restores an active Relay Beacon's vision bonus into the coverage cache on boot", () => {
    // Simulates a server restart: the outpost was already active before this
    // SimulationRuntime instance was constructed, so its vision bonus must be
    // re-applied while indexing tiles, not just when the outpost is built.
    // The bonus lives in the refcounted visibilityCoverage cache (consumed by
    // filterTileDeltasForPlayer), not the territorial vision-expansion cache
    // used by exportVisibleStateForPlayer.
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 100 })],
        ["player-2", buildPlayer("player-2", { manpower: 100 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 60,
            y: 60,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "RELAY_BEACON", status: "active" }
          },
          { x: 65, y: 60, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          { x: 66, y: 60, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const deltas = [
      // 5 tiles from the outpost — only reachable via RELAY_BEACON_VISION_BONUS
      // (5), not player-1's base territory radius (the outpost tile itself is
      // player-1's only territory).
      { x: 65, y: 60, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "SETTLED" },
      // 6 tiles from the outpost — outside even the bonus radius.
      { x: 66, y: 60, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "SETTLED" }
    ];

    const filtered = runtime.filterTileDeltasForPlayer(deltas, "player-1");

    expect(filtered.some((delta) => delta.x === 65 && delta.y === 60)).toBe(true);
    expect(filtered.some((delta) => delta.x === 66 && delta.y === 60)).toBe(false);
  });

  it("returns vision around owned tiles when the player has no live row in this.players (fog admin)", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map(),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "fog-admin", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND" },
          { x: 30, y: 30, terrain: "LAND", ownerId: "other-player", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const visibleState = runtime.exportVisibleStateForPlayer("fog-admin");

    expect(visibleState.tiles.some((tile) => tile.x === 10 && tile.y === 10 && tile.ownerId === "fog-admin")).toBe(true);
    expect(visibleState.tiles.some((tile) => tile.x === 11 && tile.y === 10)).toBe(true);
    expect(visibleState.tiles.some((tile) => tile.x === 30 && tile.y === 30)).toBe(false);
  });

  it("redacts opponent settled state on lock-target tiles outside the viewer's vision", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 100 })],
        ["player-2", buildPlayer("player-2", { manpower: 100 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          {
            x: 50,
            y: 50,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            town: { type: "FARMING", name: "Hidden Town", populationTier: "SETTLEMENT", population: 800, maxPopulation: 10_000_000 },
            fort: { ownerId: "player-2", status: "active" }
          },
          { x: 51, y: 50, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: [
          {
            commandId: "lock-1",
            playerId: "player-1",
            actionType: "ATTACK",
            originX: 10,
            originY: 10,
            targetX: 50,
            targetY: 50,
            originKey: "10,10",
            targetKey: "50,50",
            resolvesAt: 120_000
          }
        ]
      }
    });

    const visibleState = runtime.exportVisibleStateForPlayer("player-1");
    const lockTargetTile = visibleState.tiles.find((tile) => tile.x === 50 && tile.y === 50);

    expect(lockTargetTile).toEqual({ x: 50, y: 50, terrain: "LAND" });
    expect(lockTargetTile).not.toHaveProperty("ownerId");
    expect(lockTargetTile).not.toHaveProperty("ownershipState");
    expect(lockTargetTile).not.toHaveProperty("townJson");
    expect(lockTargetTile).not.toHaveProperty("fortJson");
    // Adjacent enemy settled tile (51,50) was never revealed by anything → should not appear at all.
    expect(visibleState.tiles.some((tile) => tile.x === 51 && tile.y === 50)).toBe(false);
  });

  it("emits visibility audit samples attributing each opponent tile to its reveal source", () => {
    const audits: { playerId: string; tileKey: string; reasons: string[]; redacted: boolean }[] = [];
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      onVisibilityAudit: (sample) =>
        audits.push({ playerId: sample.playerId, tileKey: sample.tileKey, reasons: sample.reasons, redacted: sample.redacted }),
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 100 })],
        ["player-2", buildPlayer("player-2", { manpower: 100 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          { x: 50, y: 50, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: [
          {
            commandId: "lock-1",
            playerId: "player-1",
            actionType: "ATTACK",
            originX: 10,
            originY: 10,
            targetX: 50,
            targetY: 50,
            originKey: "10,10",
            targetKey: "50,50",
            resolvesAt: 120_000
          }
        ]
      }
    });

    runtime.exportVisibleStateForPlayer("player-1");

    const radiusAudit = audits.find((entry) => entry.tileKey === "11,10");
    expect(radiusAudit).toBeDefined();
    expect(radiusAudit?.playerId).toBe("player-1");
    expect(radiusAudit?.reasons).toEqual(["radius:self"]);
    expect(radiusAudit?.redacted).toBe(false);

    const lockTargetAudit = audits.find((entry) => entry.tileKey === "50,50");
    expect(lockTargetAudit).toBeDefined();
    expect(lockTargetAudit?.reasons).toEqual(["lock-target"]);
    expect(lockTargetAudit?.redacted).toBe(true);

    expect(audits.every((entry) => entry.reasons.length > 0)).toBe(true);
  });

  it("filterTileDeltasForPlayer drops opponent tiles outside the viewer's vision", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 100 })],
        ["player-2", buildPlayer("player-2", { manpower: 100 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          { x: 50, y: 50, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const deltas = [
      // Player-2 settled a fort on a tile far from player-1's territory.
      {
        x: 50,
        y: 50,
        terrain: "LAND" as const,
        ownerId: "player-2",
        ownershipState: "SETTLED",
        fortJson: JSON.stringify({ ownerId: "player-2", status: "active" })
      },
      // Player-2 captured a tile inside player-1's vision radius.
      {
        x: 11,
        y: 10,
        terrain: "LAND" as const,
        ownerId: "player-2",
        ownershipState: "SETTLED",
        townJson: JSON.stringify({ type: "MARKET", populationTier: "SETTLEMENT" })
      },
      // Player-1's own tile yield update.
      {
        x: 10,
        y: 10,
        terrain: "LAND" as const,
        ownerId: "player-1",
        ownershipState: "SETTLED"
      }
    ];

    const filtered = runtime.filterTileDeltasForPlayer(deltas, "player-1");

    expect(filtered.map((delta) => `${delta.x},${delta.y}`).sort()).toEqual(["10,10", "11,10"]);
    expect(filtered.some((delta) => delta.x === 50 && delta.y === 50)).toBe(false);
    const ownDelta = filtered.find((delta) => delta.x === 10 && delta.y === 10);
    expect(ownDelta?.ownerId).toBe("player-1");
    const visibleOpponent = filtered.find((delta) => delta.x === 11 && delta.y === 10);
    expect(visibleOpponent?.townJson).toEqual(expect.any(String));
  });

  it("filterTileDeltasForPlayer redacts lock-target opponent deltas to terrain-only stubs", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 100 })],
        ["player-2", buildPlayer("player-2", { manpower: 100 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 50, y: 50, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: [
          {
            commandId: "lock-1",
            playerId: "player-1",
            actionType: "ATTACK",
            originX: 10,
            originY: 10,
            targetX: 50,
            targetY: 50,
            originKey: "10,10",
            targetKey: "50,50",
            resolvesAt: 120_000
          }
        ]
      }
    });

    const deltas = [
      {
        x: 50,
        y: 50,
        terrain: "LAND" as const,
        ownerId: "player-2",
        ownershipState: "SETTLED",
        townJson: JSON.stringify({ type: "MARKET", populationTier: "SETTLEMENT" }),
        fortJson: JSON.stringify({ ownerId: "player-2", status: "active" })
      }
    ];

    const filtered = runtime.filterTileDeltasForPlayer(deltas, "player-1");

    expect(filtered).toHaveLength(1);
    const stub = filtered[0];
    expect(stub).toEqual({ x: 50, y: 50, terrain: "LAND" });
    expect(stub).not.toHaveProperty("ownerId");
    expect(stub).not.toHaveProperty("townJson");
    expect(stub).not.toHaveProperty("fortJson");
  });

  it("filterTileDeltasForPlayer returns disjoint visible sets for three subscribers viewing the same delta batch", () => {
    const makePlayer = (id: string) => ({
      id,
      isAi: false,
      points: 100,
      manpower: 100,
      techIds: new Set<string>(),
      domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      techRootId: "rewrite-local",
      allies: new Set<string>()
    });
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", makePlayer("player-1")],
        ["player-2", makePlayer("player-2")],
        ["player-3", makePlayer("player-3")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          // Each player owns one isolated tile so their vision radius is
          // confined to that region. Crucially, no player owns anything in
          // another region, so cross-region tile activity should be invisible.
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 100, y: 100, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          { x: 200, y: 200, terrain: "LAND", ownerId: "player-3", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    // Three hypothetical opponent settlements, one in each region. The
    // classifier reads simulator state (which says each player owns only
    // their own region), so the post-flip ownerId attached to each delta
    // doesn't grant retroactive vision.
    const deltas = [
      { x: 11, y: 10, terrain: "LAND" as const, ownerId: "player-3", ownershipState: "SETTLED", townJson: "{}" },
      { x: 101, y: 100, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED", townJson: "{}" },
      { x: 201, y: 200, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "SETTLED", townJson: "{}" }
    ];

    const p1Filtered = runtime.filterTileDeltasForPlayer(deltas, "player-1");
    const p2Filtered = runtime.filterTileDeltasForPlayer(deltas, "player-2");
    const p3Filtered = runtime.filterTileDeltasForPlayer(deltas, "player-3");

    // Each subscriber sees exactly the one delta in their vision radius and
    // no others — proving the leak from cross-region opponent activity is
    // closed even with multiple subscribers in a single batch.
    expect(p1Filtered.map((delta) => `${delta.x},${delta.y}`)).toEqual(["11,10"]);
    expect(p2Filtered.map((delta) => `${delta.x},${delta.y}`)).toEqual(["101,100"]);
    expect(p3Filtered.map((delta) => `${delta.x},${delta.y}`)).toEqual(["201,200"]);
  });

  it("filterTileDeltasForPlayer eager and lazy paths agree on large delta batches", () => {
    // The eager fast path kicks in when tileDeltas.length >= 16. This test
    // builds a batch large enough to trip the threshold and confirms the
    // visible-set output matches the lazy path on a smaller slice (R=1, so
    // tiles at Chebyshev distance ≤ 1 from an owned tile are visible).
    const makePlayer = (id: string) => ({
      id,
      isAi: false,
      points: 100,
      manpower: 100,
      techIds: new Set<string>(),
      domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      techRootId: "rewrite-local",
      allies: new Set<string>()
    });
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", makePlayer("player-1")],
        ["player-2", makePlayer("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 100, y: 100, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    // Build 25 deltas: mix of tiles inside player-1's vision (Chebyshev ≤ 1
    // from 10,10) and tiles outside it. The eager path must drop the same
    // tiles as the lazy path would.
    const deltas: Array<{ x: number; y: number; terrain: "LAND"; ownerId: string; ownershipState: "SETTLED" }> = [];
    for (let dx = -6; dx <= 6; dx += 1) {
      deltas.push({ x: 10 + dx, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" });
    }
    // 12 far-away tiles that should never be visible.
    for (let i = 0; i < 12; i += 1) {
      deltas.push({ x: 200 + i, y: 200, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" });
    }
    expect(deltas.length).toBeGreaterThanOrEqual(16);

    const filtered = runtime.filterTileDeltasForPlayer(deltas, "player-1");
    const visibleXs = filtered.map((delta) => delta.x).sort((a, b) => a - b);
    // Player-1 owns (10,10) with vision radius 1 → x in [9..11] visible at y=10.
    expect(visibleXs).toEqual([9, 10, 11]);
    expect(filtered.some((delta) => delta.y === 200)).toBe(false);
  });

  it("does not redact lock-target tiles already covered by territory vision", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 100 })],
        ["player-2", buildPlayer("player-2", { manpower: 100 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          {
            x: 11,
            y: 10,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            town: { type: "FARMING", name: "Adjacent Town", populationTier: "SETTLEMENT", population: 800, maxPopulation: 10_000_000 }
          }
        ],
        activeLocks: [
          {
            commandId: "lock-2",
            playerId: "player-1",
            actionType: "ATTACK",
            originX: 10,
            originY: 10,
            targetX: 11,
            targetY: 10,
            originKey: "10,10",
            targetKey: "11,10",
            resolvesAt: 120_000
          }
        ]
      }
    });

    const visibleState = runtime.exportVisibleStateForPlayer("player-1");
    const adjacentTile = visibleState.tiles.find((tile) => tile.x === 11 && tile.y === 10);

    expect(adjacentTile).toEqual(
      expect.objectContaining({ ownerId: "player-2", ownershipState: "SETTLED", townJson: expect.any(String) })
    );
  });

  it("reveals a linked dock when the player owns the source dock", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 100 })]
      ]),
      seedTiles: new Map(),
      seedDocks: [
        { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
        { dockId: "dock-b", tileKey: "80,80", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
      ],
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", dockId: "dock-a" },
          { x: 79, y: 79, terrain: "LAND" },
          { x: 80, y: 79, terrain: "LAND" },
          { x: 81, y: 79, terrain: "LAND" },
          { x: 79, y: 80, terrain: "LAND" },
          { x: 80, y: 80, terrain: "LAND", dockId: "dock-b" },
          { x: 81, y: 80, terrain: "LAND" },
          { x: 79, y: 81, terrain: "LAND" },
          { x: 80, y: 81, terrain: "LAND" },
          { x: 81, y: 81, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });

    const visibleState = runtime.exportVisibleStateForPlayer("player-1");

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const expectedX = 80 + dx;
        const expectedY = 80 + dy;
        expect(
          visibleState.tiles.some((tile) => tile.x === expectedX && tile.y === expectedY),
          `expected (${expectedX},${expectedY}) to be visible`
        ).toBe(true);
      }
    }
    expect(visibleState.tiles.some((tile) => tile.x === 80 && tile.y === 80 && tile.dockId === "dock-b")).toBe(true);
  });

  it("does not reveal linked docks when the player does not own the source dock", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 100 })],
        ["player-2", buildPlayer("player-2", { manpower: 100 })]
      ]),
      seedTiles: new Map(),
      seedDocks: [
        { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
        { dockId: "dock-b", tileKey: "80,80", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
      ],
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", dockId: "dock-a" },
          { x: 80, y: 80, terrain: "LAND", dockId: "dock-b" }
        ],
        activeLocks: []
      }
    });

    const visibleState = runtime.exportVisibleStateForPlayer("player-1");

    expect(visibleState.tiles.some((tile) => tile.x === 80 && tile.y === 80)).toBe(false);
  });

  it("does not reveal linked docks when the source dock is only frontier-claimed (discovered, not settled)", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 100 })]
      ]),
      seedTiles: new Map(),
      seedDocks: [
        { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
        { dockId: "dock-b", tileKey: "80,80", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
      ],
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", dockId: "dock-a" },
          { x: 80, y: 80, terrain: "LAND", dockId: "dock-b" }
        ],
        activeLocks: []
      }
    });

    const visibleState = runtime.exportVisibleStateForPlayer("player-1");

    expect(visibleState.tiles.some((tile) => tile.x === 80 && tile.y === 80)).toBe(false);
  });

  it("reveals an ally's linked docks when the ally owns the source dock", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 100, allies: new Set<string>(["player-2"]) })],
        ["player-2", buildPlayer("player-2", { manpower: 100, allies: new Set<string>(["player-1"]) })]
      ]),
      seedTiles: new Map(),
      seedDocks: [
        { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
        { dockId: "dock-b", tileKey: "80,80", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
      ],
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", dockId: "dock-a" },
          { x: 80, y: 80, terrain: "LAND", dockId: "dock-b" }
        ],
        activeLocks: []
      }
    });

    const visibleState = runtime.exportVisibleStateForPlayer("player-1");

    expect(visibleState.tiles.some((tile) => tile.x === 80 && tile.y === 80)).toBe(true);
  });

  it("expands TILE_DELTA_BATCH events to include linked dock tiles when a dock tile changes", async () => {
    const scheduledTasks: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      scheduleAfter: (_delayMs, task) => {
        scheduledTasks.push(task);
      },
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 1_000, manpower: 100 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", dockId: "dock-a" },
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT", name: "Anchor Town" } }, // reach over (10,10) -- DOCK anchors now require SETTLED
          { x: 49, y: 49, terrain: "LAND" }, { x: 50, y: 49, terrain: "LAND" },
          { x: 51, y: 49, terrain: "LAND" },
          { x: 49, y: 50, terrain: "LAND" },
          { x: 50, y: 50, terrain: "LAND", dockId: "dock-b" },
          { x: 51, y: 50, terrain: "LAND" },
          { x: 49, y: 51, terrain: "LAND" },
          { x: 50, y: 51, terrain: "LAND" },
          { x: 51, y: 51, terrain: "LAND" }
        ],
        docks: [
          { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
          { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
        ],
        activeLocks: []
      }
    });

    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "settle-dock",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 60_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });
    await Promise.resolve();
    while (scheduledTasks.length > 0) scheduledTasks.shift()?.();
    await Promise.resolve();

    const tileDeltaBatch = seen.find(
      (event): event is Extract<SimulationRuntimeEventShape, { eventType: "TILE_DELTA_BATCH" }> =>
        event.eventType === "TILE_DELTA_BATCH" &&
        event.tileDeltas.some((delta) => delta.x === 10 && delta.y === 10 && delta.dockId === "dock-a")
    );
    expect(tileDeltaBatch).toBeDefined();
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const expectedX = 50 + dx;
        const expectedY = 50 + dy;
        expect(
          tileDeltaBatch!.tileDeltas.some((delta) => delta.x === expectedX && delta.y === expectedY),
          `expected (${expectedX},${expectedY}) in expanded delta batch`
        ).toBe(true);
      }
    }
  });

  it("accepts a human frontier command before queued AI work drains", async () => {
    const runtime = new SimulationRuntime({ now: () => 1_000 });
    // Default-seeded player-1 owns (10,10) with no muster staged — the muster
    // system now requires FRONTIER_ATTACK_MUSTER_COST (15) mustered on the
    // origin before an ATTACK is accepted. Stage it directly via SET_MUSTER +
    // a manual tick (rather than real/fake wall-clock time) since this test's
    // whole point is queue-priority ordering, not muster accumulation timing.
    runtime.submitCommand({
      commandId: "stage-muster",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_MUSTER",
      payloadJson: JSON.stringify({ x: 10, y: 10, mode: "HOLD" })
    });
    await Promise.resolve();
    runtime.tickMuster(7_000);

    const seen: string[] = [];
    runtime.onEvent((event) => {
      seen.push(event.eventType);
    });
    for (let index = 0; index < 100; index += 1) {
      runtime.enqueueBackgroundJob(() => {
        const values = Array.from({ length: 200 }, (_, value) => value + index);
        values.reverse();
      });
    }

    runtime.submitCommand({
      commandId: "cmd-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });

    await Promise.resolve();
    expect(seen[0]).toBe("COMMAND_ACCEPTED");
  });

  it("accepts diagonal frontier attacks to match legacy adjacency rules", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })],
        ["player-2", buildPlayer("player-2", { isAi: true, points: 10_000, manpower: 10_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 24,
            y: 245,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER",
            muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
          },
          { x: 23, y: 246, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      seen.push(event.eventType);
    });

    runtime.submitCommand({
      commandId: "cmd-diagonal",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 24, fromY: 245, toX: 23, toY: 246 })
    });

    await Promise.resolve();
    expect(seen[0]).toBe("COMMAND_ACCEPTED");
  });

  it("freezes rewrite combat results on acceptance and reuses them at resolution", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const scheduled: Array<{ delayMs: number; task: () => void }> = [];
      const seen: SimulationRuntimeEventShape[] = [];
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        scheduleAfter: (delayMs, task) => {
          scheduled.push({ delayMs, task });
        },
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { points: 1_000, manpower: 1_000 })],
          ["player-2", buildPlayer("player-2", { points: 200, manpower: 1_000 })]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              town: { name: "Target", type: "FARMING", populationTier: "SETTLEMENT" }
            }
          ],
          activeLocks: []
        }
      });
      runtime.onEvent((event) => {
        seen.push(event);
      });

      runtime.submitCommand({
        commandId: "locked-combat-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();

      const accepted = seen.find(
        (event): event is Extract<SimulationRuntimeEventShape, { eventType: "COMMAND_ACCEPTED" }> => event.eventType === "COMMAND_ACCEPTED"
      );
      expect(accepted?.combatResult).toEqual(
        expect.objectContaining({
          attackType: "ATTACK",
          origin: { x: 10, y: 10 },
          target: { x: 10, y: 11 },
          attackerWon: true,
          manpowerDelta: expect.any(Number),
          changes: [
            {
              x: 10,
              y: 11,
              ownerId: "player-1",
              ownershipState: "FRONTIER"
            }
          ]
        })
      );
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0]?.delayMs).toBe(COMBAT_LOCK_MS);

      scheduled[0]?.task();

      const resolved = seen.find(
        (event): event is Extract<SimulationRuntimeEventShape, { eventType: "COMBAT_RESOLVED" }> => event.eventType === "COMBAT_RESOLVED"
      );
      expect(resolved?.combatResult).toEqual(accepted?.combatResult);
      expect(resolved?.manpowerDelta).toBe(accepted?.combatResult?.manpowerDelta);
      expect(resolved?.pillagedGold).toBe(accepted?.combatResult?.pillagedGold);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("accepts dock-crossing frontier expansion onto the linked dock tile but not the land beside it", async () => {
    const buildDockRuntime = () =>
      new SimulationRuntime({
        now: () => 1_000,
        seedTiles: new Map(),
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", dockId: "dock-a" },
            { x: 50, y: 50, terrain: "LAND", dockId: "dock-b" },
            { x: 51, y: 50, terrain: "LAND" }
            // Deliberately no reach anchor near the linked dock (50,50) —
            // a dock crossing is exempt from the reach gate on its exact
            // paired-dock target, since that's the whole point of a dock:
            // reaching a landmass with no anchor of your own on it yet.
          ],
          docks: [
            { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
            { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
          ],
          activeLocks: []
        }
      });

    // EXPAND must land on the linked dock tile (50,50) itself — you capture the
    // dock before claiming land beyond it.
    const acceptRuntime = buildDockRuntime();
    const acceptSeen: string[] = [];
    acceptRuntime.onEvent((event) => acceptSeen.push(event.eventType));
    acceptRuntime.submitCommand({
      commandId: "cmd-dock-expand-onto-dock",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 50, toY: 50 })
    });
    await Promise.resolve();
    expect(acceptSeen[0]).toBe("COMMAND_ACCEPTED");

    // Expanding onto the land beside the dock (51,50) must be rejected — that
    // previously let AI/barbarians settle past an uncaptured dock.
    const rejectRuntime = buildDockRuntime();
    const rejectSeen: string[] = [];
    rejectRuntime.onEvent((event) => rejectSeen.push(event.eventType));
    rejectRuntime.submitCommand({
      commandId: "cmd-dock-expand-adjacent",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 51, toY: 50 })
    });
    await Promise.resolve();
    expect(rejectSeen[0]).toBe("COMMAND_REJECTED");
  });

  it("emits a fresh player update after collecting buffered tile yield", async () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 0 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "MARKET", populationTier: "SETTLEMENT" }
          }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "collect-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 60_000,
      type: "COLLECT_TILE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });

    await Promise.resolve();

    expect(seen.map((event) => event.eventType)).toContain("COLLECT_RESULT");
    const playerUpdateEvent = seen.find(
      (event): event is Extract<SimulationRuntimeEventShape, { eventType: "PLAYER_MESSAGE" }> =>
        event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE"
    );
    expect(playerUpdateEvent).toEqual(
      expect.objectContaining({
        playerId: "player-1",
        messageType: "PLAYER_UPDATE"
      })
    );
    const payload = JSON.parse(playerUpdateEvent!.payloadJson) as { gold?: number };
    expect(payload.gold).toBeGreaterThan(0); // was >0.9 pre-gold-rescope (§6.1); just assert some gold was credited
  });

  it("no longer drains food upkeep from the stockpile (§5.4: FOOD is slot-based, town upkeep is 0)", async () => {
    let currentNow = 60_000;
    const runtime = new SimulationRuntime({
      now: () => currentNow,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { strategicResources: { FOOD: 10, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 } })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "TOWN", goldPerMinute: 2 }
          }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    currentNow += 5 * 60_000;

    runtime.submitCommand({
      commandId: "collect-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: currentNow,
      type: "COLLECT_TILE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });

    await Promise.resolve();

    const playerUpdateEvent = seen.find(
      (event): event is Extract<SimulationRuntimeEventShape, { eventType: "PLAYER_MESSAGE" }> =>
        event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE"
    );
    expect(playerUpdateEvent).toBeDefined();
    const payload = JSON.parse(playerUpdateEvent!.payloadJson) as {
      strategicResources: { FOOD: number };
    };
    // Town food upkeep is retired to 0 (§5.4) — the FOOD stockpile never moves.
    expect(payload.strategicResources.FOOD).toBe(10);
  });

  it("pays gold upkeep from accumulated tile yield before draining the stockpile", async () => {
    let currentNow = 60_000;
    const runtime = new SimulationRuntime({
      now: () => currentNow,
      initialPlayers: new Map([
        ["player-1", testRuntimePlayer("player-1", { points: 8000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "TRADE", populationTier: "TOWN", goldPerMinute: 4 }
          },
          {
            x: 6,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { type: "UMBRITE_RIG", status: "active" }
          }
        ],
        activeLocks: []
      }
    });
    // 60 minutes elapse offline. Town produces 4 gold/min (~240 gold of
    // yield accumulates); UMBRITE_RIG draws 1.2 gold/min in upkeep (~72 gold owed).
    // Yield easily covers the upkeep, so the stockpile must stay at 8000.
    currentNow += 60 * 60_000;
    runtime.exportPlannerPlayerViews(["player-1"]);
    const exported = runtime.exportState();
    const player = exported.players.find((p) => p.id === "player-1");
    expect(player?.points).toBeCloseTo(8000, 0);
  });

  it("falls back to stockpile when tile yield cannot cover gold upkeep", async () => {
    let currentNow = 60_000;
    const runtime = new SimulationRuntime({
      now: () => currentNow,
      initialPlayers: new Map([
        ["player-1", testRuntimePlayer("player-1", { points: 1000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "TRADE", populationTier: "SETTLEMENT", goldPerMinute: 0 }
          },
          {
            x: 6,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { type: "UMBRITE_SYNTHESIZER", status: "active", ownerId: "player-1" }
          }
        ],
        activeLocks: []
      }
    });
    // 60 min elapse: UMBRITE_SYNTHESIZER draws the §6.4-decided 30 gold/day
    // (= 30/1440 gold/min) upkeep, partially offset by the SETTLEMENT town's
    // own SETTLEMENT_BASE_GOLD_PER_MIN yield (§24.6); the remaining deficit
    // hits the stockpile.
    currentNow += 60 * 60_000;
    runtime.exportPlannerPlayerViews(["player-1"]);
    const exported = runtime.exportState();
    const player = exported.players.find((p) => p.id === "player-1");
    expect(player?.points).toBeGreaterThan(999);
    expect(player?.points).toBeLessThan(1000);
  });

  it("exportVisibleStateForPlayer accrues gold upkeep for the requesting player but not for other visible players", () => {
    // Regression guard for the visiblePlayersProjection self/other split:
    // player-1 (the requester) must still get full applyManpowerRegen (gold
    // upkeep drains their points every export, same as before this change).
    // player-2 (visible but not the requester) must NOT have its own upkeep
    // drained by player-1's export — that was the whole point of switching
    // player-2 to refreshManpowerOnly (skips the economy-accrual side effect
    // and the tile-yield-economy/town-network rebuild it can trigger).
    // player-2's own upkeep still applies normally once IT exports/acts.
    let currentNow = 60_000;
    const runtime = new SimulationRuntime({
      now: () => currentNow,
      initialPlayers: new Map([
        ["player-1", testRuntimePlayer("player-1", { points: 1000 })],
        ["player-2", testRuntimePlayer("player-2", { points: 1000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { type: "UMBRITE_SYNTHESIZER", status: "active", ownerId: "player-1" }
          },
          {
            x: 40,
            y: 40,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            economicStructure: { type: "UMBRITE_SYNTHESIZER", status: "active", ownerId: "player-2" }
          }
        ],
        activeLocks: []
      }
    });
    // Both players accrue the same UMBRITE_SYNTHESIZER gold upkeep (§6.4 — the
    // one structure family still gated on ongoing gold) with no offsetting
    // yield, so absent any export at all both would drain identically.
    currentNow += 60 * 60_000;

    const visible = runtime.exportVisibleStateForPlayer("player-1");
    const self = visible.players.find((p) => p.id === "player-1");
    const other = visible.players.find((p) => p.id === "player-2");

    expect(self?.points).toBeLessThan(1000);
    expect(other?.points).toBe(1000);

    // player-2's own upkeep still applies once THEY export/act — nothing lost,
    // only deferred to their own path, exactly as refreshManpowerOnly's
    // existing doc comment already guarantees for the sibling planner exports.
    const player2Visible = runtime.exportVisibleStateForPlayer("player-2");
    const player2Self = player2Visible.players.find((p) => p.id === "player-2");
    expect(player2Self?.points).toBeLessThan(1000);
  });

  it("no longer touches the food stockpile at all (§5.4: FOOD upkeep/production are both retired to 0)", async () => {
    let currentNow = 60_000;
    const runtime = new SimulationRuntime({
      now: () => currentNow,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 0, strategicResources: { FOOD: 100, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 } })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "MARKET", populationTier: "TOWN", goldPerMinute: 1 }
          },
          {
            x: 6,
            y: 5,
            terrain: "LAND",
            resource: "FARM",
            ownerId: "player-1",
            ownershipState: "SETTLED"
          },
          {
            x: 7,
            y: 5,
            terrain: "LAND",
            resource: "FARM",
            ownerId: "player-1",
            ownershipState: "SETTLED"
          }
        ],
        activeLocks: []
      }
    });
    // 60 min elapse: town food upkeep and FARM tile production are both
    // retired to 0 (§5.4) — the FOOD stockpile stays exactly where it started.
    currentNow += 60 * 60_000;
    runtime.exportPlannerPlayerViews(["player-1"]);
    const exported = runtime.exportState();
    const player = exported.players.find((p) => p.id === "player-1");
    expect(player?.strategicResources.FOOD).toBe(100);
  });

  it("advances the per-tile anchor so a later collect only picks up leftover yield", async () => {
    let currentNow = 60_000;
    const runtime = new SimulationRuntime({
      now: () => currentNow,
      initialPlayers: new Map([
        ["player-1", testRuntimePlayer("player-1", { points: 0 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "TRADE", populationTier: "SETTLEMENT", goldPerMinute: 10 }
          },
          {
            x: 6,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { type: "UMBRITE_SYNTHESIZER", status: "active", ownerId: "player-1" }
          }
        ],
        activeLocks: []
      }
    });
    // 60 min elapse: tile (5,5) produces 10 gold/min (~610 gold yield
    // before any drain); UMBRITE_SYNTHESIZER draws the §6.4-decided 30
    // gold/day (~1.25 gold over 60 min) — the only structure family that
    // still carries an ongoing gold upkeep post-§12.1. Accrual consumes
    // that from the buffer and advances the tile's anchor. A subsequent
    // COLLECT_TILE should only see the leftover — strictly less than the
    // full ~610 undrained yield, which would happen if the anchor hadn't
    // moved — but very close to it, since the drain itself is now tiny.
    currentNow += 60 * 60_000;
    runtime.submitCommand({
      commandId: "collect-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: currentNow,
      type: "COLLECT_TILE",
      payloadJson: JSON.stringify({ x: 5, y: 5 })
    });
    await Promise.resolve();
    const exported = runtime.exportState();
    const player = exported.players.find((p) => p.id === "player-1");
    expect(player?.points).toBeGreaterThan(600);
    expect(player?.points).toBeLessThan(610);
  });

  it("collects no FOOD on a mixed-yield tile — FOOD production is retired (§5.4: slot-based, not yield-based)", async () => {
    let currentNow = 60_000;
    const runtime = new SimulationRuntime({
      now: () => currentNow,
      initialPlayers: new Map([
        ["player-1", testRuntimePlayer("player-1", { points: 0 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            resource: "FARM",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "TRADE", populationTier: "SETTLEMENT", goldPerMinute: 10 }
          },
          {
            x: 6,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { type: "GARRISON_HALL", status: "active", ownerId: "player-1" }
          }
        ],
        activeLocks: []
      }
    });
    // The mixed-yield tile (5,5) produces 10 gold/min; FOOD production is
    // retired (§5.4: FOOD is slot-based, not yield-based) so there's no FOOD
    // left in this tile's yield to collect, regardless of the shared anchor.
    currentNow += 60 * 60_000;
    runtime.submitCommand({
      commandId: "collect-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: currentNow,
      type: "COLLECT_TILE",
      payloadJson: JSON.stringify({ x: 5, y: 5 })
    });
    await Promise.resolve();
    const exported = runtime.exportState();
    const player = exported.players.find((p) => p.id === "player-1");
    expect(player?.strategicResources.FOOD).toBe(0);
  });

  it("does not choose unaffordable frontier actions for AI automation", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["ai-1", testRuntimePlayer("ai-1", { isAi: true, points: 0, manpower: 0, strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 } })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER" },
          { x: 11, y: 10, terrain: "LAND" },
          { x: 9, y: 10, terrain: "LAND", ownerId: "enemy-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });

    expect(runtime.chooseNextAutomationCommand("ai-1", 1, 1_000, "ai-runtime")).toBeUndefined();
  });

  it("does not auto-expand onto worthless plain frontier land without an expansion objective", () => {
    // Plain neutral tiles (no resource/town/dock) must not be expanded unless the planner
    // has an expansionObjective pointing toward them. points: 0 keeps "nothing affordable"
    // true even though tech is cheap now (gold rescope, §6) — otherwise the AI would fall back to CHOOSE_TECH.
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["ai-1", testRuntimePlayer("ai-1", { isAi: true, points: 0, manpower: 10_000, strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 } })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER" },
          { x: 12, y: 10, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });

    // No beacon tiles (no neutral town/dock/resource) → no expansionObjective → no expansion.
    expect(runtime.chooseNextAutomationCommand("ai-1", 1, 1_000, "ai-runtime")).toBeUndefined();
  });

  it("uses dock crossings for AI automation when island starts have no local frontier target", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialPlayers: new Map([
        ["ai-1", testRuntimePlayer("ai-1", { isAi: true, manpower: 10_000, strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 } })]
      ]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", dockId: "dock-a", town: { name: "Spawn", type: "FARMING", populationTier: "SETTLEMENT" } },
          // Fixed-border reach: dock-crossing still extends the *origin*
          // (10,10) -> (50,50) unchanged, but the *target* now also needs to
          // be inside the actor's reach independently — a dock crossing
          // alone can no longer leapfrog reach itself (that's the whole
          // point of the fixed-border plan). Give ai-1 a second reach
          // anchor near the far island so this test still exercises real
          // dock-crossing discovery rather than something reach would have
          // allowed anyway from (10,10).
          { x: 48, y: 50, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", town: { name: "Outpost", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 50, y: 50, terrain: "LAND", dockId: "dock-b" },
          { x: 51, y: 50, terrain: "LAND", resource: "FARM" }
        ],
        docks: [
          { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
          { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
        ],
        activeLocks: []
      }
    });

    expect(runtime.explainNextAutomationCommand("ai-1", 1, 1_000, "ai-runtime", { skipPreplan: true }).command).toEqual(
      expect.objectContaining({
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 50, toY: 50 })
      })
    );
  });

  it("replays existing events for duplicate command ids instead of reprocessing", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({ now: () => 1_000 });
      runtime.submitCommand({
        commandId: "stage-muster",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 0,
        issuedAt: 1_000,
        type: "SET_MUSTER",
        payloadJson: JSON.stringify({ x: 10, y: 10, mode: "HOLD" })
      });
      await Promise.resolve();
      runtime.tickMuster(7_000);

      const seen: string[] = [];
      runtime.onEvent((event) => {
        seen.push(`${event.eventType}:${event.commandId}`);
      });

      const command = {
        commandId: "cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK" as const,
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      };

      runtime.submitCommand(command);
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      runtime.submitCommand(command);

      // player-2 is AI, so #732 skips its PLAYER_UPDATE on lock resolution (no WS subscriber).
      expect(seen).toEqual([
        "COMMAND_ACCEPTED:cmd-1",
        "PLAYER_MESSAGE:cmd-1",
        "COMBAT_RESOLVED:cmd-1",
        "PLAYER_MESSAGE:cmd-1",
        "TILE_YIELD_ANCHOR_UPDATED:cmd-1:respawn:player-2",
        "TILE_DELTA_BATCH:cmd-1",
        "COMMAND_ACCEPTED:cmd-1",
        "PLAYER_MESSAGE:cmd-1",
        "COMBAT_RESOLVED:cmd-1",
        "PLAYER_MESSAGE:cmd-1",
        "TILE_DELTA_BATCH:cmd-1",
      ]);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("persists expand ownership into authoritative state after resolution", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
            { x: 11, y: 10, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "expand-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({
          x: 11,
          y: 10,
          ownerId: "player-1",
          ownershipState: "FRONTIER"
        })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("preserves shardSite on target tile after EXPAND onto a tile that has one", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
            { x: 11, y: 10, terrain: "LAND", shardSite: { kind: "CACHE", amount: 3 } }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "expand-shard-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const targetTile = runtime.exportState().tiles.find((t) => t.x === 11 && t.y === 10);
      expect(targetTile).toBeDefined();
      expect(targetTile!.ownerId).toBe("player-1");
      expect(targetTile!.ownershipState).toBe("FRONTIER");
      expect(targetTile!.shardSiteJson).toEqual(expect.stringContaining("\"kind\":\"CACHE\""));
      expect(targetTile!.shardSiteJson).toEqual(expect.stringContaining("\"amount\":3"));
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("cancels an active frontier expansion before it resolves", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => {
        scheduled.push(task);
      },
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 11, y: 10, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "expand-cancelled-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
    await Promise.resolve();

    runtime.submitCommand({
      commandId: "cancel-capture-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_001,
      type: "CANCEL_CAPTURE",
      payloadJson: "{}"
    });
    await Promise.resolve();

    for (const task of scheduled) task();

    expect(seen).toContainEqual(
      expect.objectContaining({
        eventType: "COMBAT_CANCELLED",
        commandId: "cancel-capture-1",
        playerId: "player-1",
        count: 1,
        cancelledCommandIds: ["expand-cancelled-1"]
      })
    );
    expect(seen.some((event) => event.eventType === "COMBAT_RESOLVED" && event.commandId === "expand-cancelled-1")).toBe(false);
    const targetTile = runtime.exportState().tiles.find((tile) => tile.x === 11 && tile.y === 10);
    expect(targetTile).toEqual(expect.objectContaining({ x: 11, y: 10 }));
    expect(targetTile?.ownerId).toBeUndefined();
    expect(targetTile?.ownershipState).toBeUndefined();
  });

  it("keeps cancelled frontier commands terminal in snapshots after the cancel command replay is pruned", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      maxTerminalCommandReplayHistory: 1,
      scheduleAfter: (_delayMs, task) => {
        scheduled.push(task);
      },
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 11, y: 10, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    const expandCommand = {
      commandId: "expand-terminal-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND" as const,
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    };
    runtime.submitCommand(expandCommand);
    await Promise.resolve();
    runtime.submitCommand({
      commandId: "cancel-terminal-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_001,
      type: "CANCEL_CAPTURE",
      payloadJson: "{}"
    });
    await Promise.resolve();

    const eventsAfterCancel = seen.length;
    expect(seen).toContainEqual(
      expect.objectContaining({
        eventType: "COMBAT_CANCELLED",
        commandId: "cancel-terminal-1",
        cancelledCommandIds: ["expand-terminal-1"]
      })
    );
    expect(runtime.exportSnapshotSections().commandEvents.some((entry) => entry.commandId === "expand-terminal-1")).toBe(false);

    runtime.submitCommand(expandCommand);
    runtime.submitCommand({ ...expandCommand, commandId: "expand-terminal-duplicate-seq" });
    await Promise.resolve();
    expect(seen).toHaveLength(eventsAfterCancel);

    for (let i = 0; i < 4; i += 1) {
      runtime.submitCommand({
        commandId: `reject-${i}`,
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 10 + i,
        issuedAt: 1_010 + i,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 1, fromY: 1, toX: 2, toY: 2 })
      });
      await Promise.resolve();
    }

    const eventsAfterPrune = seen.length;
    runtime.submitCommand(expandCommand);
    await Promise.resolve();
    for (const task of scheduled) task();

    expect(seen).toHaveLength(eventsAfterPrune);
    expect(seen.some((event) => event.eventType === "COMBAT_RESOLVED" && event.commandId === "expand-terminal-1")).toBe(false);
    expect(runtime.exportSnapshotSections().commandEvents.some((entry) => entry.commandId === "expand-terminal-1")).toBe(false);
  });

  it("recovers stale frontier origin payloads by selecting a valid owned adjacent origin server-side", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 7, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
            { x: 11, y: 10, terrain: "LAND" },
            { x: 9, y: 9, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });
      const seen = collectEvents(runtime);

      runtime.submitCommand({
        commandId: "expand-stale-origin-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 9, fromY: 9, toX: 11, toY: 10 })
      });

      await Promise.resolve();

      const accepted = seen.find(
        (event): event is Extract<SimulationRuntimeEventShape, { eventType: "COMMAND_ACCEPTED" }> => event.eventType === "COMMAND_ACCEPTED"
      );
      const rejected = seen.find((event) => event.eventType === "COMMAND_REJECTED");
      expect(rejected).toBeUndefined();
      expect(accepted).toEqual(
        expect.objectContaining({
          commandId: "expand-stale-origin-1",
          actionType: "EXPAND",
          originX: 10,
          originY: 10,
          targetX: 11,
          targetY: 10
        })
      );

      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({
          x: 11,
          y: 10,
          ownerId: "player-1",
          ownershipState: "FRONTIER"
        })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("can resolve an attack as a loss and leave the defender tile owned by the defender", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { manpower: 300 })],
          ["player-2", buildPlayer("player-2", { isAi: true, manpower: 300 })]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } },
            { x: 21, y: 20, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });
      const seen = collectEvents(runtime);

      runtime.submitCommand({
        commandId: "lose-attack-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const combatResult = seen.find(
        (event): event is Extract<SimulationRuntimeEventShape, { eventType: "COMBAT_RESOLVED" }> => event.eventType === "COMBAT_RESOLVED"
      );
      expect(combatResult).toEqual(
        expect.objectContaining({
          commandId: "lose-attack-1",
          attackerWon: false,
          manpowerDelta: expect.any(Number)
        })
      );
      expect((combatResult?.manpowerDelta ?? 0) < -0.01).toBe(true);

      const exported = runtime.exportState();
      // (no absolute manpower assertion here — player-1 also respawns with a fresh SETTLEMENT, granting extra cap per §4.3, on top of the manpowerDelta loss already asserted above)
      expect(exported.tiles.find((tile) => tile.x === 10 && tile.y === 11)).toEqual(
        expect.objectContaining({
          ownerId: "player-2",
          ownershipState: "SETTLED"
        })
      );
      expect(exported.players.find((entry) => entry.id === "player-1")?.points).toBe(100); // §24.2: 100 default - 1 FRONTIER_CLAIM_COST + full integrity income
      const respawnPlayerUpdate = seen.find(
        (event): event is Extract<SimulationRuntimeEventShape, { eventType: "PLAYER_MESSAGE" }> =>
          event.eventType === "PLAYER_MESSAGE" &&
          event.playerId === "player-1" &&
          event.commandId === "lose-attack-1:respawn:player-1" &&
          event.messageType === "PLAYER_UPDATE"
      );
      const respawnPayload = respawnPlayerUpdate?.payloadJson ? JSON.parse(respawnPlayerUpdate.payloadJson) as { gold?: number } : {};
      expect(respawnPayload.gold).toBe(100);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("charges 1 gold when a neutral expand resolves", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", testRuntimePlayer("player-1")]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 11, y: 10, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "expand-cost-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      expect(runtime.exportState().players.find((entry) => entry.id === "player-1")?.points).toBe(100);
    } finally {
      vi.useRealTimers();
    }
  });

  it("always resolves neutral EXPAND as a successful frontier capture", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1")]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
            { x: 11, y: 10, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "expand-always-success",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      expect(runtime.exportState().tiles.find((tile) => tile.x === 11 && tile.y === 10)).toEqual(
        expect.objectContaining({
          ownerId: "player-1",
          ownershipState: "FRONTIER"
        })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("grants the defender the attacker's origin tile on a failed attack without fort protection", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { points: 1_000, manpower: 10_000 })],
          ["player-2", buildAiOpponent()]
        ]),
        initialState: {
          tiles: [
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      });
      const seen = collectEvents(runtime);

      runtime.submitCommand({
        commandId: "lose-origin-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const combatResolved = seen.find(
        (event): event is Extract<SimulationRuntimeEventShape, { eventType: "COMBAT_RESOLVED" }> => event.eventType === "COMBAT_RESOLVED"
      );
      expect(combatResolved?.combatResult).toEqual(
        expect.objectContaining({
          attackerWon: false,
          changes: [{ x: 10, y: 10, ownerId: "player-2", ownershipState: "FRONTIER" }]
        })
      );

      const tileDelta = seen.find(
        (event): event is Extract<SimulationRuntimeEventShape, { eventType: "TILE_DELTA_BATCH" }> =>
          event.eventType === "TILE_DELTA_BATCH" && event.commandId === "lose-origin-1"
      );
      expect(tileDelta?.tileDeltas).toContainEqual(
        expect.objectContaining({ x: 10, y: 10, ownerId: "player-2", ownershipState: "FRONTIER" })
      );

      expect(runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10)).toEqual(
        expect.objectContaining({
          ownerId: "player-2",
          ownershipState: "FRONTIER"
        })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("preserves the town on the origin tile when a failed attack flips it to the defender", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { points: 1_000, manpower: 10_000 })],
          ["player-2", buildAiOpponent()]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 },
              town: {
                name: "Kettlecorner",
                type: "FARMING",
                populationTier: "TOWN",
                population: 19_699,
                maxPopulation: 10_000_000,
                connectedTownCount: 0,
                connectedTownBonus: 0
              }
            },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "lose-origin-town-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const flipped = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
      expect(flipped).toEqual(
        expect.objectContaining({
          ownerId: "player-2",
          ownershipState: "FRONTIER",
          townName: "Kettlecorner",
          townType: "FARMING",
          townPopulationTier: "TOWN"
        })
      );
      expect(flipped?.townJson ? JSON.parse(flipped.townJson) : undefined).toEqual(
        expect.objectContaining({ name: "Kettlecorner", population: 19_699 })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("preserves a freshly-captured town when the captor fails an outward attack and loses the origin back", async () => {
    // Models the staging incident: ai-4 captured user's settled town, attacked
    // outward, lost, and the original owner reclaimed the tile — town must survive.
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["captor", buildPlayer("captor", { isAi: true, points: 1_000, manpower: 10_000 })],
          ["reclaimer", buildPlayer("reclaimer", { points: 1_000, manpower: 10_000 })]
        ]),
        initialState: {
          tiles: [
            // Captor sits on a FRONTIER tile that still carries the captured town record.
            {
              x: 14,
              y: 273,
              terrain: "LAND",
              ownerId: "captor",
              ownershipState: "FRONTIER",
              muster: { ownerId: "captor", amount: 999, mode: "HOLD", updatedAt: 0 },
              town: {
                name: "Kettlecorner",
                type: "FARMING",
                populationTier: "TOWN",
                population: 19_699,
                maxPopulation: 10_000_000,
                connectedTownCount: 0,
                connectedTownBonus: 0
              }
            },
            { x: 15, y: 274, terrain: "LAND", ownerId: "reclaimer", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "captor-attacks-out-1",
        sessionId: "session-captor",
        playerId: "captor",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 14, fromY: 273, toX: 15, toY: 274 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const reclaimed = runtime.exportState().tiles.find((tile) => tile.x === 14 && tile.y === 273);
      expect(reclaimed).toEqual(
        expect.objectContaining({
          ownerId: "reclaimer",
          ownershipState: "FRONTIER",
          townName: "Kettlecorner"
        })
      );
      expect(reclaimed?.townJson ? JSON.parse(reclaimed.townJson) : undefined).toEqual(
        expect.objectContaining({ name: "Kettlecorner", population: 19_699 })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps the origin tile when a failed attack starts from an active fort", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { points: 1_000, manpower: 10_000 })],
          ["player-2", buildAiOpponent()]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              fort: { ownerId: "player-1", status: "active" },
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
            // §5.4: FORT needs 1 TITANIUM slot to not go dormant.
            { x: 9, y: 10, terrain: "LAND", resource: "TITANIUM", ownerId: "player-1", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      });
      const seen = collectEvents(runtime);

      runtime.submitCommand({
        commandId: "lose-origin-fort-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const combatResolved = seen.find(
        (event): event is Extract<SimulationRuntimeEventShape, { eventType: "COMBAT_RESOLVED" }> =>
          event.eventType === "COMBAT_RESOLVED" && event.commandId === "lose-origin-fort-1"
      );
      expect(combatResolved?.combatResult).toEqual(
        expect.objectContaining({
          attackerWon: false,
          changes: []
        })
      );

      expect(runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10)).toEqual(
        expect.objectContaining({
          ownerId: "player-1",
          ownershipState: "SETTLED",
          fortJson: JSON.stringify({ ownerId: "player-1", status: "active" })
        })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("emits plunder details for settled captures so victory popups can show loot", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { points: 1_000, manpower: 10_000 })],
          ["player-2", buildAiOpponent({ points: 900 })]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              town: { name: "Beejac", type: "FARMING", populationTier: "SETTLEMENT" }
            }
          ],
          activeLocks: []
        }
      });
      const seen: Array<Record<string, unknown>> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMBAT_RESOLVED") seen.push(event as unknown as Record<string, unknown>);
      });

      runtime.submitCommand({
        commandId: "cmd-plunder",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      expect(seen).toContainEqual(
        expect.objectContaining({
          commandId: "cmd-plunder",
          pillagedGold: expect.any(Number)
        })
      );
      const plunderEvent = seen.find((event) => event.commandId === "cmd-plunder");
      expect((plunderEvent?.pillagedGold as number) ?? 0).toBeGreaterThan(0);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("builds a fort through the rewrite simulation path and persists its tile state", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["masonry"]), strategicResources: { TITANIUM: 100 } })
          ]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Fort Town", type: "FARMING", populationTier: "TOWN" }
            },
            { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" }
          ],
          activeLocks: []
        }
      });
      const seen: string[] = [];
      runtime.onEvent((event) => {
        if (event.eventType === "TILE_DELTA_BATCH") {
          seen.push(event.tileDeltas[0]?.fortJson ? "fort" : "other");
        }
      });

      runtime.submitCommand({
        commandId: "fort-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_FORT",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });

      await Promise.resolve();
      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({
          x: 10,
          y: 10,
          fortJson: expect.any(String)
        })
      );
      expect(runtime.exportState().players.find((player) => player.id === "player-1")?.manpower).toBe(STARTING_CAPITAL_MANPOWER_CAP + TOWN_MANPOWER_BY_TIER.TOWN.cap - 300); // cap = capital + TOWN tier (1020, §4.3) before Fort's 300 cost

      vi.advanceTimersByTime(structureBuildDurationMs("FORT"));

      const exported = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
      expect(exported?.fortJson).toContain("\"status\":\"active\"");
      expect(seen).toContain("fort");
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists the variant on a fresh fort build (tech determines tier)", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["masonry", "fortified-walls"]), strategicResources: { TITANIUM: 500 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" } },
            { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
            { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" }
          ],
          activeLocks: []
        }
      });

      const events: string[] = [];
      runtime.onEvent((event) => {
        events.push(event.eventType);
      });

      runtime.submitCommand({
        commandId: "fort-tier-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_FORT",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });

      await Promise.resolve();
      expect(events).toContain("TILE_DELTA_BATCH");
      const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
      expect(tile?.fortJson).toBeDefined();
      expect(tile?.fortJson).toContain("\"variant\":\"TITANIUM_BASTION\"");
    } finally {
      vi.useRealTimers();
    }
  });

  it("upgrades FORT → TITANIUM_BASTION when fortified-walls is researched", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["masonry", "fortified-walls"]), strategicResources: { TITANIUM: 500 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" }, fort: { ownerId: "player-1", status: "active", variant: "FORT" as const } },
            { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
            { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" }
          ],
          activeLocks: []
        }
      });

      const events: string[] = [];
      runtime.onEvent((event) => {
        events.push(event.eventType);
      });

      runtime.submitCommand({
        commandId: "fort-upgrade-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_FORT",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });

      await Promise.resolve();
      expect(events).toContain("TILE_DELTA_BATCH");
      const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
      expect(tile?.fortJson).toBeDefined();
      expect(tile?.fortJson).toContain("\"variant\":\"TITANIUM_BASTION\"");
      // Structure build gold costs are zeroed (docs/manpower-economy-rewrite-plan.md
      // §12) — the fort tier ladder no longer charges gold at all, just the
      // manpower/iron already asserted above via the fort variant.
      const player = runtime.exportState().players.find((p) => p.id === "player-1")!;
      expect(player.points).toBe(10_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects THUNDER_BASTION upgrade when already max tier", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["masonry", "fortified-walls", "steelworking"]), strategicResources: { TITANIUM: 500 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" }, fort: { ownerId: "player-1", status: "active", variant: "THUNDER_BASTION" as const } }
          ],
          activeLocks: []
        }
      });

      const events: Array<{ code: string; message: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMMAND_REJECTED") events.push({ code: event.code, message: event.message });
      });

      runtime.submitCommand({
        commandId: "fort-maxed-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_FORT",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });

      await Promise.resolve();
      expect(events).toHaveLength(1);
      expect(events[0].code).toBe("BUILD_INVALID");
      expect(events[0].message).toBe("fort already at maximum tier");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects FORT upgrade when next tier tech is missing", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["masonry"]), strategicResources: { TITANIUM: 500 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" }, fort: { ownerId: "player-1", status: "active", variant: "FORT" as const } }
          ],
          activeLocks: []
        }
      });

      const events: Array<{ code: string; message: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMMAND_REJECTED") events.push({ code: event.code, message: event.message });
      });

      runtime.submitCommand({
        commandId: "fort-no-tech-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_FORT",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });

      await Promise.resolve();
      expect(events).toHaveLength(1);
      expect(events[0].code).toBe("BUILD_INVALID");
      expect(events[0].message).toBe("research the next tier first");
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists the fort variant through build completion", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["masonry", "fortified-walls", "steelworking"]), strategicResources: { TITANIUM: 500 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" } },
            { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
            { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
            { x: 13, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
            { x: 14, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "fort-complete-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_FORT",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });

      await Promise.resolve();
      // Under construction — should have THUNDER_BASTION variant
      let tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
      expect(tile?.fortJson).toContain("\"variant\":\"THUNDER_BASTION\"");
      expect(tile?.fortJson).toContain("\"status\":\"under_construction\"");

      // Advance past build time
      vi.advanceTimersByTime(structureBuildDurationMs("FORT"));

      tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
      expect(tile?.fortJson).toContain("\"variant\":\"THUNDER_BASTION\"");
      expect(tile?.fortJson).toContain("\"status\":\"active\"");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an active wooden fort until its full fort upgrade completes", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 10_000, manpower: 300, techIds: new Set<string>(["masonry"]), strategicResources: { TITANIUM: 100 } })
          ]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Fort Upgrade Town", type: "FARMING", populationTier: "TOWN" },
              economicStructure: { ownerId: "player-1", type: "WOODEN_FORT", status: "active" }
            },
            { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
            { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "fort-upgrade-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_FORT",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });

      await Promise.resolve();
      const buildingTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
      expect(buildingTile?.economicStructureJson).toBe(JSON.stringify({ ownerId: "player-1", type: "WOODEN_FORT", status: "active" }));
      expect(buildingTile?.fortJson).toContain("\"status\":\"under_construction\"");

      vi.advanceTimersByTime(structureBuildDurationMs("FORT"));

      const completedTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
      expect(completedTile?.economicStructureJson).toBeUndefined();
      expect(completedTile?.fortJson).toContain("\"status\":\"active\"");
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes an active fort through the rewrite simulation path and clears its tile state", async () => {
    vi.useFakeTimers();
    try {
      const scheduled: Array<{ delayMs: number; task: () => void }> = [];
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        scheduleAfter: (delayMs, task) => {
          scheduled.push({ delayMs, task });
        },
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["masonry"]), strategicResources: { TITANIUM: 100 } })
          ]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              fort: { ownerId: "player-1", status: "active" }
            }
          ],
          activeLocks: []
        }
      });
      const seen: Array<{ commandId: string; fortJson?: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "TILE_DELTA_BATCH") {
          const tile = event.tileDeltas[0];
          if (tile) seen.push({ commandId: event.commandId, fortJson: tile.fortJson });
        }
      });

      runtime.submitCommand({
        commandId: "remove-fort-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "REMOVE_STRUCTURE",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });

      await Promise.resolve();
      const removingTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
      expect(removingTile?.fortJson).toContain("\"status\":\"removing\"");
      expect(scheduled).toHaveLength(1);

      scheduled[0]?.task();

      const removedTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
      expect(removedTile?.fortJson).toBeUndefined();
      expect(seen).toHaveLength(2);
      expect(seen[0]).toEqual(
        expect.objectContaining({
          commandId: "remove-fort-cmd-1",
          fortJson: expect.stringContaining("\"status\":\"removing\"")
        })
      );
      expect(seen[1]).toEqual({
        commandId: "remove-fort-cmd-1",
        fortJson: undefined
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds an observatory through the rewrite simulation path and persists its tile state", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["crystal-lattices"]), strategicResources: { CRYSTAL: 100 } })
          ]
        ]),
        initialState: {
          tiles: [
            {
              x: 12,
              y: 12,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Lookout", type: "MARKET", populationTier: "TOWN" }
            },
            { x: 13, y: 12, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "obs-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_OBSERVATORY",
        payloadJson: JSON.stringify({ x: 12, y: 12 })
      });

      await Promise.resolve();
      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({
          x: 12,
          y: 12,
          observatoryJson: expect.any(String)
        })
      );

      vi.advanceTimersByTime(structureBuildDurationMs("OBSERVATORY"));

      const exported = runtime.exportState().tiles.find((tile) => tile.x === 12 && tile.y === 12);
      expect(exported?.observatoryJson).toContain("\"status\":\"active\"");
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds a siege outpost through the rewrite simulation path and persists its tile state", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["leatherworking"]), strategicResources: { UMBRITE: 100 } })
          ]
        ]),
        initialState: {
          tiles: [
            {
              x: 14,
              y: 14,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED"
            },
            { x: 15, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "siege-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_SIEGE_OUTPOST",
        payloadJson: JSON.stringify({ x: 14, y: 14 })
      });

      await Promise.resolve();
      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({
          x: 14,
          y: 14,
          siegeOutpostJson: expect.any(String)
        })
      );
      expect(runtime.exportState().players.find((player) => player.id === "player-1")?.manpower).toBe(STARTING_CAPITAL_MANPOWER_CAP + TOWN_MANPOWER_BY_TIER.SETTLEMENT.cap - 60); // SETTLED w/no town still = SETTLEMENT tier (870, §4.3) before outpost's 60 cost

      vi.advanceTimersByTime(structureBuildDurationMs("SIEGE_OUTPOST"));

      const exported = runtime.exportState().tiles.find((tile) => tile.x === 14 && tile.y === 14);
      expect(exported?.siegeOutpostJson).toContain("\"status\":\"active\"");
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists the siege variant on a fresh build (tech determines tier)", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["leatherworking", "siegecraft"]), strategicResources: { UMBRITE: 500, TITANIUM: 200 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 14, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" } },
            { x: 15, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
            { x: 16, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
            { x: 17, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "siege-tier-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_SIEGE_OUTPOST",
        payloadJson: JSON.stringify({ x: 14, y: 14 })
      });

      await Promise.resolve();
      const tile = runtime.exportState().tiles.find((t) => t.x === 14 && t.y === 14);
      expect(tile?.siegeOutpostJson).toBeDefined();
      expect(tile?.siegeOutpostJson).toContain("\"variant\":\"SIEGE_TOWER\"");
    } finally {
      vi.useRealTimers();
    }
  });

  it("upgrades SIEGE_OUTPOST → SIEGE_TOWER when siegecraft is researched", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["leatherworking", "siegecraft"]), strategicResources: { UMBRITE: 500, TITANIUM: 200 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 14, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" }, siegeOutpost: { ownerId: "player-1", status: "active", variant: "SIEGE_OUTPOST" as const } },
            { x: 15, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
            { x: 16, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
            { x: 17, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "siege-upgrade-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_SIEGE_OUTPOST",
        payloadJson: JSON.stringify({ x: 14, y: 14 })
      });

      await Promise.resolve();
      const tile = runtime.exportState().tiles.find((t) => t.x === 14 && t.y === 14);
      expect(tile?.siegeOutpostJson).toBeDefined();
      expect(tile?.siegeOutpostJson).toContain("\"variant\":\"SIEGE_TOWER\"");
      // Structure build gold costs are zeroed (docs/manpower-economy-rewrite-plan.md
      // §12) — the siege tier ladder no longer charges gold at all, just the
      // manpower/supply/iron already asserted above via the siege variant.
      const player = runtime.exportState().players.find((p) => p.id === "player-1")!;
      expect(player.points).toBe(10_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects DREAD_TOWER upgrade when already max tier", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["leatherworking", "siegecraft", "standing-army"]), strategicResources: { UMBRITE: 500, TITANIUM: 200 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 14, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" }, siegeOutpost: { ownerId: "player-1", status: "active", variant: "DREAD_TOWER" as const } }
          ],
          activeLocks: []
        }
      });

      const events: Array<{ code: string; message: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMMAND_REJECTED") events.push({ code: event.code, message: event.message });
      });

      runtime.submitCommand({
        commandId: "siege-maxed-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_SIEGE_OUTPOST",
        payloadJson: JSON.stringify({ x: 14, y: 14 })
      });

      await Promise.resolve();
      expect(events).toHaveLength(1);
      expect(events[0].code).toBe("BUILD_INVALID");
      expect(events[0].message).toBe("siege outpost already at maximum tier");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects SIEGE_OUTPOST upgrade when next tier tech is missing", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["leatherworking"]), strategicResources: { UMBRITE: 500, TITANIUM: 200 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 14, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" }, siegeOutpost: { ownerId: "player-1", status: "active", variant: "SIEGE_OUTPOST" as const } }
          ],
          activeLocks: []
        }
      });

      const events: Array<{ code: string; message: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMMAND_REJECTED") events.push({ code: event.code, message: event.message });
      });

      runtime.submitCommand({
        commandId: "siege-no-tech-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_SIEGE_OUTPOST",
        payloadJson: JSON.stringify({ x: 14, y: 14 })
      });

      await Promise.resolve();
      expect(events).toHaveLength(1);
      expect(events[0].code).toBe("BUILD_INVALID");
      expect(events[0].message).toBe("research the next tier first");
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists the siege variant through build completion", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["leatherworking", "siegecraft", "standing-army"]), strategicResources: { UMBRITE: 500, TITANIUM: 200 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 14, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" } },
            { x: 15, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
            { x: 16, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
            { x: 17, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
            { x: 18, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
            { x: 19, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "siege-complete-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_SIEGE_OUTPOST",
        payloadJson: JSON.stringify({ x: 14, y: 14 })
      });

      await Promise.resolve();
      let tile = runtime.exportState().tiles.find((t) => t.x === 14 && t.y === 14);
      expect(tile?.siegeOutpostJson).toContain("\"variant\":\"DREAD_TOWER\"");
      expect(tile?.siegeOutpostJson).toContain("\"status\":\"under_construction\"");

      vi.advanceTimersByTime(structureBuildDurationMs("SIEGE_OUTPOST"));

      tile = runtime.exportState().tiles.find((t) => t.x === 14 && t.y === 14);
      expect(tile?.siegeOutpostJson).toContain("\"variant\":\"DREAD_TOWER\"");
      expect(tile?.siegeOutpostJson).toContain("\"status\":\"active\"");
    } finally {
      vi.useRealTimers();
    }
  });

  // Step 5 item 3 (Slice A): FOOD/TITANIUM/CRYSTAL/UMBRITE stockpile amounts no
  // longer gate a build (stripRetiredStockpileCost strips them before
  // spendStrategicCost ever sees them) -- hasFreeResourceSlots is the real
  // gate now. This test used to prove a low TITANIUM stockpile blocked the build
  // and left UMBRITE untouched; rewritten to prove the build now succeeds on
  // slot supply alone, and both legacy stockpile balances stay untouched.
  it("SIEGE_TOWER upgrade succeeds on slot supply alone, leaving legacy UMBRITE/TITANIUM stockpile balances untouched", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            // Both far below the old SIEGE_TOWER stockpile cost (UMBRITE 90, TITANIUM 60).
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["leatherworking", "siegecraft"]), strategicResources: { UMBRITE: 5, TITANIUM: 10 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 14, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" }, siegeOutpost: { ownerId: "player-1", status: "active", variant: "SIEGE_OUTPOST" as const } },
            { x: 15, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
            { x: 16, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
            { x: 17, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
            { x: 18, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
            { x: 19, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" }
          ],
          activeLocks: []
        }
      });

      const events: Array<{ code: string; message: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMMAND_REJECTED") events.push({ code: event.code, message: event.message });
      });

      runtime.submitCommand({
        commandId: "siege-resource-theft-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_SIEGE_OUTPOST",
        payloadJson: JSON.stringify({ x: 14, y: 14 })
      });

      await Promise.resolve();
      expect(events).toEqual([]);
      const tile = runtime.exportState().tiles.find((t) => t.x === 14 && t.y === 14);
      expect(tile?.siegeOutpostJson).toContain("\"variant\":\"SIEGE_TOWER\"");
      // Legacy stockpile balances must be completely untouched -- nothing is
      // spent from them for this build any more.
      const player = runtime.exportState().players.find((p) => p.id === "player-1")!;
      expect(player.strategicResources.UMBRITE).toBe(5);
      expect(player.strategicResources.TITANIUM).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds a mintworks through the rewrite simulation path directly on a support tile", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["trade"]), strategicResources: {} })
          ]
        ]),
        initialState: {
          tiles: [
            {
              x: 16,
              y: 16,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Trade Hub", type: "MARKET", populationTier: "TOWN" }
            },
            {
              x: 16,
              y: 17,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED"
            },
            // §5.3: the town draws 2 FOOD slots, MINTWORKS draws 1 more — supply
            // it or the build rejects with INSUFFICIENT_SLOT.
            { x: 16, y: 18, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 16, y: 19, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 16, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 16, y: 21, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 16, y: 22, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "mintworks-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 16, y: 17, structureType: "MINTWORKS" })
      });

      await Promise.resolve();
      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({
          x: 16,
          y: 17,
          economicStructureJson: expect.any(String)
        })
      );

      vi.advanceTimersByTime(structureBuildDurationMs("MINTWORKS"));

      const exported = runtime.exportState().tiles.find((tile) => tile.x === 16 && tile.y === 17);
      expect(exported?.economicStructureJson).toContain("\"type\":\"MINTWORKS\"");
      expect(exported?.economicStructureJson).toContain("\"status\":\"active\"");
    } finally {
      vi.useRealTimers();
    }
  });

  it("redirects a Mintworks/Garrison Hall/Weapons Factory targeted at the town tile itself onto an open support tile — only a Fort belongs directly on a town", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["trade"]), strategicResources: {} })
          ]
        ]),
        initialState: {
          tiles: [
            {
              x: 30,
              y: 30,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Redirect Town", type: "MARKET", populationTier: "TOWN" }
            },
            { x: 30, y: 31, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 30, y: 32, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 30, y: 33, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 30, y: 34, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 30, y: 35, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 30, y: 36, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "mintworks-on-town-tile",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        // Targeting the town tile itself (30,30), not a support tile.
        payloadJson: JSON.stringify({ x: 30, y: 30, structureType: "MINTWORKS" })
      });

      await Promise.resolve();
      // The town tile itself must stay clear...
      const townTile = runtime.exportState().tiles.find((tile) => tile.x === 30 && tile.y === 30);
      expect(townTile?.economicStructureJson).toBeUndefined();
      // ...and the build landed on the open support tile instead.
      const supportTile = runtime.exportState().tiles.find((tile) => tile.x === 30 && tile.y === 31);
      expect(supportTile?.economicStructureJson).toEqual(expect.stringContaining("\"type\":\"MINTWORKS\""));
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects duplicate support structures submitted directly on another support tile", async () => {
    // MINTWORKS moved to same-tile/uncapped placement in the tech-tree redesign
    // (per-town cap removed), so it no longer exercises the town_support
    // one-per-town rule this test covers -- CENSUS_HALL is still
    // town_support and needs no tech, so it stands in as the exemplar here.
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(), strategicResources: {} })
        ]
      ]),
      initialState: {
        tiles: [
          {
            x: 16,
            y: 16,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Trade Hub", type: "MARKET", populationTier: "TOWN" }
          },
          {
            x: 16,
            y: 17,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "CENSUS_HALL", status: "active" }
          },
          {
            x: 17,
            y: 16,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED"
          }
        ],
        activeLocks: []
      }
    });
    const events: Array<{ code: string; message: string }> = [];
    runtime.onEvent((event) => {
      if (event.eventType === "COMMAND_REJECTED") events.push({ code: event.code, message: event.message });
    });

    runtime.submitCommand({
      commandId: "census-hall-duplicate-support-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 17, y: 16, structureType: "CENSUS_HALL" })
    });

    await Promise.resolve();
    expect(events).toEqual([{ code: "BUILD_INVALID", message: "town already has census hall" }]);
    const duplicateTarget = runtime.exportState().tiles.find((tile) => tile.x === 17 && tile.y === 16);
    expect(duplicateTarget?.economicStructureJson).toBeUndefined();
  });

  it("builds a garrison hall with organized-supply tech and sufficient resources", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["organized-supply"]), strategicResources: { CRYSTAL: 200 } })
          ]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Fort Town", type: "FARMING", populationTier: "TOWN" }
            },
            { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            // §5.3: the town draws 4 FOOD slots, GARRISON_HALL draws 1 more.
            { x: 11, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 11, y: 12, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 11, y: 13, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 11, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
            { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
            // Ancillary Factory (same-tile, uncapped per town) — targets this
            // support tile directly, adjacent to the town but not on it.
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      });

      const events: Array<{ code: string; message: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMMAND_REJECTED") events.push({ code: event.code, message: event.message });
      });

      runtime.submitCommand({
        commandId: "garrison-hall-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 9, y: 10, structureType: "GARRISON_HALL" })
      });

      await Promise.resolve();
      expect(events).toHaveLength(0);

      vi.advanceTimersByTime(structureBuildDurationMs("GARRISON_HALL"));

      const exported = runtime.exportState().tiles.find((tile) => tile.x === 9 && tile.y === 10);
      expect(exported?.economicStructureJson).toContain("\"type\":\"GARRISON_HALL\"");
      expect(exported?.economicStructureJson).toContain("\"status\":\"active\"");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects garrison hall build when player lacks organized-supply", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, strategicResources: { CRYSTAL: 200 } })]
      ]),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Fort Town", type: "FARMING", populationTier: "TOWN" }
          }
        ],
        activeLocks: []
      }
    });

    const events: Array<{ code: string; message: string }> = [];
    runtime.onEvent((event) => {
      if (event.eventType === "COMMAND_REJECTED") events.push({ code: event.code, message: event.message });
    });

    runtime.submitCommand({
      commandId: "garrison-hall-no-tech-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "GARRISON_HALL" })
    });

    await Promise.resolve();
    expect(events).toHaveLength(1);
    expect(events[0].code).toBe("BUILD_INVALID");
    expect(events[0].message).toBe("unlock garrison hall first");
  });

  it("uncaptures an owned tile through the rewrite simulation path and clears owned structures on it", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialState: {
        tiles: [
          {
            x: 20,
            y: 20,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: {
              ownerId: "player-1",
              type: "UMBRITE_SYNTHESIZER",
              status: "active"
            }
          },
          {
            x: 21,
            y: 20,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER"
          }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => {
      events.push(event as unknown as Record<string, unknown>);
    });
    runtime.exportVisibleStateForPlayer("player-1");
    runtime.submitCommand({
      commandId: "uncapture-cmd-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "UNCAPTURE_TILE",
      payloadJson: JSON.stringify({ x: 20, y: 20 })
    });

    await Promise.resolve();

    const exportedTile = runtime.exportState().tiles.find((tile) => tile.x === 20 && tile.y === 20);
    expect(exportedTile).toEqual(expect.objectContaining({ x: 20, y: 20 }));
    expect(exportedTile?.ownerId).toBeUndefined();
    expect(exportedTile?.ownershipState).toBeUndefined();
    expect(exportedTile?.economicStructureJson).toBeUndefined();

    const uncaptureDeltaEvent = events.find(
      (event) => event.commandId === "uncapture-cmd-1" && event.eventType === "TILE_DELTA_BATCH"
    ) as { tileDeltas?: Array<Record<string, unknown>> } | undefined;
    const uncaptureTileDelta = uncaptureDeltaEvent?.tileDeltas?.[0];
    expect(uncaptureTileDelta).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(uncaptureTileDelta ?? {}, "ownerId")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(uncaptureTileDelta ?? {}, "ownershipState")).toBe(true);
    expect(uncaptureTileDelta?.ownerId).toBeUndefined();
    expect(uncaptureTileDelta?.ownershipState).toBeUndefined();
  });

  it("removes downstream frontier tiles when the bridging tile is uncaptured", async () => {
    // S (settled, 20,20) — F1 (frontier, 21,20) — F2 (frontier, 22,20)
    // F2's only path to settled territory runs through F1.
    // Uncapturing F1 immediately strips ownership from F2 (frontier decay removed in #627).
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialState: {
        tiles: [
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 21, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 22, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });

    runtime.submitCommand({
      commandId: "uncapture-bridge",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "UNCAPTURE_TILE",
      payloadJson: JSON.stringify({ x: 21, y: 20 })
    });

    await Promise.resolve();

    const f2 = runtime.exportState().tiles.find((t) => t.x === 22 && t.y === 20);
    expect(f2?.ownerId).toBeUndefined();
    expect(f2?.ownershipState).toBeUndefined();
  });

  it("rejects abandoning the last owned town so upkeep cannot continue with zero town income", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", testRuntimePlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 20,
            y: 20,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Only Town", type: "FARMING", populationTier: "TOWN" }
          },
          {
            x: 21,
            y: 20,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER"
          }
        ],
        activeLocks: []
      }
    });
    const events: SimulationRuntimeEventShape[] = [];
    runtime.onEvent((event) => {
      events.push(event);
    });

    runtime.submitCommand({
      commandId: "uncapture-last-town",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "UNCAPTURE_TILE",
      payloadJson: JSON.stringify({ x: 20, y: 20 })
    });

    await Promise.resolve();

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "COMMAND_REJECTED",
        commandId: "uncapture-last-town",
        code: "UNCAPTURE_LAST_TOWN"
      })
    );
    const exportedTile = runtime.exportState().tiles.find((tile) => tile.x === 20 && tile.y === 20);
    expect(exportedTile).toEqual(
      expect.objectContaining({
        ownerId: "player-1",
        ownershipState: "SETTLED",
        townPopulationTier: "TOWN"
      })
    );
  });

  it("reenables converter structures through the rewrite simulation path", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 20_000, manpower: 10_000, strategicResources: {} })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 24,
            y: 24,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: {
              ownerId: "player-1",
              type: "TITANIUM_WORKS",
              status: "inactive",
              inactiveReason: "manual"
            }
          }
        ],
        activeLocks: []
      }
    });

    runtime.submitCommand({
      commandId: "converter-cmd-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_CONVERTER_STRUCTURE_ENABLED",
      payloadJson: JSON.stringify({ x: 24, y: 24, enabled: true })
    });

    await Promise.resolve();

    const exportedTile = runtime.exportState().tiles.find((tile) => tile.x === 24 && tile.y === 24);
    expect(exportedTile?.economicStructureJson).toContain("\"status\":\"active\"");
    expect(exportedTile?.economicStructureJson).toContain("\"nextUpkeepAt\":601000");
  });

  it("replays the original command outcome for duplicate player sequence numbers", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({ now: () => 1_000 });
      runtime.submitCommand({
        commandId: "stage-muster",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 0,
        issuedAt: 1_000,
        type: "SET_MUSTER",
        payloadJson: JSON.stringify({ x: 10, y: 10, mode: "HOLD" })
      });
      await Promise.resolve();
      runtime.tickMuster(7_000);

      const seen: string[] = [];
      runtime.onEvent((event) => {
        seen.push(`${event.eventType}:${event.commandId}`);
      });

      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      runtime.submitCommand({
        commandId: "cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      runtime.submitCommand({
        commandId: "cmd-2",
        sessionId: "session-2",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_005,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      // player-2 is AI (#732 skips its PLAYER_UPDATE); the duplicate seq replays cmd-1's recorded events.
      expect(seen).toEqual([
        "COMMAND_ACCEPTED:cmd-1",
        "PLAYER_MESSAGE:cmd-1",
        "COMBAT_RESOLVED:cmd-1",
        "PLAYER_MESSAGE:cmd-1",
        "TILE_YIELD_ANCHOR_UPDATED:cmd-1:respawn:player-2",
        "TILE_DELTA_BATCH:cmd-1",
        "COMMAND_ACCEPTED:cmd-1",
        "PLAYER_MESSAGE:cmd-1",
        "COMBAT_RESOLVED:cmd-1",
        "PLAYER_MESSAGE:cmd-1",
        "TILE_DELTA_BATCH:cmd-1",
      ]);
      randomSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not swallow commands when recovered player-seq history has no replay events", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialCommandHistory: {
        commands: [
          {
            commandId: "recovered-cmd",
            sessionId: "session-1",
            playerId: "player-1",
            clientSeq: 1,
            type: "ATTACK",
            payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 }),
            queuedAt: 900,
            status: "RESOLVED",
            resolvedAt: 950
          }
        ],
        eventsByCommandId: new Map()
      }
    });
    runtime.submitCommand({
      commandId: "stage-muster",
      sessionId: "session-2",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 1_000,
      type: "SET_MUSTER",
      payloadJson: JSON.stringify({ x: 10, y: 10, mode: "HOLD" })
    });
    await Promise.resolve();
    runtime.tickMuster(7_000);

    const seen: string[] = [];
    runtime.onEvent((event) => {
      seen.push(`${event.eventType}:${event.commandId}`);
    });

    runtime.submitCommand({
      commandId: "new-cmd",
      sessionId: "session-2",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });
    await Promise.resolve();

    expect(seen[0]).toBe("COMMAND_ACCEPTED:new-cmd");
  });

  it("yields background lanes so a later human command is accepted before the rest of AI work", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({ now: () => 1_000, backgroundBatchSize: 1 });
      runtime.submitCommand({
        commandId: "stage-muster",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 0,
        issuedAt: 1_000,
        type: "SET_MUSTER",
        payloadJson: JSON.stringify({ x: 10, y: 10, mode: "HOLD" })
      });
      await Promise.resolve();
      runtime.tickMuster(7_000);

      const order: string[] = [];
      runtime.onEvent((event) => {
        order.push(event.eventType);
      });

      runtime.enqueueBackgroundJob(() => {
        order.push("AI_JOB_1");
      });
      runtime.enqueueBackgroundJob(() => {
        order.push("AI_JOB_2");
      });
      runtime.enqueueBackgroundJob(() => {
        order.push("AI_JOB_3");
      });

      runtime.submitCommand({
        commandId: "cmd-3",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 3,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      expect(order[0]).toBe("COMMAND_ACCEPTED");
      expect(order).not.toContain("AI_JOB_1");
      vi.advanceTimersByTime(0);
      expect(order).toContain("AI_JOB_1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes ai-runtime commands to the ai lane so queued human work stays ahead", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      seedProfile: "stress-10ai",
      scheduleSoon: (task) => {
        scheduled.push(task);
      },
      now: () => 1_000,
      // Merge-patch muster onto the two origin tiles (5,0)/(4,4) from the
      // stress-10ai seed, rather than staging it via SET_MUSTER commands
      // (which would themselves get queued into these same lanes and skew
      // the queueDepths assertion this test is actually about).
      initialState: {
        tiles: [
          {
            x: 5,
            y: 0,
            terrain: "LAND",
            resource: "FARM",
            ownerId: "ai-1",
            ownershipState: "SETTLED",
            muster: { ownerId: "ai-1", amount: 999, mode: "HOLD", updatedAt: 0 }
          },
          {
            x: 4,
            y: 4,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER",
            muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
          }
        ],
        activeLocks: []
      }
    });

    const seen: string[] = [];
    runtime.onEvent((event) => {
      seen.push(`${event.eventType}:${event.commandId}`);
    });

    runtime.submitCommand({
      commandId: "ai-cmd",
      sessionId: "ai-runtime:ai-1",
      playerId: "ai-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 5, fromY: 0, toX: 4, toY: 0 })
    });
    runtime.submitCommand({
      commandId: "human-cmd",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 4, fromY: 4, toX: 5, toY: 4 })
    });

    expect(runtime.queueDepths()).toEqual({
      human_interactive: 1,
      human_noninteractive: 0,
      system: 0,
      ai: 1
    });

    for (const task of scheduled) task();
    await Promise.resolve();

    expect(seen[0]).toBe("COMMAND_ACCEPTED:human-cmd");
  });

  it("routes system-runtime commands to the system lane so queued human work stays ahead", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      seedProfile: "stress-10ai",
      scheduleSoon: (task) => {
        scheduled.push(task);
      },
      now: () => 1_000,
      initialState: {
        tiles: [
          {
            x: 4,
            y: 4,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER",
            muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
          }
        ],
        activeLocks: []
      }
    });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      seen.push(`${event.eventType}:${event.commandId}`);
    });

    runtime.submitCommand({
      commandId: "system-cmd",
      sessionId: "system-runtime:barbarian-1",
      playerId: "barbarian-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 123, fromY: 1, toX: 124, toY: 1 })
    });
    runtime.submitCommand({
      commandId: "human-cmd",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 4, fromY: 4, toX: 5, toY: 4 })
    });

    expect(runtime.queueDepths()).toEqual({
      human_interactive: 1,
      human_noninteractive: 0,
      system: 1,
      ai: 0
    });

    for (const task of scheduled) task();
    await Promise.resolve();

    expect(seen[0]).toBe("COMMAND_ACCEPTED:human-cmd");
  });

  it("reports queue drain diagnostics with lane attribution", async () => {
    const scheduled: Array<() => void> = [];
    const onQueueDrain = vi.fn();
    const runtime = new SimulationRuntime({
      seedProfile: "stress-10ai",
      scheduleSoon: (task) => {
        scheduled.push(task);
      },
      onQueueDrain,
      now: (() => {
        let current = 1_000;
        return () => {
          current += 25;
          return current;
        };
      })()
    });

    runtime.submitCommand({
      commandId: "ai-cmd",
      sessionId: "ai-runtime:ai-1",
      playerId: "ai-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 5, fromY: 0, toX: 4, toY: 0 })
    });
    runtime.submitCommand({
      commandId: "human-cmd",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 4, fromY: 4, toX: 5, toY: 4 })
    });

    for (const task of scheduled) task();
    await Promise.resolve();

    expect(onQueueDrain).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        processedJobs: 1,
        yieldedForBackground: true,
        processedByLane: expect.objectContaining({
          human_interactive: 1,
          ai: 0
        }),
        queueDepthsBefore: expect.objectContaining({
          human_interactive: 1,
          ai: 1
        }),
        queueDepthsAfter: {
          human_interactive: 0,
          human_noninteractive: 0,
          system: 0,
          ai: 1
        }
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onQueueDrain).toHaveBeenCalledWith(
      expect.objectContaining({
        processedJobs: 1,
        processedByLane: expect.objectContaining({
          human_interactive: 0,
          ai: 1
        }),
        queueDepthsAfter: {
          human_interactive: 0,
          human_noninteractive: 0,
          system: 0,
          ai: 0
        }
      })
    );
  });

  it("hydrates recovered tile ownership into authoritative startup state", () => {
    const runtime = new SimulationRuntime({
      initialState: {
        tiles: [
          { x: 10, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 12 }
        ],
        activeLocks: []
      }
    });

    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({
        x: 10,
        y: 11,
        ownerId: "player-1",
        ownershipState: "FRONTIER",
        terrain: "LAND"
      })
    );
  });

  it("hydrates unresolved combat locks into authoritative startup state", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialState: {
        tiles: [
          { x: 10, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 11, ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 10, y: 12 }
        ],
        activeLocks: [
          {
            commandId: "recovered-lock",
            playerId: "player-1",
            actionType: "ATTACK",
            originX: 10,
            originY: 10,
            targetX: 10,
            targetY: 11,
            originKey: "10,10",
            targetKey: "10,11",
            resolvesAt: 4_000
          }
        ]
      }
    });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      if (event.eventType === "COMMAND_REJECTED") {
        seen.push(event.code);
      }
    });

    runtime.submitCommand({
      commandId: "cmd-after-restart",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });

    await Promise.resolve();
    expect(seen).toEqual(["ATTACK_COOLDOWN"]);
  });

  it("returns LOCKED when origin tile lock is owned by another player", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialState: {
        tiles: [
          { x: 10, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 11, ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 10, y: 9, ownerId: "player-3", ownershipState: "FRONTIER" }
        ],
        activeLocks: [
          {
            commandId: "enemy-lock",
            playerId: "player-3",
            actionType: "ATTACK",
            originX: 10,
            originY: 9,
            targetX: 10,
            targetY: 10,
            originKey: "10,9",
            targetKey: "10,10",
            resolvesAt: 4_000
          }
        ]
      }
    });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      if (event.eventType === "COMMAND_REJECTED") seen.push(event.code);
    });

    runtime.submitCommand({
      commandId: "cmd-origin-locked-by-enemy",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 3,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });

    await Promise.resolve();
    expect(seen).toEqual(["LOCKED"]);
  });

  it("resolves recovered combat locks after restart", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      initialState: {
        tiles: [
          { x: 9, y: 10, ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 10, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 11, ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 10, y: 12 }
        ],
        activeLocks: [
          {
            commandId: "recovered-lock",
            playerId: "player-1",
            actionType: "ATTACK",
            originX: 10,
            originY: 10,
            targetX: 10,
            targetY: 11,
            originKey: "10,10",
            targetKey: "10,11",
            resolvesAt: 1_500
          }
        ]
      }
    });

    expect(scheduledTasks).toHaveLength(1);
    expect(scheduledTasks[0]?.delayMs).toBe(500);

    scheduledTasks[0]?.task();

    expect(runtime.exportState().activeLocks).toEqual([]);
    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({
        x: 10,
        y: 11,
        ownerId: "player-1",
        ownershipState: "FRONTIER",
        terrain: "LAND"
      })
    );
    randomSpy.mockRestore();
  });

  it("replays recovered command outcomes after restart instead of reprocessing", async () => {
    const runtime = new SimulationRuntime({
      initialCommandHistory: {
        commands: [
          {
            commandId: "cmd-1",
            sessionId: "session-1",
            playerId: "player-1",
            clientSeq: 1,
            type: "ATTACK",
            payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 }),
            queuedAt: 1_000,
            status: "RESOLVED",
            acceptedAt: 1_100,
            resolvedAt: 1_200
          }
        ],
        eventsByCommandId: new Map([
          [
            "cmd-1",
            [
              {
                eventType: "COMMAND_ACCEPTED" as const,
                commandId: "cmd-1",
                playerId: "player-1",
                actionType: "ATTACK",
                originX: 10,
                originY: 10,
                targetX: 10,
                targetY: 11,
                resolvesAt: 1_150
              },
              {
                eventType: "COMBAT_RESOLVED" as const,
                commandId: "cmd-1",
                playerId: "player-1",
                originX: 10,
                originY: 10,
                targetX: 10,
                targetY: 11,
                attackerWon: true
              }
            ]
          ]
        ])
      }
    });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      seen.push(`${event.eventType}:${event.commandId}`);
    });

    runtime.submitCommand({
      commandId: "cmd-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 2_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });

    await Promise.resolve();
    expect(seen).toEqual(["COMMAND_ACCEPTED:cmd-1", "COMBAT_RESOLVED:cmd-1"]);
  });

  it("requeues recovered queued commands after restart", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialCommandHistory: {
          commands: [
            {
              commandId: "cmd-queued",
              sessionId: "session-1",
              playerId: "player-1",
              clientSeq: 1,
              type: "ATTACK",
              payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 }),
              queuedAt: 900,
              status: "QUEUED"
            }
          ],
          eventsByCommandId: new Map()
        },
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            }
          ],
          activeLocks: []
        }
      });
      const seen: string[] = [];
      runtime.onEvent((event) => {
        seen.push(`${event.eventType}:${event.commandId}`);
      });

      await Promise.resolve();
      expect(seen[0]).toBe("COMMAND_ACCEPTED:cmd-queued");
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits a single-tile delta for a hostile capture after combat resolution (no reveal scan for ATTACK)", async () => {
    // commit fbef13aa ("fix(sim): skip capture-reveal scan for ATTACK") made
    // ATTACK (like EXPAND before it) always take the single-captured-tile
    // delta branch in runtime-lock-resolution.ts instead of the (2r+1)²
    // buildCaptureRevealTileDeltas scan — that scan could reach 361+ tiles
    // under vision-tech bonuses and was synchronously blocking the sim event
    // loop for 481-557ms+, causing gateway submit timeouts. Since lock
    // actionType is only ever "ATTACK" | "EXPAND" (runtime-frontier-command.ts),
    // and both are excluded, buildCaptureRevealTileDeltas is now unreachable
    // from a real capture for a human player — this test used to assert the
    // (9,11) neighbor tile got revealed as part of that scan, which no
    // longer happens by design. Rewritten to assert the real current
    // behavior: only the captured tile's own delta is emitted.
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
            { x: 9, y: 11, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });
      const tileDeltaEvents: Array<{ x: number; y: number; ownerId?: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "TILE_DELTA_BATCH") {
          tileDeltaEvents.push(...event.tileDeltas);
        }
      });

      runtime.submitCommand({
        commandId: "cmd-delta",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 9,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      expect(tileDeltaEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER", terrain: "LAND" })
        ])
      );
      expect(tileDeltaEvents.some((delta) => delta.x === 9 && delta.y === 11 && !delta.ownerId)).toBe(false);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("emits only the captured tile delta for AI captures to keep replay/event pressure low", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["ai-1", buildPlayer("ai-1", { isAi: true })]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER" },
            { x: 10, y: 8, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
            { x: 10, y: 11, terrain: "LAND" },
            { x: 9, y: 11, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });
      const tileDeltaBatches: Array<{ commandId: string; tileDeltas: Array<{ x: number; y: number; ownerId?: string }> }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "TILE_DELTA_BATCH" && event.commandId === "ai-expand-1") {
          tileDeltaBatches.push({ commandId: event.commandId, tileDeltas: event.tileDeltas });
        }
      });

      runtime.submitCommand({
        commandId: "ai-expand-1",
        sessionId: "ai-runtime:ai-1",
        playerId: "ai-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      // First batch is the EXPAND resolution (just the new tile — the "AI compact delta" guarantee).
      // A second batch may follow for encirclement cut-off detection on the newly acquired tiles;
      // that is also a small set (not a full world reveal), so the low-event-pressure goal is met.
      expect(tileDeltaBatches.length).toBeGreaterThanOrEqual(1);
      expect(tileDeltaBatches[0]?.tileDeltas).toEqual([
        expect.objectContaining({ x: 10, y: 11, ownerId: "ai-1", ownershipState: "FRONTIER", terrain: "LAND" })
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits only the captured tile delta for barbarian captures despite isAi:false", async () => {
    // Barbarians carry isAi:false by design (they stay out of AI-respawn /
    // income-repair), so a bare `attacker.isAi` check would route them through
    // the human vision-radius capture-reveal path — dozens of ownerId:null
    // wilderness deltas that the broadcast forwards to every client as
    // ownership-clears. This asserts the isAiControlledActor guard keeps
    // barbarian captures to a single-tile delta. Regression for the mid-map
    // neutral-tile flood.
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "barbarian-1",
            buildPlayer("barbarian-1", { points: Number.MAX_SAFE_INTEGER, manpower: Number.MAX_SAFE_INTEGER, mods: { attack: 1_000, defense: 1, income: 1, vision: 1 } })
          ],
                      ["player-2", buildPlayer("player-2", { manpower: 1 })]
        ]),
        initialState: {
          // Dense neutral neighbourhood around the target so a regressed
          // (reveal-square) path would balloon to ~VISION_RADIUS² deltas —
          // this is what makes the assertion able to tell the two paths apart.
          tiles: (() => {
            const t: Array<{ x: number; y: number; terrain: "LAND"; ownerId?: string; ownershipState?: "SETTLED" | "FRONTIER" }> = [];
            for (let x = 6; x <= 14; x += 1) {
              for (let y = 7; y <= 15; y += 1) t.push({ x, y, terrain: "LAND" });
            }
            const at = (x: number, y: number) => t.find((tile) => tile.x === x && tile.y === y)!;
            Object.assign(at(10, 10), { ownerId: "barbarian-1", ownershipState: "SETTLED" });
            Object.assign(at(10, 11), { ownerId: "player-2", ownershipState: "SETTLED" });
            return t;
          })(),
          activeLocks: []
        }
      });
      const barbBatches: Array<Array<{ x: number; y: number; ownerId?: string }>> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "TILE_DELTA_BATCH" && event.commandId === "barb-attack-1") {
          barbBatches.push(event.tileDeltas);
        }
      });

      runtime.submitCommand({
        commandId: "barb-attack-1",
        sessionId: "system-runtime:barbarian-1",
        playerId: "barbarian-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      // Resolution batch must contain the captured tile and stay small (a few
      // coalesced breach/walk tiles) — NOT the ~81-tile vision-radius reveal
      // square that the human capture-reveal path would emit. The 81-tile
      // neighbourhood above is fully populated, so a regression would blow the
      // batch well past this bound.
      expect(barbBatches.length).toBeGreaterThanOrEqual(1);
      expect(barbBatches[0]).toEqual(
        expect.arrayContaining([expect.objectContaining({ x: 10, y: 11, ownerId: "barbarian-1" })])
      );
      expect(barbBatches[0].length).toBeLessThan(9);
      // No distant neutral reveal tile (only the reveal square would surface one).
      expect(barbBatches[0].some((d) => d.x === 6 && d.y === 7)).toBe(false);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("settles an owned frontier tile without inventing a town", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          {
            x: 10,
            y: 9,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" }
          }
        ],
        activeLocks: []
      }
    });
    const seen: Array<{ eventType: string; commandId: string; playerId: string; tileDeltas?: unknown[] }> = [];
    runtime.onEvent((event) => {
      seen.push(event as SimulationRuntimeEventShape);
    });

    runtime.submitCommand({
      commandId: "settle-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });

    await Promise.resolve();

    expect(scheduledTasks).toHaveLength(1);
    expect(scheduledTasks[0]?.delayMs).toBe(60_000);

    scheduledTasks[0]?.task();

    expect(seen).toContainEqual(
      expect.objectContaining({
        eventType: "TILE_DELTA_BATCH",
        commandId: "settle-1",
        playerId: "player-1",
        tileDeltas: [
          expect.objectContaining({
            x: 10,
            y: 10,
            ownerId: "player-1",
            ownershipState: "SETTLED"
          })
        ]
      })
    );
    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({
        x: 10,
        y: 10,
        ownerId: "player-1",
        ownershipState: "SETTLED"
      })
    );
    const settledTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
    expect(settledTile?.townType).toBeUndefined();
    expect(settledTile?.townName).toBeUndefined();
  });

  it("cancels pending settlement when the tile is captured and ignores the stale settle timer after recapture", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.001);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { manpower: 10_000 })],
          ["ai-1", buildPlayer("ai-1", { isAi: true, manpower: 10_000 })]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            // Settled anchor so recaptured tiles are connected and won't encirclement-expire.
            {
              x: 10,
              y: 8,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" }
            },
            {
              x: 10,
              y: 9,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "ai-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "ai-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            { x: 10, y: 12, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "settle-cancelled-by-capture",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      expect(runtime.exportState().pendingSettlements).toContainEqual(
        expect.objectContaining({ ownerId: "player-1", tileKey: "10,10" })
      );
      expect(runtime.exportState().players.find((entry) => entry.id === "player-1")?.points).toBe(100);

      runtime.submitCommand({
        commandId: "ai-captures-settling-tile",
        sessionId: "ai-runtime:ai-1",
        playerId: "ai-1",
        clientSeq: 1,
        issuedAt: 1_100,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 11, toX: 10, toY: 10 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      expect(runtime.exportState().pendingSettlements).not.toContainEqual(
        expect.objectContaining({ ownerId: "player-1", tileKey: "10,10" })
      );
      // Settlement was cancelled by the capture, not completed — refund the
      // gold that was spent to start it instead of leaving it lost forever.
      expect(runtime.exportState().players.find((entry) => entry.id === "player-1")?.points).toBe(100);
      expect(runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10)).toEqual(
        expect.objectContaining({ ownerId: "ai-1", ownershipState: "FRONTIER" })
      );

      runtime.submitCommand({
        commandId: "player-recaptures-before-stale-settle",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 2,
        issuedAt: 1_200,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 9, toX: 10, toY: 10 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
      vi.advanceTimersByTime(60_000);

      expect(runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10)).toEqual(
        expect.objectContaining({ ownerId: "player-1", ownershipState: "FRONTIER" })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps a new pending settlement when an old canceled settle timer fires", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.001);
    let now = 1_000;
    try {
      const runtime = new SimulationRuntime({
        now: () => now,
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { manpower: 10_000 })],
          ["ai-1", buildPlayer("ai-1", { isAi: true, manpower: 10_000 })]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            // Settled anchor so frontier tiles are connected and won't encirclement-expire.
            {
              x: 10,
              y: 8,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" }
            },
            {
              x: 10,
              y: 9,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "ai-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "ai-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            { x: 10, y: 12, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "old-settle",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: now,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      now = 2_000;
      runtime.submitCommand({
        commandId: "ai-captures-old-settle",
        sessionId: "ai-runtime:ai-1",
        playerId: "ai-1",
        clientSeq: 1,
        issuedAt: now,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 11, toX: 10, toY: 10 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      now = 6_000;
      runtime.submitCommand({
        commandId: "player-recaptures-for-new-settle",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 2,
        issuedAt: now,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 9, toX: 10, toY: 10 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      now = 10_000;
      runtime.submitCommand({
        commandId: "new-settle",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 3,
        issuedAt: now,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      expect(runtime.exportState().pendingSettlements).toContainEqual(
        expect.objectContaining({ ownerId: "player-1", tileKey: "10,10", startedAt: 10_000 })
      );

      vi.advanceTimersByTime(53_800);
      expect(runtime.exportState().pendingSettlements).toContainEqual(
        expect.objectContaining({ ownerId: "player-1", tileKey: "10,10", startedAt: 10_000 })
      );
      expect(runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10)).toEqual(
        expect.objectContaining({ ownerId: "player-1", ownershipState: "FRONTIER" })
      );

      now = 70_000;
      vi.advanceTimersByTime(6_200);
      expect(runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10)).toEqual(
        expect.objectContaining({ ownerId: "player-1", ownershipState: "SETTLED" })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("preserves synthetic settlement towns in recovered state", () => {
    const runtime = new SimulationRuntime({
      initialState: {
        tiles: [
          {
            x: 12,
            y: 18,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: {
              name: "Settlement 12,18",
              type: "FARMING",
              populationTier: "SETTLEMENT"
            }
          }
        ],
        activeLocks: []
      }
    });

    const settledTile = runtime.exportState().tiles.find((tile) => tile.x === 12 && tile.y === 18);
    expect(settledTile).toEqual(
      expect.objectContaining({
        x: 12,
        y: 18,
        ownerId: "player-1",
        ownershipState: "SETTLED"
      })
    );
    expect(settledTile).toEqual(
      expect.objectContaining({
        townType: "FARMING",
        townName: "Settlement 12,18",
        townPopulationTier: "SETTLEMENT"
      })
    );
    const recoveredTown = settledTile?.townJson ? JSON.parse(settledTile.townJson) : undefined;
    expect(recoveredTown).toEqual(
      expect.objectContaining({
        populationTier: "SETTLEMENT",
        population: 800,
        maxPopulation: 10_000_000
      })
    );
  });

  it("respawns instead of overwriting the only town when recovered gross income is zero", () => {
    const runtime = new SimulationRuntime({
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 12,
            y: 18,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: {
              name: "Starved Town",
              type: "FARMING",
              populationTier: "TOWN"
            }
          },
          {
            x: 13,
            y: 18,
            terrain: "LAND",
            town: {
              name: "Neutral Town",
              type: "FARMING",
              populationTier: "TOWN"
            }
          },
          {
            x: 14,
            y: 18,
            terrain: "LAND"
          }
        ],
        activeLocks: [],
        players: [
          {
            id: "player-1",
            name: "Nauticus",
            points: 0,
            manpower: 100,
            techIds: [],
            domainIds: [],
            allies: [],
            incomePerMinute: 0,
            strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 }
          }
        ]
      }
    });
    expect(runtime.repairZeroGrossIncomeSettlements(["player-1"]).repaired).toBe(1);

    const recoveredState = runtime.exportState();
    const originalTown = recoveredState.tiles.find((tile) => tile.x === 12 && tile.y === 18);
    expect(originalTown).toEqual(
      expect.objectContaining({
        ownerId: "player-1",
        ownershipState: "SETTLED",
        townName: "Starved Town",
        townPopulationTier: "TOWN"
      })
    );
    const neutralTown = recoveredState.tiles.find((tile) => tile.x === 13 && tile.y === 18);
    expect(neutralTown?.ownerId).toBeUndefined();
    expect(neutralTown).toEqual(
      expect.objectContaining({
        townName: "Neutral Town",
        townPopulationTier: "TOWN"
      })
    );
    const respawnedSettlement = recoveredState.tiles.find((tile) => tile.x === 14 && tile.y === 18);
    expect(respawnedSettlement).toEqual(
      expect.objectContaining({
        ownerId: "player-1",
        ownershipState: "SETTLED",
        townName: "Respawn 14,18",
        townPopulationTier: "SETTLEMENT"
      })
    );
    expect(recoveredState.players.find((player) => player.id === "player-1")?.incomePerMinute).toBeGreaterThan(0);
  });

  it("does not leak seed-only resources, towns, or structures back onto recovered tiles after restart", () => {
    const runtime = new SimulationRuntime({
      seedTiles: new Map([
        [
          "12,18",
          {
            x: 12,
            y: 18,
            terrain: "LAND",
            resource: "GEMS",
            dockId: "dock-1",
            shardSite: { storedShard: 2, capacity: 4, generatedAt: 1_000 },
            town: {
              name: "Seed Town",
              type: "FARMING",
              populationTier: "TOWN"
            },
            fort: { ownerId: "player-1", status: "active" },
            observatory: { ownerId: "player-1", status: "active" },
            siegeOutpost: { ownerId: "player-1", status: "active" },
            economicStructure: {
              ownerId: "player-1",
              type: "MILL",
              status: "active",
              level: 1,
              enabled: true
            }
          }
        ]
      ]),
      initialState: {
        tiles: [
          {
            x: 12,
            y: 18,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER"
          }
        ],
        activeLocks: []
      }
    });

    const recoveredTile = runtime.exportState().tiles.find((tile) => tile.x === 12 && tile.y === 18);
    expect(recoveredTile).toEqual(
      expect.objectContaining({
        x: 12,
        y: 18,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "FRONTIER"
      })
    );
    expect(recoveredTile?.resource).toBeUndefined();
    expect(recoveredTile?.dockId).toBeUndefined();
    expect(recoveredTile?.shardSite).toBeUndefined();
    expect(recoveredTile?.townType).toBeUndefined();
    expect(recoveredTile?.townName).toBeUndefined();
    expect(recoveredTile?.fort).toBeUndefined();
    expect(recoveredTile?.observatory).toBeUndefined();
    expect(recoveredTile?.siegeOutpost).toBeUndefined();
    expect(recoveredTile?.economicStructure).toBeUndefined();
  });

  it("backfills missing seed coordinates when recovered restart state is sparse", () => {
    const runtime = new SimulationRuntime({
      mergeSeedTilesWithInitialState: false,
      seedTiles: new Map([
        [
          "12,18",
          {
            x: 12,
            y: 18,
            terrain: "LAND",
            resource: "GEMS"
          }
        ],
        [
          "12,19",
          {
            x: 12,
            y: 19,
            terrain: "SEA",
            resource: "FISH"
          }
        ]
      ]),
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1")]
      ]),
      initialState: {
        tiles: [
          {
            x: 12,
            y: 18,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER"
          }
        ],
        activeLocks: []
      }
    });

    const recoveredOwnedTile = runtime.exportState().tiles.find((tile) => tile.x === 12 && tile.y === 18);
    expect(recoveredOwnedTile).toEqual(
      expect.objectContaining({
        x: 12,
        y: 18,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "FRONTIER"
      })
    );
    expect(recoveredOwnedTile?.resource).toBeUndefined();

    expect(runtime.exportState().tiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          x: 12,
          y: 19,
          terrain: "SEA",
          resource: "FISH"
        })
      ])
    );
  });

  it("enforces the development slot cap for settlements and emits live player updates", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 13, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      },
      initialPlayers: new Map([
        [
          "player-1",
          testRuntimePlayer("player-1", { name: "Nauticus" })
        ]
      ])
    });
    const seen: SimulationRuntimeEventShape[] = [];
    runtime.onEvent((event) => {
      seen.push(event as SimulationRuntimeEventShape);
    });

    for (const [index, x] of [10, 11, 12].entries()) {
      runtime.submitCommand({
        commandId: `settle-${index + 1}`,
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: index + 1,
        issuedAt: 1_000,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x, y: 10 })
      });
      await Promise.resolve();
    }

    const playerUpdateEvents = seen.filter(
      (event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE"
    ) as Array<SimulationRuntimeEventShape & { payloadJson: string }>;
    const latestStartUpdate = playerUpdateEvents.at(-1);
    expect(latestStartUpdate).toBeDefined();
    expect(JSON.parse(latestStartUpdate!.payloadJson)).toEqual(
      expect.objectContaining({
        gold: 100,
        developmentProcessLimit: 3,
        activeDevelopmentProcessCount: 3,
        pendingSettlements: expect.arrayContaining([
          expect.objectContaining({ x: 10, y: 10 }),
          expect.objectContaining({ x: 11, y: 10 }),
          expect.objectContaining({ x: 12, y: 10 })
        ])
      })
    );

    runtime.submitCommand({
      commandId: "settle-4",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 4,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 13, y: 10 })
    });
    await Promise.resolve();

    expect(seen).toContainEqual(
      expect.objectContaining({
        eventType: "COMMAND_REJECTED",
        commandId: "settle-4",
        playerId: "player-1",
        code: "SETTLE_INVALID",
        message: "development slots are busy"
      })
    );
  });

  it("restores player balances, pending settlements, and collect buffers from snapshot state after restart", () => {
    const settledEvents: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 10_000,
      scheduleAfter: (delayMs, task) => {
        settledEvents.push({ delayMs, task });
      },
      initialState: {
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "FARM" }],
        activeLocks: [],
        players: [
          {
            id: "player-1",
            name: "Nauticus",
            points: 77,
            manpower: 123,
            manpowerUpdatedAt: 10_000,
            techIds: ["agriculture"],
            domainIds: ["river-kingdoms"],
            allies: [],
            strategicResources: { FOOD: 5 },
            incomeMultiplier: 1.25,
            vision: 2
          }
        ],
        pendingSettlements: [
          {
            ownerId: "player-1",
            tileKey: "10,10",
            startedAt: 5_000,
            resolvesAt: 70_000,
            goldCost: 3
          }
        ],
        tileYieldCollectedAtByTile: [{ tileKey: "10,10", collectedAt: 9_000 }]
      }
    });

    const snapshot = runtime.exportSnapshotSections();
    const recovered = new SimulationRuntime({
      now: () => 10_000,
      scheduleAfter: (delayMs, task) => {
        settledEvents.push({ delayMs, task });
      },
      initialState: snapshot.initialState
    });
    const recoveredState = recovered.exportState();
    const recoveredPlayer = recoveredState.players.find((entry) => entry.id === "player-1");

    expect(recoveredPlayer).toEqual(
      expect.objectContaining({
        id: "player-1",
        name: "Nauticus",
        points: 77,
        manpower: 123,
        techIds: ["agriculture"],
        domainIds: ["river-kingdoms"]
      })
    );
    expect(recoveredState.pendingSettlements).toEqual([
      expect.objectContaining({
        ownerId: "player-1",
        tileKey: "10,10",
        resolvesAt: 70_000
      })
    ]);
    expect(recoveredState.tileYieldCollectedAtByTile).toEqual([
      expect.objectContaining({ tileKey: "10,10", collectedAt: 9_000 })
    ]);
    expect(settledEvents.some((entry) => entry.delayMs === 60_000)).toBe(true);
  });

  it("restores first-three-town order from snapshot state after restart", () => {
    const runtime = new SimulationRuntime({
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 0, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "METROPOLIS", name: "Four" } },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "TOWN", name: "One" } },
          { x: 20, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "TOWN", name: "Two" } },
          { x: 30, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "TOWN", name: "Three" } },
          // §5.4: each town needs 4 FOOD slots to not go dormant (TOWN_FOOD_SLOT_DEMAND),
          // plus METROPOLIS's +3 tier step (townFoodSlotDemandForTier) — 10 FISH
          // tiles (2 slots each = 20) cover all 4 towns' demand (7+4+4+4=19)
          // with a slot to spare.
          { x: 1, y: 10, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 21, y: 10, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 31, y: 10, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 41, y: 10, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 51, y: 10, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 61, y: 10, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 71, y: 10, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 81, y: 10, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 91, y: 10, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" }
        ],
        activeLocks: [],
        players: [
          {
            id: "player-1",
            points: 0,
            manpower: 0,
            techIds: ["trade"],
            domainIds: ["mercantile-charter"],
            strategicResources: { FOOD: 10 },
            allies: [],
            ownedTownTileKeys: ["10,10", "20,10", "30,10", "0,10"]
          }
        ]
      }
    });

    const recovered = new SimulationRuntime({
      seedTiles: new Map(),
      initialState: runtime.exportSnapshotSections().initialState
    });
    const recoveredPlayer = recovered.exportState().players.find((player) => player.id === "player-1");

    expect(recoveredPlayer?.ownedTownTileKeys).toEqual(["10,10", "20,10", "30,10", "0,10"]);
    expect(recoveredPlayer?.incomePerMinute).toBeCloseTo(15.4 / 288); // was 15.4 pre-gold-rescope (§6.1)
  });

  it("preserves AI identity from initial players when recovered player rows omit isAi", () => {
    const runtime = new SimulationRuntime({
      initialPlayers: new Map([
        ["ai-1", testRuntimePlayer("ai-1", { isAi: true, name: "ai-1", strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 } })]
      ]),
      initialState: {
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" }],
        activeLocks: [],
        players: [
          {
            id: "ai-1",
            name: "ai-1",
            points: 77,
            manpower: 123
          }
        ]
      }
    });

    expect(runtime.exportSnapshotSections().initialState.players).toContainEqual(
      expect.objectContaining({
        id: "ai-1",
        isAi: true,
        points: 77,
        manpower: 123
      })
    );
  });

  it("emits reveal updates and revealed empire stats through player messages", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["cryptography", "surveying", "beacon-towers"]), strategicResources: { CRYSTAL: 1_000 } })
        ],
        [
          "player-2",
          buildPlayer("player-2", { isAi: true, points: 900, manpower: 700, techIds: new Set<string>(["crystal-lattices"]), strategicResources: { FOOD: 4, TITANIUM: 3, CRYSTAL: 2, UMBRITE: 1, SHARD: 0 } })
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
          // §5.4: CRYSTAL supply so the Observatory isn't dormant.
          { x: 6, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const playerMessages: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => {
      if (event.eventType === "PLAYER_MESSAGE") playerMessages.push(JSON.parse(event.payloadJson) as Record<string, unknown>);
    });

    runtime.submitCommand({
      commandId: "reveal-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "REVEAL_EMPIRE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2" })
    });
    runtime.submitCommand({
      commandId: "reveal-stats-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "REVEAL_EMPIRE_STATS",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2" })
    });

    await Promise.resolve();

    expect(playerMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "REVEAL_EMPIRE_UPDATE", activeTargets: ["player-2"] }),
        expect.objectContaining({
          type: "REVEAL_EMPIRE_STATS_RESULT",
          stats: expect.objectContaining({ playerId: "player-2", settledTiles: 1, frontierTiles: 1 })
        })
      ])
    );
  });

  it("applies Siphon as a 15-crystal 3x3 full-output suppression", async () => {
    const runtime = new SimulationRuntime({
      now: () => 10_000,
      initialPlayers: new Map([
        [
          "player-1",
          testRuntimePlayer("player-1", {
            points: 20_000,
            techIds: new Set<string>(["logistics"]),
            strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 100, UMBRITE: 0, SHARD: 0 }
          })
        ],
        ["player-2", testRuntimePlayer("player-2", { isAi: true })]
      ]),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            observatory: { ownerId: "player-1", status: "active" }
          },
          { x: 1, y: 1, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 0, y: 1, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "TITANIUM" },
          { x: 2, y: 1, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER", resource: "UMBRITE" },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } },
          { x: 1, y: 2, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
          { x: 2, y: 2, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          // §5.4: CRYSTAL supply so player-1's Observatory isn't dormant.
          { x: 0, y: 2, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "siphon-radius",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 10_000,
      type: "SIPHON_TILE",
      payloadJson: JSON.stringify({ x: 1, y: 1 })
    });
    await Promise.resolve();

    const batch = seen.find(
      (event): event is Extract<SimulationRuntimeEventShape, { eventType: "TILE_DELTA_BATCH" }> =>
        event.eventType === "TILE_DELTA_BATCH" &&
        event.commandId === "siphon-radius" &&
        event.tileDeltas.some((delta) => typeof delta.sabotageJson === "string")
    );
    expect(batch?.tileDeltas).toHaveLength(4);
    const sabotaged = batch?.tileDeltas.map((delta) => ({
      x: delta.x,
      y: delta.y,
      sabotage: JSON.parse(delta.sabotageJson ?? "null") as { ownerId: string; endsAt: number; outputMultiplier: number } | null
    })) ?? [];
    expect(sabotaged.map((tile) => tile.x + "," + tile.y).sort()).toEqual(["0,1", "1,0", "1,1", "2,1"]);
    for (const tile of sabotaged) {
      expect(tile.sabotage?.ownerId).toBe("player-1");
      expect(tile.sabotage?.endsAt).toBe(10_000 + SIPHON_DURATION_MS);
      expect(tile.sabotage?.outputMultiplier).toBe(0);
    }
    const actor = runtime.exportState().players.find((player) => player.id === "player-1");
    expect(actor?.strategicResources?.CRYSTAL).toBe(100 - SIPHON_CRYSTAL_COST);
    const visible = runtime.exportTilesInAreaForPlayer("player-2", 1, 1, 1, { fullVisibility: true });
    const crystalTile = visible.find((tile) => tile.x === 1 && tile.y === 1);
    expect(crystalTile?.yieldRate?.strategicPerDay?.CRYSTAL ?? 0).toBe(0);
  });

  it("migrates siphon, purge, shard collection, and terrain shaping through authoritative tile deltas", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 20_000, manpower: 10_000, techIds: new Set<string>(["logistics", "terrain-engineering"]), strategicResources: { CRYSTAL: 2_000, SHARD: 0 } })
        ],
                  ["player-2", buildAiOpponent()]
      ]),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            observatory: { ownerId: "player-1", status: "active" }
          },
          {
            x: 5,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            observatory: { ownerId: "player-1", status: "active" }
          },
          {
            x: 6,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            observatory: { ownerId: "player-1", status: "active" }
          },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 0, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", sabotage: { ownerId: "player-2", endsAt: 2_000, outputMultiplier: 0.5 } },
          { x: 1, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 2, y: 1, terrain: "MOUNTAIN" },
          { x: 1, y: 2, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", shardSite: { kind: "CACHE", amount: 3 } },
          // §5.4/user decision: Observatory upkeep is now progressive (1st=1,
          // 2nd=2, 3rd=3 CRYSTAL slots), so 3 Observatories need 1+2+3=6
          // CRYSTAL slots total, not a flat 3, for none of them to go dormant.
          { x: 7, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 8, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 9, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 10, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 11, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 12, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const seen = new Map<string, unknown[]>();
    runtime.onEvent((event) => {
      const events = seen.get(event.commandId) ?? [];
      events.push(event);
      seen.set(event.commandId, events);
    });

    runtime.submitCommand({
      commandId: "siphon-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SIPHON_TILE",
      payloadJson: JSON.stringify({ x: 1, y: 0 })
    });
    runtime.submitCommand({
      commandId: "purge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "PURGE_SIPHON",
      payloadJson: JSON.stringify({ x: 0, y: 1 })
    });
    runtime.submitCommand({
      commandId: "create-mountain-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 3,
      issuedAt: 1_000,
      type: "CREATE_MOUNTAIN",
      payloadJson: JSON.stringify({ x: 1, y: 1 })
    });
    runtime.submitCommand({
      commandId: "remove-mountain-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 4,
      issuedAt: 1_000,
      type: "REMOVE_MOUNTAIN",
      payloadJson: JSON.stringify({ x: 2, y: 1 })
    });
    runtime.submitCommand({
      commandId: "collect-shard-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 5,
      issuedAt: 1_000,
      type: "COLLECT_SHARD",
      payloadJson: JSON.stringify({ x: 1, y: 2 })
    });

    await Promise.resolve();

    expect(JSON.stringify(seen.get("siphon-1"))).toContain("sabotageJson");
    expect(JSON.stringify(seen.get("purge-1"))).not.toContain("sabotageJson");
    expect(runtime.exportState().tiles).toContainEqual(expect.objectContaining({ x: 1, y: 1, terrain: "MOUNTAIN" }));
    expect(runtime.exportState().tiles).toContainEqual(expect.objectContaining({ x: 2, y: 1, terrain: "LAND" }));
    expect(JSON.stringify(seen.get("collect-shard-1"))).toContain("\"SHARD\":3");
  });

  it("rejects COLLECT_SHARD on a shard tile the player does not own", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 1_000, manpower: 1_000, strategicResources: { SHARD: 0 } })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 1, y: 0, terrain: "LAND", shardSite: { kind: "CACHE", amount: 4 } }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "collect-unowned",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "COLLECT_SHARD",
      payloadJson: JSON.stringify({ x: 1, y: 0 })
    });

    await Promise.resolve();

    expect(seen).toContainEqual(
      expect.objectContaining({
        eventType: "COMMAND_REJECTED",
        commandId: "collect-unowned",
        playerId: "player-1",
        code: "COLLECT_NOT_OWNED"
      })
    );
    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({ x: 1, y: 0, shardSiteJson: expect.stringContaining("\"amount\":4") })
    );
  });

  it("emits a PLAYER_UPDATE with the new SHARD stock after a successful collect", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 1_000, manpower: 1_000, strategicResources: { SHARD: 0 } })]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", shardSite: { kind: "CACHE", amount: 5 } }
        ],
        activeLocks: []
      }
    });
    const playerMessages: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => {
      if (event.eventType === "PLAYER_MESSAGE" && event.commandId === "collect-owned") {
        playerMessages.push(JSON.parse(event.payloadJson) as Record<string, unknown>);
      }
    });

    runtime.submitCommand({
      commandId: "collect-owned",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "COLLECT_SHARD",
      payloadJson: JSON.stringify({ x: 1, y: 0 })
    });

    await Promise.resolve();

    expect(playerMessages).toContainEqual(
      expect.objectContaining({
        type: "PLAYER_UPDATE",
        strategicResources: expect.objectContaining({ SHARD: 5 })
      })
    );
  });

  it("publishes aether bridge and wall updates and blocks frontier crossings through active walls", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 20_000, manpower: 10_000, techIds: new Set<string>(["navigation", "harborcraft"]), strategicResources: { CRYSTAL: 2_000 } })
        ],
                  ["player-2", buildAiOpponent()]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
          { x: 0, y: 1, terrain: "SEA" },
          { x: 0, y: 2, terrain: "SEA" },
          { x: 0, y: 3, terrain: "SEA" },
          { x: 0, y: 4, terrain: "SEA" },
          { x: 0, y: 5, terrain: "LAND" },
          { x: 2, y: 2, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
          { x: 3, y: 2, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          // §5.4/user decision: Observatory upkeep is now progressive (1st=1,
          // 2nd=2 CRYSTAL slots), so 2 Observatories need 1+2=3 CRYSTAL slots
          // total, not a flat 2, for neither to go dormant.
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 21, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 22, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => {
      events.push(event as unknown as Record<string, unknown>);
    });

    runtime.submitCommand({
      commandId: "bridge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CAST_AETHER_BRIDGE",
      payloadJson: JSON.stringify({ x: 0, y: 5 })
    });
    runtime.submitCommand({
      commandId: "wall-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "CAST_AETHER_WALL",
      payloadJson: JSON.stringify({ x: 2, y: 2, direction: "E", length: 1 })
    });

    await Promise.resolve();

    runtime.submitCommand({
      commandId: "blocked-attack-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 3,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 2, fromY: 2, toX: 3, toY: 2 })
    });

    await Promise.resolve();

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "PLAYER_MESSAGE",
        commandId: "bridge-1",
        messageType: "AETHER_BRIDGE_UPDATE"
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "PLAYER_MESSAGE",
        commandId: "wall-1",
        messageType: "AETHER_WALL_UPDATE"
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "COMMAND_REJECTED",
        commandId: "blocked-attack-1"
      })
    );
  });

  it("allows expand across an active aether bridge", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 20_000, manpower: 10_000, techIds: new Set<string>(["navigation", "harborcraft"]), strategicResources: { CRYSTAL: 2_000 } })
        ]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" }, town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 0, y: 1, terrain: "SEA" },
          { x: 0, y: 2, terrain: "SEA" },
          { x: 0, y: 3, terrain: "LAND" },
          // §5.4: CRYSTAL supply so the Observatory isn't dormant.
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => {
      events.push(event as unknown as Record<string, unknown>);
    });

    // Cast a bridge from (0,0) to (0,3)
    runtime.submitCommand({
      commandId: "bridge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CAST_AETHER_BRIDGE",
      payloadJson: JSON.stringify({ x: 0, y: 3 })
    });

    await Promise.resolve();

    // Expand across the bridge
    runtime.submitCommand({
      commandId: "expand-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 0, toY: 3 })
    });

    await Promise.resolve();

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "COMMAND_ACCEPTED",
        commandId: "expand-1",
        actionType: "EXPAND"
      })
    );

    // Verify no NOT_ADJACENT rejection
    expect(events).not.toContainEqual(
      expect.objectContaining({
        eventType: "COMMAND_REJECTED",
        commandId: "expand-1",
        code: "NOT_ADJACENT"
      })
    );
  });

  it("rejects expand across an aether bridge after expiry", async () => {
    let clock = 1_000;
    const runtime = new SimulationRuntime({
      now: () => clock,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 20_000, manpower: 10_000, techIds: new Set<string>(["navigation", "harborcraft"]), strategicResources: { CRYSTAL: 2_000 } })
        ]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" }, town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 0, y: 1, terrain: "SEA" },
          { x: 0, y: 2, terrain: "SEA" },
          { x: 0, y: 3, terrain: "LAND" },
          // §5.4: CRYSTAL supply so the Observatory isn't dormant.
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => {
      events.push(event as unknown as Record<string, unknown>);
    });

    // Cast a bridge
    runtime.submitCommand({
      commandId: "bridge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CAST_AETHER_BRIDGE",
      payloadJson: JSON.stringify({ x: 0, y: 3 })
    });

    await Promise.resolve();

    // Prove the bridge is active before expiry
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "PLAYER_MESSAGE",
        commandId: "bridge-1",
        messageType: "AETHER_BRIDGE_UPDATE"
      })
    );

    // Pre-expiry expand: must be accepted
    runtime.submitCommand({
      commandId: "expand-pre",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 0, toY: 3 })
    });

    await Promise.resolve();

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "COMMAND_ACCEPTED",
        commandId: "expand-pre",
        actionType: "EXPAND"
      })
    );

    // Advance past bridge expiry
    clock = 1_000_000_000;

    // Same expand should now be rejected
    runtime.submitCommand({
      commandId: "expand-post",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 3,
      issuedAt: 1_000_000_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 0, toY: 3 })
    });

    await Promise.resolve();

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "COMMAND_REJECTED",
        commandId: "expand-post",
        code: "NOT_ADJACENT"
      })
    );
  });

  it("rejects expand to a non-bridged target when only aether bridge crossing could apply", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 20_000, manpower: 10_000, techIds: new Set<string>(["navigation", "harborcraft"]), strategicResources: { CRYSTAL: 2_000 } })
        ]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" }, town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 0, y: 1, terrain: "SEA" },
          { x: 0, y: 2, terrain: "SEA" },
          { x: 0, y: 3, terrain: "LAND" },
          { x: 0, y: 4, terrain: "LAND" },
          // Second reach anchor near the non-bridged target so this test
          // exercises the NOT_ADJACENT rejection path itself rather than
          // failing earlier on OUT_OF_REACH (target (0,4) is 4 tiles from
          // the (0,0) town, just outside TOWN_REACH_RADIUS).
          {
            x: 0,
            y: 7,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Outpost", type: "FARMING", populationTier: "SETTLEMENT" }
          },
          // §5.4: CRYSTAL supply so the Observatory isn't dormant.
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => {
      events.push(event as unknown as Record<string, unknown>);
    });

    // Cast a bridge to (0,3)
    runtime.submitCommand({
      commandId: "bridge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CAST_AETHER_BRIDGE",
      payloadJson: JSON.stringify({ x: 0, y: 3 })
    });

    await Promise.resolve();

    // Prove the bridge is active
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "PLAYER_MESSAGE",
        commandId: "bridge-1",
        messageType: "AETHER_BRIDGE_UPDATE"
      })
    );

    // Try to expand to (0,4) which is NOT a bridge endpoint
    runtime.submitCommand({
      commandId: "expand-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 0, toY: 4 })
    });

    await Promise.resolve();

    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "COMMAND_REJECTED",
        commandId: "expand-1",
        code: "NOT_ADJACENT"
      })
    );
  });

  it("resolves airport bombardment through rewrite tile deltas", async () => {
    // Force all per-tile rolls to hit (Math.random returns 1, always above miss threshold)
    const randSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 20_000, manpower: 10_000, strategicResources: { CRYSTAL: 200 } })],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "AIRPORT", status: "active" }
          },
          {
            x: 1,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "AETHER_TOWER", status: "active" }
          },
          { x: 2, y: 2, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } },
          {
            x: 2,
            y: 3,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "FRONTIER",
            muster: { ownerId: "player-2", amount: 15, mode: "HOLD", updatedAt: 500 }
          },
          // §5.4: CRYSTAL supply so AIRPORT/AETHER_TOWER aren't dormant.
          // AIRPORT demands 3 CRYSTAL slots and AETHER_TOWER another 1 (see
          // packages/shared/src/structure-slots/structure-slots.ts), so 4
          // GEMS tiles (1 CRYSTAL base slot each) are needed — 2 GEMS tiles
          // only ever supplied 2, silently dormanting one of the two
          // structures under the resource-slot tie-break.
          { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 6, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          { x: 7, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          // §5.4: FOOD supply (FISH gives 2 base slots, §5.3) covering both
          // AETHER_TOWER's own 1 FOOD slot and the pre-existing seed-world
          // Nauticus town at (10,10) this suite always merges in (a lone
          // FARM/town tile supplying 1 against a 2-slot town demand) — a
          // single FARM tile here would leave that hidden town short and,
          // via the "newest first, key tie-break" dormancy rule, would
          // sometimes dormant the tower itself instead.
          { x: 5, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" }
        ],
        activeLocks: []
      }
    });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => {
      events.push(event as unknown as Record<string, unknown>);
    });

    runtime.submitCommand({
      commandId: "bombard-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AIRPORT_BOMBARD",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 2, toY: 2 })
    });

    await Promise.resolve();
    randSpy.mockRestore();

    const deltaBatch = events.find(
      (e) => e["eventType"] === "TILE_DELTA_BATCH" && e["commandId"] === "bombard-1"
    );
    expect(deltaBatch).toBeDefined();
    const tileDeltas = deltaBatch!["tileDeltas"] as Array<Record<string, unknown>>;

    // Stripped tiles should appear in the batch
    expect(tileDeltas).toEqual(expect.arrayContaining([
      expect.objectContaining({ x: 2, y: 2 }),
      expect.objectContaining({ x: 2, y: 3 })
    ]));

    // Structures are preserved — town on (2,2) survives
    const tile22Delta = tileDeltas.find((d) => d["x"] === 2 && d["y"] === 2);
    expect(tile22Delta).toBeDefined();
    expect(tile22Delta!["townJson"]).toBeDefined();
    expect(tile22Delta!["ownerId"]).toBeUndefined();

    // A muster flag staged on a bombed tile is destroyed along with its
    // manpower, not left behind on the now-neutral tile or refunded.
    const tile23Delta = tileDeltas.find((d) => d["x"] === 2 && d["y"] === 3);
    expect(tile23Delta).toBeDefined();
    expect(tile23Delta!["musterJson"]).toBeFalsy();
    const defender = runtime.exportState().players.find((p) => p.id === "player-2");
    expect(defender?.manpower).toBeLessThan(10_010);

    // Airport tile should include a bombardCooldownUntil in its economicStructureJson
    const airportDelta = tileDeltas.find((d) => d["x"] === 0 && d["y"] === 0);
    expect(airportDelta).toBeDefined();
    const airportStructureJson = airportDelta!["economicStructureJson"];
    expect(typeof airportStructureJson).toBe("string");
    const airportStructure = JSON.parse(airportStructureJson as string) as Record<string, unknown>;
    expect(typeof airportStructure["bombardCooldownUntil"]).toBe("number");
    expect(airportStructure["bombardCooldownUntil"] as number).toBeGreaterThan(1_000);
  });

  const buildAetherTowerRuntime = (options: {
    towerX?: number; towerY?: number;
    towerStatus?: "active" | "under_construction";
    towerOwnerId?: string; omitTower?: boolean; points?: number;
    resources?: { CRYSTAL?: number };
  } = {}): SimulationRuntime => {
    const tiles: Array<Record<string, unknown>> = [
      {
        x: 0,
        y: 0,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "SETTLED",
        economicStructure: { ownerId: "player-1", type: "AIRPORT", status: "active" }
      },
      { x: 2, y: 2, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } },
      { x: 2, y: 3, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
      // §5.4: CRYSTAL supply so AIRPORT/AETHER_TOWER aren't dormant. AIRPORT
      // alone demands 3 CRYSTAL slots and AETHER_TOWER another 1 (see
      // packages/shared/src/structure-slots/structure-slots.ts), so 4 GEMS
      // tiles (1 CRYSTAL base slot each) are needed to cover the combined
      // demand — 2 GEMS tiles (the old count here) only ever supplied 2,
      // silently leaving one of the two structures dormant under the
      // resource-slot tie-break and breaking every bombardment test that
      // expects the airport to actually be usable.
      { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      { x: 6, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      { x: 7, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      // §5.4: FOOD supply so AETHER_TOWER (1 FOOD slot) isn't dormant — a
      // dormant tower no longer powers isStructurePowered's callers. FISH
      // (2 base FOOD slots, §5.3) rather than FARM (1) because this suite
      // always merges in the seed-world Nauticus town at (10,10), whose
      // own FARM/town tile nets a 1-slot FOOD shortfall on its own — a
      // single FARM tile here would leave that hidden shortfall in place
      // and risk the tie-break dormanting the tower instead.
      { x: 5, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" }
    ];
    if (!options.omitTower) {
      tiles.push({
        x: options.towerX ?? 1,
        y: options.towerY ?? 0,
        terrain: "LAND",
        ownerId: options.towerOwnerId ?? "player-1",
        ownershipState: "SETTLED",
        economicStructure: {
          ownerId: options.towerOwnerId ?? "player-1",
          type: "AETHER_TOWER",
          status: options.towerStatus ?? "active"
        }
      });
    }
    return new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: options.points ?? 20_000, manpower: 10_000, strategicResources: options.resources ?? { CRYSTAL: 10 } })
        ],
                  ["player-2", buildAiOpponent()]
      ]),
      initialState: { tiles: tiles as never, activeLocks: [] }
    });
  };

  it("isStructurePowered: true when an active Aether Tower is in range", () => {
    const runtime = buildAetherTowerRuntime({ towerX: 30, towerY: 0 });
    expect(runtime.isStructurePowered("player-1", "0,0", "AIRPORT")).toBe(true);
  });

  it("isStructurePowered: false when Aether Tower is out of range", () => {
    const runtime = buildAetherTowerRuntime({ towerX: 31, towerY: 0 });
    expect(runtime.isStructurePowered("player-1", "0,0", "AIRPORT")).toBe(false);
  });

  it("isStructurePowered: false when Aether Tower is still under construction", () => {
    const runtime = buildAetherTowerRuntime({ towerStatus: "under_construction" });
    expect(runtime.isStructurePowered("player-1", "0,0", "AIRPORT")).toBe(false);
  });

  it("isStructurePowered: false when Aether Tower belongs to another player", () => {
    const runtime = buildAetherTowerRuntime({ towerOwnerId: "player-2" });
    expect(runtime.isStructurePowered("player-1", "0,0", "AIRPORT")).toBe(false);
  });

  describe("§5.4 dormancy on resource-slot shortfall", () => {
    it("marks only the newest of two Forts dormant when there's just one TITANIUM slot", () => {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", buildPlayer("player-1")]]),
        mergeSeedTilesWithInitialState: false,
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 0, y: 0, terrain: "LAND", resource: "TITANIUM", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", fort: { ownerId: "player-1", status: "active", variant: "FORT", activatedAt: 100 } },
            { x: 2, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", fort: { ownerId: "player-1", status: "active", variant: "FORT", activatedAt: 200 } }
          ],
          activeLocks: []
        }
      });
      expect(runtime.isStructureDormant("player-1", "1,0", "fort")).toBe(false);
      expect(runtime.isStructureDormant("player-1", "2,0", "fort")).toBe(true);
    });

    it("a town's FOOD demand is protected ahead of a newer FOOD-slot building", () => {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", buildPlayer("player-1")]]),
        mergeSeedTilesWithInitialState: false,
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 0, y: 0, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 3, y: 0, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } },
            {
              x: 2,
              y: 0,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              economicStructure: { ownerId: "player-1", type: "MINTWORKS", status: "active", activatedAt: 500 }
            }
          ],
          activeLocks: []
        }
      });
      // Supply = 4 FOOD slots (2 bare FISH tiles). Demand = 4 (town) + 1 (Mintworks) = 5, short by 1 —
      // shedding just the newer Mintworks covers it, so the town isn't touched.
      expect(runtime.isTownFoodDormant("player-1", "1,0")).toBe(false);
      expect(runtime.isStructureDormant("player-1", "2,0", "economicStructure")).toBe(true);
    });

    it("excludes a dormant Mintworks's gold bonus from the exported tile view (tileDeltaFromState)", () => {
      // Regression: tileDeltaFromState (the function every TILE_DELTA_BATCH/
      // exportTilesInAreaForPlayer response goes through) calls
      // enrichTileWithTownContext -> refreshTownEconomyFields, a SEPARATE
      // path from buildPlayerUpdateEconomySnapshot's authoritative gold
      // total. It was missing the dormancy set entirely, so a dormant
      // Mintworks/Bank/Clearing House still showed its bonus in the client's
      // own tile view even though the player's real income excluded it.
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", buildPlayer("player-1")]]),
        mergeSeedTilesWithInitialState: false,
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 0, y: 0, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 3, y: 0, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
            {
              x: 1,
              y: 0,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: {
                type: "MARKET",
                populationTier: "TOWN",
                supportCurrent: 1,
                supportMax: 1,
                population: 10_000,
                maxPopulation: 10_000_000
              }
            },
            {
              x: 2,
              y: 0,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              economicStructure: { ownerId: "player-1", type: "MINTWORKS", status: "active", activatedAt: 500 }
            }
          ],
          activeLocks: []
        }
      });
      // Same supply/demand shape as the test above: 4 FOOD slots supply,
      // 4 (town) + 1 (Mintworks) = 5 demand — the newer Mintworks goes dormant,
      // the town stays fed.
      expect(runtime.isStructureDormant("player-1", "2,0", "economicStructure")).toBe(true);

      const [centerDelta] = runtime.exportTilesInAreaForPlayer("player-1", 1, 0, 0, { fullVisibility: true });
      const town = centerDelta?.townJson ? (JSON.parse(centerDelta.townJson) as { goldPerMinute?: number }) : undefined;
      // TOWN_BASE_GOLD_PER_MIN * supportRatio(1) * tierMult(1) — no Mintworks
      // 1.5x multiplier applied, since the dormant Mintworks doesn't count.
      // Before the fix this was TOWN_BASE_GOLD_PER_MIN * 1.5.
      expect(town?.goldPerMinute).toBeCloseTo(TOWN_BASE_GOLD_PER_MIN, 6);
    });
  });

  it("rejects AIRPORT_BOMBARD without a powering Aether Tower", async () => {
    const runtime = buildAetherTowerRuntime({ omitTower: true });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "bombard-unpowered",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AIRPORT_BOMBARD",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 2, toY: 2 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "COMMAND_REJECTED",
        commandId: "bombard-unpowered",
        code: "AIRPORT_BOMBARD_INVALID",
        message: "airport requires a nearby Aether Tower"
      })
    );
    expect(events.some((event) => event["eventType"] === "TILE_DELTA_BATCH" && event["commandId"] === "bombard-unpowered")).toBe(false);
  });

  it("AIRPORT_BOMBARD succeeds with zero gold (commit ea54f603: bombard is now free, was 5,000 gold)", async () => {
    // This test used to assert a COMMAND_REJECTED "insufficient gold for
    // bombardment" here, from back when AIRPORT_BOMBARD_GOLD_COST was 5,000.
    // Commit ea54f603 deliberately zeroed it ("Aetherport bombard is now
    // free"), so `actor.points < AIRPORT_BOMBARD_GOLD_COST` (0) can never be
    // true for any non-negative points value — that rejection branch is now
    // permanently unreachable by design. Rewritten to assert the real
    // current behavior instead: bombardment succeeds even with 0 gold.
    const runtime = buildAetherTowerRuntime({ points: 0 });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "bombard-no-gold",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AIRPORT_BOMBARD",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 2, toY: 2 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "COMMAND_RESOLVED",
        commandId: "bombard-no-gold"
      })
    );
    expect(events.some((event) => event["eventType"] === "COMMAND_REJECTED" && event["commandId"] === "bombard-no-gold")).toBe(false);
  });

  it("threads attacker outpost aura into resolved combat atkEff", async () => {
    // End-to-end smoke test: confirms the runtime wires `scanOutpostMult` into
    // `rollFrontierCombat` via `buildLockedCombatResolution`. The aura
    // algorithm itself (reach, wrap, status filter, Siege > Light) is covered
    // exhaustively in `packages/shared/src/outpost-aura.test.ts`. The new tile
    // at (11,10) sits at Chebyshev distance 1 from the origin (10,10), inside
    // the reach=2 aura; without it the attacker should hit the unboosted 10.
    const buildRuntime = (withOutpost: boolean): SimulationRuntime =>
      new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { manpower: 5_000 })],
          ["player-2", buildPlayer("player-2", { manpower: 5_000 })]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              town: { name: "Target", type: "FARMING", populationTier: "SETTLEMENT" }
            },
            // Gives the defender at least one Titanium and one Umbrite Weapons
            // Factory so the "unarmed" vulnerability multiplier
            // (NO_WAR_INDUSTRY_ATTACK_VULNERABILITY_MULT) stays neutral —
            // this test is about outpost aura, not that mechanic.
            {
              x: 9,
              y: 11,
              terrain: "LAND" as const,
              ownerId: "player-2",
              ownershipState: "SETTLED" as const,
              economicStructure: { ownerId: "player-2", type: "TITANIUM_WEAPONS_FACTORY" as const, status: "active" as const }
            },
            {
              x: 8,
              y: 11,
              terrain: "LAND" as const,
              ownerId: "player-2",
              ownershipState: "SETTLED" as const,
              economicStructure: { ownerId: "player-2", type: "UMBRITE_WEAPONS_FACTORY" as const, status: "active" as const }
            },
            ...(withOutpost
              ? [
                  {
                    x: 11,
                    y: 10,
                    terrain: "LAND" as const,
                    ownerId: "player-1",
                    ownershipState: "SETTLED" as const,
                    economicStructure: {
                      ownerId: "player-1",
                      type: "RELAY_BEACON" as const,
                      status: "active" as const
                    }
                  },
                  // §5.4: RELAY_BEACON needs 1 FOOD slot to not go dormant.
                  {
                    x: 12,
                    y: 10,
                    terrain: "LAND" as const,
                    resource: "FISH" as const,
                    ownerId: "player-1",
                    ownershipState: "SETTLED" as const
                  }
                ]
              : [])
          ],
          activeLocks: []
        }
      });

    const captureAtkEff = async (runtime: SimulationRuntime): Promise<number | undefined> => {
      const seen = collectEvents(runtime);
      runtime.submitCommand({
        commandId: "atk-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      const accepted = seen.find(
        (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
          event.eventType === "COMMAND_ACCEPTED"
      );
      return accepted?.combatResult?.atkEff;
    };

    const baselineAtkEff = await captureAtkEff(buildRuntime(false));
    const boostedAtkEff = await captureAtkEff(buildRuntime(true));

    expect(baselineAtkEff).toBe(10);
    expect(boostedAtkEff).toBeCloseTo(12.5, 6);
  });

  it("threads owned Weapons Workshop count into resolved combat atkEff and defEff", async () => {
    // End-to-end smoke test: confirms the runtime wires
    // ownedStructureCountForPlayer("WEAPONS_WORKSHOP") into
    // resolveAttackCombat's combatModifiers on both the attacker (atkMult)
    // and defender (defMult) side. The mult math itself is covered
    // exhaustively in frontier-combat.test.ts.
    const buildRuntime = (attackerWorkshops: number, defenderWorkshops: number): SimulationRuntime => {
      const workshopTile = (x: number, y: number, ownerId: string) => ({
        x,
        y,
        terrain: "LAND" as const,
        ownerId,
        ownershipState: "SETTLED" as const,
        economicStructure: { ownerId, type: "WEAPONS_WORKSHOP" as const, status: "active" as const }
      });
      const tiles = [
        {
          x: 10,
          y: 10,
          terrain: "LAND" as const,
          ownerId: "player-1",
          ownershipState: "FRONTIER" as const,
          muster: { ownerId: "player-1", amount: 999, mode: "HOLD" as const, updatedAt: 0 }
        },
        {
          x: 10,
          y: 11,
          terrain: "LAND" as const,
          ownerId: "player-2",
          ownershipState: "SETTLED" as const,
          town: { name: "Target", type: "FARMING" as const, populationTier: "SETTLEMENT" as const }
        },
        // Gives both sides one Titanium + one Umbrite Weapons Factory so the
        // "unarmed" vulnerability multiplier (either direction) stays
        // neutral — this test is about the (legacy) Weapons Workshop mult.
        { x: 9, y: 11, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "SETTLED" as const, economicStructure: { ownerId: "player-2", type: "TITANIUM_WEAPONS_FACTORY" as const, status: "active" as const } },
        { x: 8, y: 11, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "SETTLED" as const, economicStructure: { ownerId: "player-2", type: "UMBRITE_WEAPONS_FACTORY" as const, status: "active" as const } },
        { x: 9, y: 9, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, economicStructure: { ownerId: "player-1", type: "TITANIUM_WEAPONS_FACTORY" as const, status: "active" as const } },
        { x: 8, y: 9, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, economicStructure: { ownerId: "player-1", type: "UMBRITE_WEAPONS_FACTORY" as const, status: "active" as const } }
      ];
      for (let i = 0; i < attackerWorkshops; i += 1) tiles.push(workshopTile(20 + i, 10, "player-1"));
      for (let i = 0; i < defenderWorkshops; i += 1) tiles.push(workshopTile(30 + i, 10, "player-2"));
      return new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { manpower: 5_000 })],
          ["player-2", buildPlayer("player-2", { manpower: 5_000 })]
        ]),
        seedTiles: new Map(),
        initialState: { tiles, activeLocks: [] }
      });
    };

    const captureCombatResult = async (runtime: SimulationRuntime): Promise<{ atkEff: number; defEff: number } | undefined> => {
      const seen = collectEvents(runtime);
      runtime.submitCommand({
        commandId: "atk-workshop-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      const accepted = seen.find(
        (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
          event.eventType === "COMMAND_ACCEPTED"
      );
      return accepted?.combatResult ? { atkEff: accepted.combatResult.atkEff, defEff: accepted.combatResult.defEff } : undefined;
    };

    const baseline = await captureCombatResult(buildRuntime(0, 0));
    const attackerBoosted = await captureCombatResult(buildRuntime(2, 0));
    const defenderBoosted = await captureCombatResult(buildRuntime(0, 3));

    // Attacker's own 1 Titanium + 1 Umbrite Weapons Factory (added above to
    // keep the mirrored defense-vulnerability mult neutral) is a constant
    // factor on every atkEff assertion below.
    const attackerFactoryAtkMult = 1.015 * 1.03;
    expect(baseline?.atkEff).toBeCloseTo(10 * attackerFactoryAtkMult, 6);
    // 2 owned Weapons Workshops: +3%/each -> 1.06x
    expect(attackerBoosted?.atkEff).toBeCloseTo(10 * attackerFactoryAtkMult * 1.06, 6);
    // Target is SETTLED with a town (1.2x), 3 owned Weapons Workshops
    // (+9%), plus the fixture's own 1 Titanium (+3%) / 1 Umbrite (+1.5%)
    // Weapons Factory — both now count empire-wide regardless of network.
    expect(defenderBoosted?.defEff).toBeCloseTo(10 * 1.2 * 1.09 * 1.03 * 1.015, 6);
  });

  it("threads Titanium/Umbrite Weapons Factory counts into resolved combat atkEff and defEff, empire-wide regardless of town network", async () => {
    // End-to-end smoke test: confirms the runtime sums each side's total
    // owned active Titanium/Umbrite Weapons Factory count (ownedStructureCountForPlayer,
    // a full-empire index — not scoped to any particular town's connected
    // network) and threads it into resolveAttackCombat's combatModifiers.
    // The mult math itself is covered exhaustively in frontier-combat.test.ts;
    // this test is purely about the wiring between the two.
    const factoryTile = (x: number, y: number, ownerId: string, type: "TITANIUM_WEAPONS_FACTORY" | "UMBRITE_WEAPONS_FACTORY") => ({
      x,
      y,
      terrain: "LAND" as const,
      ownerId,
      ownershipState: "SETTLED" as const,
      economicStructure: { ownerId, type, status: "active" as const }
    });
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 5_000 })],
        ["player-2", buildPlayer("player-2", { manpower: 5_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER",
            muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
          },
          {
            x: 10,
            y: 11,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            town: { name: "Target", type: "FARMING", populationTier: "TOWN" }
          },
          // Player-1's factories live on a town far from the attack origin —
          // deliberately distant, to prove the bonus is empire-wide (it
          // counts regardless of geometric distance from the attack, or
          // which town network it's connected to). 2 Titanium + 1 Umbrite
          // Weapons Factory on its support tiles.
          { x: 50, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Capital", type: "FARMING", populationTier: "TOWN" } },
          factoryTile(50, 49, "player-1", "TITANIUM_WEAPONS_FACTORY"),
          factoryTile(49, 50, "player-1", "TITANIUM_WEAPONS_FACTORY"),
          factoryTile(51, 50, "player-1", "UMBRITE_WEAPONS_FACTORY"),
          // Resource-slot backing (§5.4) so the three factories above aren't
          // dormant: 2 TITANIUM slots for the 2 Titanium Weapons Factories, 1 UMBRITE
          // slot for the 1 Umbrite Weapons Factory.
          { x: 52, y: 50, terrain: "LAND", resource: "TITANIUM" as const, ownerId: "player-1", ownershipState: "SETTLED" as const },
          { x: 53, y: 50, terrain: "LAND", resource: "TITANIUM" as const, ownerId: "player-1", ownershipState: "SETTLED" as const },
          { x: 54, y: 50, terrain: "LAND", resource: "UMBRITE" as const, ownerId: "player-1", ownershipState: "SETTLED" as const },
          // Defender's own empire: 1 Titanium + 1 Umbrite Weapons Factory adjacent
          // to the target town itself, which also neutralizes the "unarmed"
          // vulnerability multiplier (both types present).
          factoryTile(9, 11, "player-2", "TITANIUM_WEAPONS_FACTORY"),
          factoryTile(9, 12, "player-2", "UMBRITE_WEAPONS_FACTORY"),
          { x: 8, y: 11, terrain: "LAND" as const, resource: "TITANIUM" as const, ownerId: "player-2", ownershipState: "SETTLED" as const },
          { x: 7, y: 11, terrain: "LAND" as const, resource: "UMBRITE" as const, ownerId: "player-2", ownershipState: "SETTLED" as const }
        ],
        activeLocks: []
      }
    });

    const seen = collectEvents(runtime);
    runtime.submitCommand({
      commandId: "atk-factories-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });
    await Promise.resolve();
    const accepted = seen.find(
      (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
        event.eventType === "COMMAND_ACCEPTED"
    );

    // Attacker: 2 Titanium (+1.5% each) * 1 Umbrite (+3%) = 1.03 * 1.03. No
    // vulnerability penalty (defender owns both types).
    expect(accepted?.combatResult?.atkEff).toBeCloseTo(10 * 1.03 * 1.03, 6);
    // Defender: SETTLED + town (1.2x), 1 Titanium (+3%) * 1 Umbrite (+1.5%).
    expect(accepted?.combatResult?.defEff).toBeCloseTo(10 * 1.2 * 1.03 * 1.015, 6);
  });

  it("doubles attacker effectiveness when the defender has no war industry, and clears once both factory types exist", async () => {
    const factoryTile = (x: number, y: number, ownerId: string, type: "TITANIUM_WEAPONS_FACTORY" | "UMBRITE_WEAPONS_FACTORY") => ({
      x,
      y,
      terrain: "LAND" as const,
      ownerId,
      ownershipState: "SETTLED" as const,
      economicStructure: { ownerId, type, status: "active" as const }
    });
    const buildRuntime = (defenderFactories: Array<"TITANIUM_WEAPONS_FACTORY" | "UMBRITE_WEAPONS_FACTORY">): SimulationRuntime =>
      new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { manpower: 5_000 })],
          ["player-2", buildPlayer("player-2", { manpower: 5_000 })]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              town: { name: "Target", type: "FARMING", populationTier: "SETTLEMENT" }
            },
            ...defenderFactories.map((type, i) => factoryTile(9 - i, 11, "player-2", type))
          ],
          activeLocks: []
        }
      });

    const captureAtkEff = async (runtime: SimulationRuntime): Promise<number | undefined> => {
      const seen = collectEvents(runtime);
      runtime.submitCommand({
        commandId: "atk-unarmed-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      const accepted = seen.find(
        (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
          event.eventType === "COMMAND_ACCEPTED"
      );
      return accepted?.combatResult?.atkEff;
    };

    const neitherFactory = await captureAtkEff(buildRuntime([]));
    const titaniumOnly = await captureAtkEff(buildRuntime(["TITANIUM_WEAPONS_FACTORY"]));
    const both = await captureAtkEff(buildRuntime(["TITANIUM_WEAPONS_FACTORY", "UMBRITE_WEAPONS_FACTORY"]));

    // Missing both -> flat 2x, same as missing just one (confirmed design:
    // does not stack to 4x).
    expect(neitherFactory).toBeCloseTo(20, 6);
    expect(titaniumOnly).toBeCloseTo(20, 6);
    // Both present -> no vulnerability penalty.
    expect(both).toBeCloseTo(10, 6);
  });

  describe("barbarian walk vs multiply", () => {
    const buildBarbRuntime = (input: {
      barbTiles: Array<{ x: number; y: number; resource?: "WHEAT"; town?: boolean }>;
      targetTile: { x: number; y: number; ownerId?: string; resource?: "WHEAT"; town?: boolean; ownershipState?: "FRONTIER" | "SETTLED" };
      lockOrigin: { x: number; y: number };
      lockTarget: { x: number; y: number };
      attackerId: string;
    }): { runtime: SimulationRuntime; randomSpy: ReturnType<typeof vi.spyOn>; runResolve: () => void } => {
      const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      const players = new Map([
        ["barbarian-1", buildPlayer("barbarian-1", { isAi: true, points: Number.MAX_SAFE_INTEGER, manpower: Number.MAX_SAFE_INTEGER })],
        ["player-1", buildPlayer("player-1", { points: 1_000, manpower: 200 })]
      ]);
      const tiles = [
        ...input.barbTiles.map((tile) => ({
          x: tile.x,
          y: tile.y,
          terrain: "LAND" as const,
          ownerId: "barbarian-1",
          ownershipState: "FRONTIER" as const,
          ...(tile.resource ? { resource: tile.resource } : {}),
          ...(tile.town
            ? { town: { type: "FARMING" as const, populationTier: "SETTLEMENT" as const, ownerId: "barbarian-1" } }
            : {})
        })),
        {
          x: input.targetTile.x,
          y: input.targetTile.y,
          terrain: "LAND" as const,
          ...(input.targetTile.ownerId
            ? {
                ownerId: input.targetTile.ownerId,
                ownershipState: input.targetTile.ownershipState ?? ("FRONTIER" as const)
              }
            : {}),
          ...(input.targetTile.resource ? { resource: input.targetTile.resource } : {}),
          ...(input.targetTile.town
            ? {
                town: {
                  type: "FARMING" as const,
                  populationTier: "SETTLEMENT" as const,
                  ownerId: input.targetTile.ownerId ?? "barbarian-1"
                }
              }
            : {})
        }
      ];
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        scheduleAfter: (delayMs, task) => {
          scheduledTasks.push({ delayMs, task });
        },
        initialPlayers: players,
        initialState: {
          tiles,
          players: Array.from(players.values()).map((player) => ({
            id: player.id,
            isAi: player.isAi,
            points: player.points,
            manpower: player.manpower,
            techIds: [],
            domainIds: [],
            mods: player.mods,
            techRootId: player.techRootId,
            allies: []
          })),
          activeLocks: [
            {
              commandId: "barb-lock",
              playerId: input.attackerId,
              actionType: "ATTACK",
              originX: input.lockOrigin.x,
              originY: input.lockOrigin.y,
              targetX: input.lockTarget.x,
              targetY: input.lockTarget.y,
              originKey: `${input.lockOrigin.x},${input.lockOrigin.y}`,
              targetKey: `${input.lockTarget.x},${input.lockTarget.y}`,
              resolvesAt: 1_500
            }
          ]
        }
      });

      return {
        runtime,
        randomSpy,
        runResolve: () => {
          expect(scheduledTasks).toHaveLength(1);
          scheduledTasks[0]?.task();
        }
      };
    };

    const readProgress = (runtime: SimulationRuntime): Map<string, number> =>
      (runtime as unknown as { barbarianTileProgress: Map<string, number> }).barbarianTileProgress;

    it("releases the source tile to neutral when walking into neutral land", () => {
      const { runtime, randomSpy, runResolve } = buildBarbRuntime({
        barbTiles: [
          { x: 10, y: 10 },
          { x: 10, y: 9 }
        ],
        targetTile: { x: 10, y: 11 },
        lockOrigin: { x: 10, y: 10 },
        lockTarget: { x: 10, y: 11 },
        attackerId: "barbarian-1"
      });

      runResolve();

      const state = runtime.exportState();
      const origin = state.tiles.find((tile) => tile.x === 10 && tile.y === 10);
      const target = state.tiles.find((tile) => tile.x === 10 && tile.y === 11);
      expect(target?.ownerId).toBe("barbarian-1");
      expect(origin?.ownerId).toBeUndefined();

      // Walking into neutral land gains zero progress — multiply only ticks
      // when a barb actually captures a non-barb player's tile.
      const progress = readProgress(runtime);
      expect(progress.get("10,10")).toBeUndefined();
      expect(progress.get("10,11")).toBe(0);

      randomSpy.mockRestore();
    });

    it("preserves the town on the source tile when a barbarian walks off it", () => {
      const { runtime, randomSpy, runResolve } = buildBarbRuntime({
        barbTiles: [
          { x: 10, y: 10, town: true },
          { x: 10, y: 9 }
        ],
        targetTile: { x: 10, y: 11 },
        lockOrigin: { x: 10, y: 10 },
        lockTarget: { x: 10, y: 11 },
        attackerId: "barbarian-1"
      });

      runResolve();

      const state = runtime.exportState();
      const origin = state.tiles.find((tile) => tile.x === 10 && tile.y === 10);
      expect(origin?.ownerId).toBeUndefined();
      expect(origin?.townJson).toBeDefined();
      expect(origin?.townPopulationTier).toBe("SETTLEMENT");

      randomSpy.mockRestore();
    });

    it("multiplies into neutral land when source carries threshold-level progress", () => {
      const { runtime, randomSpy, runResolve } = buildBarbRuntime({
        barbTiles: [
          { x: 10, y: 10 },
          { x: 10, y: 9 }
        ],
        targetTile: { x: 10, y: 11 },
        lockOrigin: { x: 10, y: 10 },
        lockTarget: { x: 10, y: 11 },
        attackerId: "barbarian-1"
      });
      readProgress(runtime).set("10,10", 5);

      runResolve();

      const state = runtime.exportState();
      // newProgress = 5 + 0 = 5, hits threshold → multiply fires
      expect(state.tiles.find((tile) => tile.x === 10 && tile.y === 10)?.ownerId).toBe("barbarian-1");
      expect(state.tiles.find((tile) => tile.x === 10 && tile.y === 11)?.ownerId).toBe("barbarian-1");

      randomSpy.mockRestore();
    });

    it("multiplies past the old 200-tile population cap (removed as dead code — unreachable behind MAX_BARBARIAN_TILES)", () => {
      // BARBARIAN_POPULATION_CAP used to block multiply at 200 tiles; removed
      // since MAX_BARBARIAN_TILES (100) already stops the planner from
      // expanding past 100, so 200 never actually bound in real play.
      const barbTiles: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < 200; i += 1) {
        barbTiles.push({ x: 100 + (i % 20), y: 100 + Math.floor(i / 20) });
      }
      const { runtime, randomSpy, runResolve } = buildBarbRuntime({
        barbTiles,
        targetTile: { x: 50, y: 50 },
        lockOrigin: { x: 100, y: 100 },
        lockTarget: { x: 50, y: 50 },
        attackerId: "barbarian-1"
      });
      readProgress(runtime).set("100,100", 5);

      runResolve();

      const state = runtime.exportState();
      const origin = state.tiles.find((tile) => tile.x === 100 && tile.y === 100);
      const target = state.tiles.find((tile) => tile.x === 50 && tile.y === 50);
      // Multiply: source keeps its owner, target gained — net +1, progress reset on both.
      expect(origin?.ownerId).toBe("barbarian-1");
      expect(target?.ownerId).toBe("barbarian-1");
      expect(state.tiles.filter((tile) => tile.ownerId === "barbarian-1").length).toBe(201);
      const progress = readProgress(runtime);
      expect(progress.get("100,100")).toBe(0);
      expect(progress.get("50,50")).toBe(0);

      randomSpy.mockRestore();
    });

    it("clears the progress entry when a player recaptures a barbarian tile", () => {
      const { runtime, randomSpy, runResolve } = buildBarbRuntime({
        barbTiles: [
          { x: 10, y: 11 },
          { x: 10, y: 9 }
        ],
        targetTile: { x: 10, y: 10, ownerId: "player-1" },
        lockOrigin: { x: 10, y: 10 },
        lockTarget: { x: 10, y: 11 },
        attackerId: "player-1"
      });
      readProgress(runtime).set("10,11", 5);

      runResolve();

      expect(readProgress(runtime).has("10,11")).toBe(false);

      randomSpy.mockRestore();
    });

    it("keeps barbarian counter-captures settled when a player attack fails", async () => {
      const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
      try {
        const runtime = new SimulationRuntime({
          now: () => 1_000,
          scheduleAfter: (delayMs, task) => {
            scheduledTasks.push({ delayMs, task });
          },
          initialPlayers: new Map([
            ["player-1", testRuntimePlayer("player-1")],
            [
              "barbarian-1",
              buildPlayer("barbarian-1", { isAi: true, points: Number.MAX_SAFE_INTEGER, manpower: Number.MAX_SAFE_INTEGER })
            ]
          ]),
          seedTiles: new Map(),
          initialState: {
            tiles: [
              { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
              { x: 10, y: 11, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }
            ],
            activeLocks: []
          }
        });
        const seen = collectEvents(runtime);

        runtime.submitCommand({
          commandId: "failed-attack-barb-counter",
          sessionId: "session-1",
          playerId: "player-1",
          clientSeq: 1,
          issuedAt: 1_000,
          type: "ATTACK",
          payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
        });

        await Promise.resolve();
        expect(scheduledTasks).toHaveLength(1);
        scheduledTasks[0]?.task();

        const origin = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
        expect(origin).toEqual(
          expect.objectContaining({
            ownerId: "barbarian-1",
            ownershipState: "SETTLED"
          })
        );
        expect(origin?.frontierDecayAt).toBeUndefined();
        expect(origin?.frontierDecayKind).toBeUndefined();

        const resolved = seen.find(
          (event): event is Extract<SimulationRuntimeEventShape, { eventType: "COMBAT_RESOLVED" }> =>
            event.eventType === "COMBAT_RESOLVED" && event.commandId === "failed-attack-barb-counter"
        );
        expect(resolved?.combatResult?.changes).toContainEqual(
          expect.objectContaining({
            x: 10,
            y: 10,
            ownerId: "barbarian-1",
            ownershipState: "SETTLED"
          })
        );
      } finally {
        randomSpy.mockRestore();
      }
    });
  });

  it("CRYSTAL_SYNTHESIZER no longer produces CRYSTAL regen (slot-based, not yield-based — §5.6)", () => {
    // Was: "subscription snapshot includes synthesizer crystal regen without
    // COLLECT_VISIBLE" — CRYSTAL_SYNTHESIZER's tile-production accrual was
    // retired under the manpower-economy rewrite (docs/manpower-economy-
    // rewrite-plan.md §5.6); the field/spend stays live for abilities/tech,
    // but nothing feeds it from this structure anymore.
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", testRuntimePlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "SETTLEMENT", name: "Crystal Town" }
          },
          {
            x: 6, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "CRYSTAL_SYNTHESIZER", status: "active" }
          }
        ],
        activeLocks: []
      }
    });

    // Use the subscription path (exportVisibleStateForPlayer), not exportState.
    const state = runtime.exportVisibleStateForPlayer("player-1");
    const player = state.players.find((p) => p.id === "player-1");
    expect(player).toBeDefined();
    expect(player?.strategicProductionPerMinute?.CRYSTAL ?? 0).toBe(0);
  });

  it("chosenTrickleResource round-trips through the compaction snapshot", () => {
    // Regression: chosenTrickleResource was never persisted to the compaction
    // snapshot, so Clockwork Stipend's slot grant was lost after sim restart.
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", testRuntimePlayer("player-1", { domainIds: new Set(["clockwork-stipend"]), chosenTrickleResource: "TITANIUM" as const })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "SETTLEMENT", name: "Slot Town" }
          }
        ],
        activeLocks: []
      }
    });

    // Export the snapshot sections and verify chosenTrickleResource is present.
    const sections = runtime.exportSnapshotSections();
    const exportedPlayer = sections.initialState.players?.find((p) => p.id === "player-1");
    expect(exportedPlayer?.chosenTrickleResource).toBe("TITANIUM");

    // Recover from those sections (simulates restart hydration).
    const recovered = createPlayersFromRecoveredState(sections.initialState);
    const recoveredPlayer = recovered?.get("player-1");
    expect(recoveredPlayer?.chosenTrickleResource).toBe("TITANIUM");
  });
});

describe("simulation runtime — shard rain", () => {
  const humanPlayer = (id: string) => ({
    id,
    isAi: false,
    points: 0,
    manpower: 0,
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local",
    allies: new Set<string>()
  });
  const aiPlayer = (id: string) => ({ ...humanPlayer(id), isAi: true });

  const localTime = (hour: number, minute = 0): number =>
    new Date(2026, 4, 11, hour, minute, 0, 0).getTime();

  it("broadcasts an 'upcoming' notice one hour before a scheduled rain", () => {
    const runtime = new SimulationRuntime({
      now: () => localTime(7, 0),
      initialPlayers: new Map([["human-1", humanPlayer("human-1")]]),
      seedTiles: new Map(),
      initialState: { tiles: [], activeLocks: [] }
    });
    const seen = collectEvents(runtime);

    runtime.tickShardRain(localTime(7, 0));

    const notices = seen.filter(
      (event): event is Extract<SimulationEvent, { eventType: "PLAYER_MESSAGE" }> =>
        event.eventType === "PLAYER_MESSAGE" && event.messageType === "SHARD_RAIN_EVENT"
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]?.playerId).toBe("human-1");
    const payload = JSON.parse(notices[0]!.payloadJson);
    expect(payload).toEqual(
      expect.objectContaining({ type: "SHARD_RAIN_EVENT", phase: "upcoming", startsAt: localTime(8, 0) })
    );
  });

  it("spawns FALL shard sites and broadcasts 'started' at a scheduled hour", () => {
    const tiles = [
      { x: 0, y: 0, terrain: "LAND" as const },
      { x: 1, y: 0, terrain: "LAND" as const },
      { x: 2, y: 0, terrain: "LAND" as const }
    ];
    const runtime = new SimulationRuntime({
      now: () => localTime(8, 0),
      initialPlayers: new Map([
        ["human-1", humanPlayer("human-1")],
        ["ai-1", aiPlayer("ai-1")]
      ]),
      seedTiles: new Map(),
      initialState: { tiles, activeLocks: [] }
    });
    const seen = collectEvents(runtime);

    // count = SHARD_RAIN_SITE_MIN + floor(random*4); 0 -> 3 sites.
    // Per attempt: x random, y random, amount random.
    const randomValues = [
      0, // count -> 3
      0, 0, 0.5, // attempt 1: x=0, y=0, amount=1
      0.01, 0, 0.5, // attempt 2: x≈4 (miss), y=0 -> miss (no tile)
      1 / 450, 0, 0.5, // attempt 3: x=1, y=0, amount=1
      2 / 450, 0, 0.5 // attempt 4: x=2, y=0, amount=1
    ];
    let cursor = 0;
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      const value = randomValues[cursor] ?? 0;
      cursor += 1;
      return value;
    });

    try {
      runtime.tickShardRain(localTime(8, 0));
    } finally {
      randomSpy.mockRestore();
    }

    const batches = seen.filter(
      (event): event is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> =>
        event.eventType === "TILE_DELTA_BATCH"
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]!.tileDeltas.length).toBeGreaterThanOrEqual(1);
    for (const delta of batches[0]!.tileDeltas) {
      expect(delta.shardSiteJson).toEqual(expect.stringContaining("\"kind\":\"FALL\""));
    }

    const notices = seen.filter(
      (event): event is Extract<SimulationEvent, { eventType: "PLAYER_MESSAGE" }> =>
        event.eventType === "PLAYER_MESSAGE" && event.messageType === "SHARD_RAIN_EVENT"
    );
    expect(notices.every((notice) => notice.playerId === "human-1")).toBe(true);
    expect(notices.some((notice) => notice.playerId === "ai-1")).toBe(false);
    const startedNotice = notices.find((notice) => JSON.parse(notice.payloadJson).phase === "started");
    expect(startedNotice).toBeDefined();
    const startedPayload = JSON.parse(startedNotice!.payloadJson);
    expect(startedPayload).toEqual(
      expect.objectContaining({
        type: "SHARD_RAIN_EVENT",
        phase: "started",
        startsAt: localTime(8, 0),
        expiresAt: localTime(8, 0) + 30 * 60_000
      })
    );
  });

  it("scales the site count up with the number of eligible (human, non-barbarian) players", () => {
    // 8 eligible human players -> bonus = floor(8 * SHARD_RAIN_SITES_PER_PLAYER=0.25) = 2,
    // so count = SHARD_RAIN_SITE_MIN(3) + 2 = 5 sites, above the un-scaled 3-6 range.
    const tiles = Array.from({ length: 5 }, (_, i) => ({ x: i, y: 0, terrain: "LAND" as const }));
    const players = new Map<string, ReturnType<typeof humanPlayer>>();
    for (let i = 1; i <= 8; i += 1) players.set(`human-${i}`, humanPlayer(`human-${i}`));
    // A barbarian (isAi: false, but id-prefixed) and an AI player must not count toward the bonus.
    players.set("barbarian-1", humanPlayer("barbarian-1"));
    players.set("ai-1", aiPlayer("ai-1"));

    const runtime = new SimulationRuntime({
      now: () => localTime(8, 0),
      initialPlayers: players,
      seedTiles: new Map(),
      initialState: { tiles, activeLocks: [] }
    });
    const seen = collectEvents(runtime);

    const randomValues = [
      0, // count -> min of the scaled range (5)
      0, 0, 0.5, // attempt 1: x=0, y=0, amount=1
      1 / 450, 0, 0.5, // attempt 2: x=1, y=0, amount=1
      2 / 450, 0, 0.5, // attempt 3: x=2, y=0, amount=1
      3 / 450, 0, 0.5, // attempt 4: x=3, y=0, amount=1
      4 / 450, 0, 0.5 // attempt 5: x=4, y=0, amount=1
    ];
    let cursor = 0;
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      const value = randomValues[cursor] ?? 0;
      cursor += 1;
      return value;
    });

    try {
      runtime.tickShardRain(localTime(8, 0));
    } finally {
      randomSpy.mockRestore();
    }

    const batches = seen.filter(
      (event): event is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> =>
        event.eventType === "TILE_DELTA_BATCH"
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]!.tileDeltas).toHaveLength(5);
  });

  it("does not double-spawn when ticked twice in the same slot", () => {
    const runtime = new SimulationRuntime({
      now: () => localTime(8, 0),
      initialPlayers: new Map([["human-1", humanPlayer("human-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [{ x: 0, y: 0, terrain: "LAND" as const }],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      runtime.tickShardRain(localTime(8, 0));
      runtime.tickShardRain(localTime(8, 0));
    } finally {
      randomSpy.mockRestore();
    }

    const startedNotices = seen.filter(
      (event) =>
        event.eventType === "PLAYER_MESSAGE" &&
        event.messageType === "SHARD_RAIN_EVENT" &&
        JSON.parse(event.payloadJson).phase === "started"
    );
    expect(startedNotices).toHaveLength(1);
  });

  it("emits an explicit shardSiteJson clear marker when expiring FALL sites", () => {
    const expiresAt = localTime(8, 0) + 30 * 60_000;
    const runtime = new SimulationRuntime({
      now: () => localTime(8, 0),
      initialPlayers: new Map([["human-1", humanPlayer("human-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND" as const, shardSite: { kind: "FALL", amount: 1, expiresAt } }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.tickShardRain(expiresAt + 1_000);

    const batches = seen.filter(
      (event): event is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> =>
        event.eventType === "TILE_DELTA_BATCH"
    );
    expect(batches.length).toBeGreaterThanOrEqual(1);
    const expireBatch = batches.find((batch) =>
      batch.tileDeltas.some((delta) => delta.x === 0 && delta.y === 0)
    );
    expect(expireBatch).toBeDefined();
    const expireDelta = expireBatch!.tileDeltas.find((delta) => delta.x === 0 && delta.y === 0);
    expect(expireDelta).toBeDefined();
    expect(expireDelta).toHaveProperty("shardSiteJson", "");
  });

  it("spawns shards even with only AI players, but skips human-only broadcasts", () => {
    const runtime = new SimulationRuntime({
      now: () => localTime(8, 0),
      initialPlayers: new Map([["ai-1", aiPlayer("ai-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [{ x: 0, y: 0, terrain: "LAND" as const }],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      runtime.tickShardRain(localTime(8, 0));
    } finally {
      randomSpy.mockRestore();
    }

    expect(seen.some((event) => event.eventType === "TILE_DELTA_BATCH")).toBe(true);
    expect(
      seen.some(
        (event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "SHARD_RAIN_EVENT"
      )
    ).toBe(false);
  });

  it("emitShardRainHelloFor sends a 'started' notice to a player joining mid-rain", () => {
    const expiresAt = localTime(8, 0) + 30 * 60_000;
    const runtime = new SimulationRuntime({
      now: () => localTime(8, 15),
      initialPlayers: new Map([["human-1", humanPlayer("human-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND" as const, shardSite: { kind: "FALL", amount: 1, expiresAt } },
          { x: 1, y: 0, terrain: "LAND" as const, shardSite: { kind: "FALL", amount: 2, expiresAt } }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.emitShardRainHelloFor("human-1", localTime(8, 15));

    const notices = seen.filter(
      (event): event is Extract<SimulationEvent, { eventType: "PLAYER_MESSAGE" }> =>
        event.eventType === "PLAYER_MESSAGE" && event.messageType === "SHARD_RAIN_EVENT"
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]?.playerId).toBe("human-1");
    const payload = JSON.parse(notices[0]!.payloadJson);
    expect(payload).toEqual(
      expect.objectContaining({
        type: "SHARD_RAIN_EVENT",
        phase: "started",
        startsAt: expiresAt - 30 * 60_000,
        expiresAt,
        siteCount: 2
      })
    );
  });

  it("clears the rain hello cache after FALL sites are fully collected", async () => {
    const expiresAt = localTime(8, 0) + 30 * 60_000;
    const runtime = new SimulationRuntime({
      now: () => localTime(8, 15),
      initialPlayers: new Map([
        [
          "human-1",
          {
            ...humanPlayer("human-1"),
            strategicResources: { SHARD: 0 }
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND" as const,
            ownerId: "human-1",
            ownershipState: "SETTLED" as const,
            shardSite: { kind: "FALL", amount: 1, expiresAt }
          }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "collect-rain-1",
      sessionId: "session-1",
      playerId: "human-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "COLLECT_SHARD",
      payloadJson: JSON.stringify({ x: 0, y: 0 })
    });
    await Promise.resolve();

    expect(
      seen.some(
        (event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "collect-rain-1"
      )
    ).toBe(false);

    const helloBefore = seen.length;
    runtime.emitShardRainHelloFor("human-1", localTime(8, 15));
    const helloNotices = seen
      .slice(helloBefore)
      .filter(
        (event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "SHARD_RAIN_EVENT"
      );
    expect(helloNotices).toHaveLength(0);
  });

  it("emitShardRainHelloFor only sends one hello per player per rain window", () => {
    const expiresAt = localTime(8, 0) + 30 * 60_000;
    const runtime = new SimulationRuntime({
      now: () => localTime(8, 15),
      initialPlayers: new Map([["human-1", humanPlayer("human-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [{ x: 0, y: 0, terrain: "LAND" as const, shardSite: { kind: "FALL", amount: 1, expiresAt } }],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.emitShardRainHelloFor("human-1", localTime(8, 15));
    runtime.emitShardRainHelloFor("human-1", localTime(8, 20));

    const notices = seen.filter(
      (event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "SHARD_RAIN_EVENT"
    );
    expect(notices).toHaveLength(1);
  });

  it("emitShardRainHelloFor stays silent when no FALL sites are active and rain is not imminent", () => {
    const runtime = new SimulationRuntime({
      now: () => localTime(9, 0),
      initialPlayers: new Map([["human-1", humanPlayer("human-1")]]),
      seedTiles: new Map(),
      initialState: { tiles: [], activeLocks: [] }
    });
    const seen = collectEvents(runtime);

    runtime.emitShardRainHelloFor("human-1", localTime(9, 0));

    expect(
      seen.some(
        (event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "SHARD_RAIN_EVENT"
      )
    ).toBe(false);
  });

  it("does not re-spawn shards on tiles used in previous rain events", () => {
    const tiles = [
      { x: 0, y: 0, terrain: "LAND" as const },
      { x: 1, y: 0, terrain: "LAND" as const },
      { x: 2, y: 0, terrain: "LAND" as const }
    ];
    const runtime = new SimulationRuntime({
      now: () => localTime(8, 0),
      initialPlayers: new Map([["human-1", humanPlayer("human-1")]]),
      seedTiles: new Map(),
      initialState: { tiles, activeLocks: [] }
    });
    const seen = collectEvents(runtime);

    const randomValues = [
      0, // count -> SHARD_RAIN_SITE_MIN + 0 = 3
      0, 0, 0.5, // attempt 1: tile (0,0), amount 1
      1 / 450, 0, 0.5, // attempt 2: tile (1,0), amount 1
      2 / 450, 0, 0.5 // attempt 3: tile (2,0), amount 1
    ];
    let cursor = 0;
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      const value = randomValues[cursor] ?? 0;
      cursor += 1;
      return value;
    });

    try {
      // First rain at 08:00
      runtime.tickShardRain(localTime(8, 0));

      // Advance past TTL (30 min) and trigger second rain at 21:00.
      // expireShardFallSites runs first and clears shardSite; then the
      // spawn loop finds no eligible tiles because recentShardRainTileKeys
      // still holds the 3 tiles from the first event.
      runtime.tickShardRain(localTime(21, 0));

      const startedNotices = seen.filter(
        (event) =>
          event.eventType === "PLAYER_MESSAGE" &&
          event.messageType === "SHARD_RAIN_EVENT" &&
          JSON.parse(event.payloadJson).phase === "started"
      );
      expect(startedNotices).toHaveLength(1);
    } finally {
      randomSpy.mockRestore();
    }
  });

  describe("SETTLEMENT capture evacuation", () => {
    const winningAttacker = (id: string) => ({
      id,
      isAi: false,
      points: 1_000,
      manpower: 10_000,
      techIds: new Set<string>(),
      domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      techRootId: "rewrite-local",
      allies: new Set<string>()
    });
    const weakDefender = (id: string) => ({
      id,
      isAi: true,
      points: 100,
      manpower: 1,
      techIds: new Set<string>(),
      domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      techRootId: "rewrite-local",
      allies: new Set<string>()
    });

    it("evacuates a captured SETTLEMENT onto the oldest remaining town-less tile of the previous owner", async () => {
      vi.useFakeTimers();
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      try {
        const runtime = new SimulationRuntime({
          now: () => 1_000,
          initialPlayers: new Map([
            ["player-1", winningAttacker("player-1")],
            ["player-2", weakDefender("player-2")]
          ]),
          seedTiles: new Map(),
          initialState: {
            tiles: [
              { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
              {
                x: 10,
                y: 10,
                terrain: "LAND",
                ownerId: "player-1",
                ownershipState: "FRONTIER",
                muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
              },
              {
                x: 10,
                y: 11,
                terrain: "LAND",
                ownerId: "player-2",
                ownershipState: "SETTLED",
                town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT", population: 800 }
              },
              { x: 20, y: 20, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
              {
                x: 30,
                y: 30,
                terrain: "LAND",
                ownerId: "player-2",
                ownershipState: "SETTLED",
                town: { name: "Second Town", type: "FARMING", populationTier: "TOWN", population: 2_000 }
              }
            ],
            activeLocks: []
          }
        });

        runtime.submitCommand({
          commandId: "settlement-capture-1",
          sessionId: "session-1",
          playerId: "player-1",
          clientSeq: 1,
          issuedAt: 1_000,
          type: "ATTACK",
          payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
        });

        await Promise.resolve();
        vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

        const captured = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11);
        expect(captured?.ownerId).toBe("player-1");
        expect(captured?.ownershipState).toBe("FRONTIER");
        // SETTLEMENT town has been stripped off the captured tile.
        expect(captured).not.toHaveProperty("townJson");
        expect(captured?.townPopulationTier).toBeUndefined();

        // Town re-rooted on the previous owner's remaining settled tile, at the shocked population.
        const refuge = runtime.exportState().tiles.find((tile) => tile.x === 20 && tile.y === 20);
        expect(refuge?.ownerId).toBe("player-2");
        expect(refuge?.townPopulationTier).toBe("SETTLEMENT");
        const refugeTown = refuge?.townJson ? JSON.parse(refuge.townJson) as { population?: number } : undefined;
        const refugePop = refugeTown?.population ?? 0;
        expect(refugePop).toBeGreaterThan(0);
        expect(refugePop).toBeLessThan(800);
        const existingTown = runtime.exportState().tiles.find((tile) => tile.x === 30 && tile.y === 30);
        expect(existingTown?.townPopulationTier).toBe("TOWN");
      } finally {
        randomSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it("respawns on unowned land when the previous owner's only remaining town is not a SETTLEMENT", async () => {
      vi.useFakeTimers();
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      try {
        const runtime = new SimulationRuntime({
          now: () => 1_000,
          initialPlayers: new Map([
            ["player-1", winningAttacker("player-1")],
            ["player-2", { ...weakDefender("player-2"), points: 0 }]
          ]),
          seedTiles: new Map(),
          initialState: {
            tiles: [
              { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
              {
                x: 10,
                y: 10,
                terrain: "LAND",
                ownerId: "player-1",
                ownershipState: "FRONTIER",
                muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
              },
              {
                x: 10,
                y: 11,
                terrain: "LAND",
                ownerId: "player-2",
                ownershipState: "SETTLED",
                town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT", population: 800 }
              },
              // Remaining tile already has a CITY — must NOT be overwritten/downgraded.
              {
                x: 20,
                y: 20,
                terrain: "LAND",
                ownerId: "player-2",
                ownershipState: "SETTLED",
                town: { name: "Capital", type: "FARMING", populationTier: "CITY", population: 5_000 }
              },
              { x: 21, y: 20, terrain: "LAND" }
            ],
            activeLocks: []
          }
        });

        runtime.submitCommand({
          commandId: "settlement-capture-2",
          sessionId: "session-1",
          playerId: "player-1",
          clientSeq: 1,
          issuedAt: 1_000,
          type: "ATTACK",
          payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
        });

        await Promise.resolve();
        vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

        // Captured tile still loses its SETTLEMENT town (evacuation attempted).
        const captured = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11);
        expect(captured?.ownerId).toBe("player-1");
        expect(captured).not.toHaveProperty("townJson");
        expect(captured?.townPopulationTier).toBeUndefined();

        // The pre-existing CITY is preserved — no silent downgrade to SETTLEMENT.
        const city = runtime.exportState().tiles.find((tile) => tile.x === 20 && tile.y === 20);
        expect(city?.townPopulationTier).toBe("CITY");
        const cityTown = city?.townJson ? JSON.parse(city.townJson) as { population?: number } : undefined;
        expect(cityTown?.population).toBe(5_000);

        const respawnedSettlement = runtime.exportState().tiles.find((tile) => tile.x === 21 && tile.y === 20);
        expect(respawnedSettlement).toEqual(
          expect.objectContaining({
            ownerId: "player-2",
            ownershipState: "SETTLED",
            townPopulationTier: "SETTLEMENT"
          })
        );
        expect(runtime.exportState().players.find((player) => player.id === "player-2")?.incomePerMinute).toBeGreaterThan(0);
        expect(runtime.exportState().players.find((player) => player.id === "player-2")?.points).toBe(10); // §24.2: floored from 0 to RESPAWN_MINIMUM_GOLD
      } finally {
        randomSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it("re-roots onto owned frontier land when capture would otherwise leave the previous owner with no town income", async () => {
      vi.useFakeTimers();
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      try {
        const runtime = new SimulationRuntime({
          now: () => 1_000,
          initialPlayers: new Map([
            ["player-1", winningAttacker("player-1")],
            ["player-2", weakDefender("player-2")]
          ]),
          seedTiles: new Map(),
          initialState: {
            tiles: [
              { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
              {
                x: 10,
                y: 10,
                terrain: "LAND",
                ownerId: "player-1",
                ownershipState: "FRONTIER",
                muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
              },
              {
                x: 10,
                y: 11,
                terrain: "LAND",
                ownerId: "player-2",
                ownershipState: "SETTLED",
                town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT", population: 800 }
              },
              { x: 20, y: 20, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
            ],
            activeLocks: []
          }
        });
        runtime.submitCommand({
          commandId: "settlement-capture-frontier-refuge",
          sessionId: "session-1",
          playerId: "player-1",
          clientSeq: 1,
          issuedAt: 1_000,
          type: "ATTACK",
          payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
        });

        await Promise.resolve();
        vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

        const captured = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11);
        expect(captured?.ownerId).toBe("player-1");
        expect(captured).not.toHaveProperty("townJson");

        const refuge = runtime.exportState().tiles.find((tile) => tile.x === 20 && tile.y === 20);
        expect(refuge).toEqual(
          expect.objectContaining({
            ownerId: "player-2",
            ownershipState: "SETTLED",
            townPopulationTier: "SETTLEMENT"
          })
        );

        // player-2 is AI (#732 suppresses its PLAYER_UPDATE), so read the re-rooted
        // income from exportState rather than the now-suppressed message.
        const defenderIncome = runtime
          .exportState()
          .players.find((player) => player.id === "player-2")?.incomePerMinute;
        expect(defenderIncome).toBeGreaterThan(0);
      } finally {
        randomSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });
});

describe("simulation runtime — tile shedding", () => {
  it("does not shed when the player has positive treasury", async () => {
    let now = 1_000;
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([
        ["ai-1", buildPlayer("ai-1", { isAi: true, points: 10_000, manpower: 100 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" },
          { x: 1, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    now = 60_000;
    await runtime.tickTileShedding(60_000);

    const state = runtime.exportState();
    expect(state.tiles.filter((tile) => tile.ownerId === "ai-1").length).toBe(2);
  });

  it("never sheds barbarian tiles", async () => {
    let now = 1_000;
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([
        ["barbarian-1", buildPlayer("barbarian-1", { points: 0, manpower: 100 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    now = 60_000;
    await runtime.tickTileShedding(60_000);

    const state = runtime.exportState();
    expect(state.tiles.find((tile) => tile.x === 0 && tile.y === 0)?.ownerId).toBe("barbarian-1");
  });

  it("releases ownership of a town tile without destroying the town", async () => {
    let now = 1_000;
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([
        ["ai-1", buildPlayer("ai-1", { isAi: true, points: 0, manpower: 100 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "ai-1",
            ownershipState: "SETTLED",
            town: { name: "Home", type: "FARMING", populationTier: "TOWN", population: 400 }
          }
        ],
        activeLocks: []
      }
    });

    now = 60_000;
    await runtime.tickTileShedding(60_000);

    const shed = runtime.exportState().tiles.find((tile) => tile.x === 0 && tile.y === 0);
    expect(shed?.ownerId).toBeUndefined();
    expect(shed?.townPopulationTier).toBe("TOWN");
  });

  it("releases a muster flag staged on the shed tile and refunds its manpower to the pool", async () => {
    // Regression: shedding cleared fort/observatory/siegeOutpost/economicStructure
    // on the released tile but forgot `muster`, so a staged flag survived
    // shedding the tile out from under it — mirrors handleUncaptureTileCommand,
    // which does refund+clear for the same self-abandon scenario.
    let now = 1_000;
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([
        ["ai-1", buildPlayer("ai-1", { isAi: true, points: 0, manpower: 50 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "ai-1",
            ownershipState: "SETTLED",
            muster: { ownerId: "ai-1", amount: 30, mode: "HOLD", updatedAt: 500 }
          }
        ],
        activeLocks: []
      }
    });

    now = 60_000;
    await runtime.tickTileShedding(60_000);

    const state = runtime.exportState();
    const shed = state.tiles.find((tile) => tile.x === 0 && tile.y === 0);
    expect(shed?.ownerId).toBeUndefined();
    expect(shed?.musterJson).toBeFalsy();
    const player = state.players.find((p) => p.id === "ai-1");
    // ~80 (50 base + 30 refunded), plus a touch of regen accrued over the tick —
    // well above the 50 it would be if the refund never happened.
    expect(player?.manpower).toBeGreaterThan(79);
    expect(player?.manpower).toBeLessThan(85);
  });

  it("never sheds a SETTLEMENT-tier town, even when it is the player's only eligible tile", async () => {
    let now = 1_000;
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([
        ["ai-1", buildPlayer("ai-1", { isAi: true, points: 0, manpower: 100 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "ai-1",
            ownershipState: "SETTLED",
            town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT", population: 800 }
          }
        ],
        activeLocks: []
      }
    });

    now = 60_000;
    await runtime.tickTileShedding(60_000);

    const tile = runtime.exportState().tiles.find((tile) => tile.x === 0 && tile.y === 0);
    expect(tile?.ownerId).toBe("ai-1");
    expect(tile?.townPopulationTier).toBe("SETTLEMENT");
  });
});

describe("aether purge", () => {
  const buildAetherLanceRuntime = (options: { enemyAegisDome?: boolean; crystal?: number; points?: number } = {}): SimulationRuntime => {
    const tiles: Array<Record<string, unknown>> = [
      {
        x: 0,
        y: 0,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "SETTLED",
        observatory: { ownerId: "player-1", status: "active" }
      },
      {
        x: 5,
        y: 0,
        terrain: "LAND",
        ownerId: "player-2",
        ownershipState: "SETTLED",
        economicStructure: { ownerId: "player-2", type: "GRANARY", status: "active" }
      },
      {
        x: 5,
        y: 1,
        terrain: "LAND",
        ownerId: "player-2",
        ownershipState: "FRONTIER",
        fort: { ownerId: "player-2", status: "active" },
        muster: { ownerId: "player-2", amount: 20, mode: "HOLD", updatedAt: 500 }
      },
      // §5.4: CRYSTAL supply so player-1's Observatory isn't dormant.
      { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
    ];
    if (options.enemyAegisDome) {
      tiles.push(
        {
          x: 6,
          y: 0,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          economicStructure: { ownerId: "player-2", type: "AEGIS_DOME", status: "active" }
        },
        {
          x: 7,
          y: 0,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          economicStructure: { ownerId: "player-2", type: "AETHER_TOWER", status: "active" }
        },
        // §5.4: CRYSTAL supply so AEGIS_DOME (4 slots, post-part-consumption
        // rebalance)/AETHER_TOWER aren't dormant.
        { x: 8, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" },
        { x: 9, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" },
        { x: 11, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" },
        { x: 12, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" },
        { x: 13, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" },
        // §5.4: FOOD supply so AETHER_TOWER (1 FOOD slot) isn't dormant.
        { x: 10, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "FARM" }
      );
    }
    return new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: options.points ?? 5_000, manpower: 10_000, techIds: new Set<string>(["crystal-lattices"]), strategicResources: { CRYSTAL: options.crystal ?? 500 } })],
        ["player-2", buildPlayer("player-2", { isAi: true, manpower: 100 })]
      ]) as never,
      initialState: { tiles: tiles as never, activeLocks: [] }
    });
  };

  it("purges hostile settled control without destroying structures and stamps the casting observatory cooldown", async () => {
    const runtime = buildAetherLanceRuntime();
    runtime.submitCommand({
      commandId: "aether-lance-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AETHER_LANCE",
      payloadJson: JSON.stringify({ x: 5, y: 0 })
    });
    await Promise.resolve();
    const state = runtime.exportState();
    const target = state.tiles.find((tile) => tile.x === 5 && tile.y === 0);
    const observatoryTile = state.tiles.find((tile) => tile.x === 0 && tile.y === 0);
    const observatory = observatoryTile?.observatoryJson
      ? JSON.parse(observatoryTile.observatoryJson) as { cooldownUntil?: number }
      : undefined;
    const actor = state.players.find((player) => player.id === "player-1");
    expect(target?.ownerId).toBeUndefined();
    expect(target?.ownershipState).toBeUndefined();
    expect(target?.economicStructureJson).toContain("\"GRANARY\"");
    expect(observatory?.cooldownUntil).toBe(601_000);
    expect(actor?.points).toBe(5_000); // §17: no longer costs gold
    expect(actor?.strategicResources?.CRYSTAL).toBe(500); // §17: no longer costs CRYSTAL
  });

  it("purges hostile frontier control", async () => {
    const runtime = buildAetherLanceRuntime();
    runtime.submitCommand({
      commandId: "aether-purge-frontier",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AETHER_LANCE",
      payloadJson: JSON.stringify({ x: 5, y: 1 })
    });
    await Promise.resolve();
    const state = runtime.exportState();
    const target = state.tiles.find((tile) => tile.x === 5 && tile.y === 1);
    expect(target?.ownerId).toBeUndefined();
    expect(target?.ownershipState).toBeUndefined();
    expect(target?.fortJson).toContain("\"ownerId\":\"player-2\"");
  });

  it("destroys a muster flag staged on the purged tile instead of leaving it behind", async () => {
    // Regression: purging ownership used to spread the target tile forward
    // (`...target`) without touching `muster`, so a flag staged on the tile
    // survived the purge — still owned by player-2, still accumulating —
    // even though the tile itself was now neutral.
    const runtime = buildAetherLanceRuntime();
    runtime.submitCommand({
      commandId: "aether-purge-muster",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AETHER_LANCE",
      payloadJson: JSON.stringify({ x: 5, y: 1 })
    });
    await Promise.resolve();
    const state = runtime.exportState();
    const target = state.tiles.find((tile) => tile.x === 5 && tile.y === 1);
    expect(target?.ownerId).toBeUndefined();
    expect(target?.musterJson).toBeFalsy();
    // The staged manpower is destroyed along with the flag, not refunded.
    const defender = state.players.find((player) => player.id === "player-2");
    expect(defender?.manpower).toBe(100);
  });

  it("rejects through an enemy Aegis Dome without spending resources", async () => {
    const runtime = buildAetherLanceRuntime({ enemyAegisDome: true });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "aether-lance-aegis",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "AETHER_LANCE",
      payloadJson: JSON.stringify({ x: 5, y: 0 })
    });
    await Promise.resolve();
    const state = runtime.exportState();
    const target = state.tiles.find((tile) => tile.x === 5 && tile.y === 0);
    const actor = state.players.find((player) => player.id === "player-1");
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "aether-lance-aegis",
      code: "AETHER_LANCE_INVALID",
      message: "blocked by an Aegis Dome"
    }));
    expect(target?.economicStructureJson).toContain("\"GRANARY\"");
    expect(actor?.points).toBe(5_000);
    expect(actor?.strategicResources?.CRYSTAL).toBe(500);
  });
});

describe("worldbreaker shot", () => {
  const buildStrikeRuntime = (options: {
    techIds?: string[];
    crystal?: number;
    points?: number;
    omitTower?: boolean;
    targetTown?: { population: number; populationTier?: string };
    targetStructure?: { ownerId: string; type: string; status: string };
    enemyAegisDome?: boolean;
  } = {}): SimulationRuntime => {
    const tiles: Array<Record<string, unknown>> = [
      {
        x: 0,
        y: 0,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "SETTLED",
        economicStructure: { ownerId: "player-1", type: "WORLD_ENGINE", status: "active" }
      },
      // §5.4: CRYSTAL supply so WORLD_ENGINE (4 slots, post-part-consumption
      // rebalance)/AETHER_TOWER aren't dormant.
      { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      { x: 6, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      { x: 7, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      { x: 8, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
      // §5.4: FOOD supply so AETHER_TOWER (1 FOOD slot) isn't dormant.
      { x: 5, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" }
    ];
    if (!options.omitTower) {
      tiles.push({
        x: 1,
        y: 0,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "SETTLED",
        economicStructure: { ownerId: "player-1", type: "AETHER_TOWER", status: "active" }
      });
    }
    const target: Record<string, unknown> = {
      x: 50,
      y: 50,
      terrain: "LAND",
      ownerId: "player-2",
      ownershipState: "SETTLED"
    };
    if (options.targetTown) {
      target.town = { type: "MARKET", populationTier: options.targetTown.populationTier ?? "CITY", population: options.targetTown.population };
    }
    if (options.targetStructure) {
      target.economicStructure = options.targetStructure;
    }
    tiles.push(target);
    if (options.enemyAegisDome) {
      // Place a powered Aegis Dome owned by player-2, two tiles from the target.
      tiles.push({
        x: 51,
        y: 50,
        terrain: "LAND",
        ownerId: "player-2",
        ownershipState: "SETTLED",
        economicStructure: { ownerId: "player-2", type: "AEGIS_DOME", status: "active" }
      });
      tiles.push({
        x: 52,
        y: 50,
        terrain: "LAND",
        ownerId: "player-2",
        ownershipState: "SETTLED",
        economicStructure: { ownerId: "player-2", type: "AETHER_TOWER", status: "active" }
      });
      // CRYSTAL supply so AEGIS_DOME (4 slots, post-part-consumption
      // rebalance)/AETHER_TOWER aren't dormant.
      tiles.push({ x: 53, y: 50, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" });
      tiles.push({ x: 54, y: 50, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" });
      tiles.push({ x: 56, y: 50, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" });
      tiles.push({ x: 57, y: 50, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" });
      tiles.push({ x: 58, y: 50, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "GEMS" });
      // §5.4: FOOD supply so AETHER_TOWER (1 FOOD slot) isn't dormant.
      tiles.push({ x: 55, y: 50, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "FARM" });
    }
    return new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: options.points ?? 20_000, manpower: 10_000, techIds: new Set<string>(options.techIds ?? ["worldbreaker-fire"]), strategicResources: { CRYSTAL: options.crystal ?? 1_000 } })],
        ["player-2", buildPlayer("player-2", { isAi: true, manpower: 100 })]
      ]) as never,
      initialState: { tiles: tiles as never, activeLocks: [] }
    });
  };

  it("succeeds without any tech at all (strike is inherent to the built monument, Worldbreaker Ignition was cut)", async () => {
    const runtime = buildStrikeRuntime({ techIds: [] });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "strike-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "WORLD_ENGINE_STRIKE",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 50, toY: 50 })
    });
    await Promise.resolve();
    expect(events).not.toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "strike-1",
      code: "WORLD_ENGINE_STRIKE_INVALID"
    }));
  });

  it("rejects without a powering Aether Tower", async () => {
    const runtime = buildStrikeRuntime({ omitTower: true });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "strike-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "WORLD_ENGINE_STRIKE",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 50, toY: 50 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      code: "WORLD_ENGINE_STRIKE_INVALID",
      message: "World Engine requires a nearby Aether Tower"
    }));
  });

  it("rejects without enough gold", async () => {
    const runtime = buildStrikeRuntime({ points: 500 });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "strike-gold",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "WORLD_ENGINE_STRIKE",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 50, toY: 50 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      code: "WORLD_ENGINE_STRIKE_INVALID",
      message: "insufficient gold"
    }));
  });

  it("destroys an enemy economic structure on the target tile", async () => {
    const runtime = buildStrikeRuntime({
      targetStructure: { ownerId: "player-2", type: "GRANARY", status: "active" }
    });
    runtime.submitCommand({
      commandId: "strike-3",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "WORLD_ENGINE_STRIKE",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 50, toY: 50 })
    });
    await Promise.resolve();
    const state = runtime.exportState();
    const target = state.tiles.find((tile) => tile.x === 50 && tile.y === 50);
    expect(target?.economicStructureJson).toBeUndefined();
  });

  it("reduces town population by 30% with no cap", async () => {
    const runtime = buildStrikeRuntime({ targetTown: { population: 1_000_000, populationTier: "GREAT_CITY" } });
    runtime.submitCommand({
      commandId: "strike-4",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "WORLD_ENGINE_STRIKE",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 50, toY: 50 })
    });
    await Promise.resolve();
    const state = runtime.exportState();
    const target = state.tiles.find((tile) => tile.x === 50 && tile.y === 50);
    const town = target?.townJson ? JSON.parse(target.townJson) as { population?: number; populationTier?: string } : undefined;
    expect(town?.population).toBe(700_000);
    expect(town?.populationTier).toBe("CITY");
  });

  it("broadcasts a WORLD_ENGINE_STRIKE_ANNOUNCEMENT to every player when it lands on an enemy town", async () => {
    const runtime = buildStrikeRuntime({ targetTown: { population: 1_000_000, populationTier: "GREAT_CITY" } });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "strike-broadcast",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "WORLD_ENGINE_STRIKE",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 50, toY: 50 })
    });
    await Promise.resolve();
    const broadcast = events.find(
      (event) =>
        event.eventType === "PLAYER_MESSAGE" &&
        event.playerId === "__broadcast__" &&
        event.messageType === "WORLD_ENGINE_STRIKE_ANNOUNCEMENT"
    );
    expect(broadcast).toBeDefined();
    const payload = JSON.parse(broadcast!.payloadJson as string) as Record<string, unknown>;
    expect(payload).toMatchObject({
      type: "WORLD_ENGINE_STRIKE_ANNOUNCEMENT",
      strikeId: "strike-broadcast:bc",
      occurredAt: 1_000,
      casterName: "player-1",
      targetX: 50,
      targetY: 50,
      townName: "",
      populationTier: "CITY",
      populationLost: 300_000,
      targetOwnerName: "player-2"
    });
  });

  it("does not broadcast a WORLD_ENGINE_STRIKE_ANNOUNCEMENT when the strike hits a tile with no town", async () => {
    const runtime = buildStrikeRuntime({});
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "strike-no-town",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "WORLD_ENGINE_STRIKE",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 50, toY: 50 })
    });
    await Promise.resolve();
    expect(events.some((event) => event.messageType === "WORLD_ENGINE_STRIKE_ANNOUNCEMENT")).toBe(false);
  });

  it("demotes tier on strike but floors at TOWN", async () => {
    const runtime = buildStrikeRuntime({ targetTown: { population: 12_000, populationTier: "TOWN" } });
    runtime.submitCommand({
      commandId: "strike-5",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "WORLD_ENGINE_STRIKE",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 50, toY: 50 })
    });
    await Promise.resolve();
    const state = runtime.exportState();
    const target = state.tiles.find((tile) => tile.x === 50 && tile.y === 50);
    const town = target?.townJson ? JSON.parse(target.townJson) as { population?: number; populationTier?: string } : undefined;
    expect(town?.population).toBe(8_400);
    expect(town?.populationTier).toBe("TOWN");
  });

  it("rejects when target is shielded by an enemy Aegis Dome", async () => {
    const runtime = buildStrikeRuntime({ enemyAegisDome: true, targetTown: { population: 1_000 } });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "strike-aegis",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "WORLD_ENGINE_STRIKE",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 50, toY: 50 })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "strike-aegis",
      code: "WORLD_ENGINE_STRIKE_INVALID",
      message: "blocked by an Aegis Dome"
    }));
    // Population must be untouched and the actor's CRYSTAL must NOT be spent.
    const state = runtime.exportState();
    const target = state.tiles.find((tile) => tile.x === 50 && tile.y === 50);
    const town = target?.townJson ? JSON.parse(target.townJson) as { population?: number } : undefined;
    expect(town?.population).toBe(1_000);
    expect(state.players.find((p) => p.id === "player-1")?.strategicResources?.CRYSTAL).toBe(1_000);
  });
});

describe("simulation runtime — exportTilesInAreaForPlayer", () => {
  it("ships freshly recomputed goldPerMinute and gold cap on owned-town tile-detail fetches", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 100,
            manpower: 150,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            // Enough food to keep the TOWN-tier town fed for the refresh path.
            strategicResources: { FOOD: 100, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 }
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          // Full snapshot-shape town JSON with a deliberately wrong persisted
          // goldPerMinute / cap, so the test fails if exportTilesInAreaForPlayer
          // just echoes the persisted values instead of recomputing them.
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: {
              name: "Refreshville",
              type: "FARMING",
              populationTier: "TOWN",
              baseGoldPerMinute: 2,
              supportCurrent: 8,
              supportMax: 8,
              goldPerMinute: 0.5,
              cap: 10,
              isFed: true,
              population: 5000,
              maxPopulation: 25000,
              connectedTownCount: 0,
              connectedTownBonus: 0,
              hasMintworks: false,
              mintworksActive: false,
              hasGranary: false,
              granaryActive: false,
            }
          },
          // Eight surrounding settled-land tiles so support stays at 8/8.
          ...[
            [4, 4], [5, 4], [6, 4],
            [4, 5], [6, 5],
            [4, 6], [5, 6], [6, 6]
          ].map(([x, y]) => ({
            x,
            y,
            terrain: "LAND" as const,
            ownerId: "player-1",
            ownershipState: "SETTLED" as const
          }))
        ],
        activeLocks: []
      }
    });

    const [centerDelta] = runtime.exportTilesInAreaForPlayer("player-1", 5, 5, 0, { fullVisibility: true });
    expect(centerDelta).toBeDefined();
    // yieldRate/yieldCap removed from tile export (bootstrap-payload-shrink PR A).
    // The gateway-side tile-detail-snapshot still computes them from buildTileYieldView.
    // Persisted goldPerMinute was 0.5; live recompute must override it (now far below 0.5
    // post-gold-rescope, §6.1) — just assert it's the recomputed one, not a magnitude.
    const refreshedTown = centerDelta?.townJson ? JSON.parse(centerDelta.townJson) : undefined;
    expect(refreshedTown?.goldPerMinute).not.toBe(0.5);
  });

  it("emits an explicit zero yield buffer for yield-bearing tiles so fresh responses can clear stale cached buffers", () => {
    // Repro for the post-PR-353 bug: a town's cached client snapshot kept
    // `yield: { gold: 2105 }` from when the town had a mintworks (cap ~2112), but
    // after mintworks loss + an upkeep tick that emptied the live buffer to 0,
    // FetchTileDetail omitted the `yield` field entirely (because gold was
    // ≤ 0.0001), and the gateway's shallow snapshot merge preserved the stale
    // 2105. Verify the delta now carries `yield: { gold: 0 }` so the client
    // can authoritatively clear stale buffers even when the live value is zero.
    const nowMs = 1_000_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { strategicResources: { FOOD: 100, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 } })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: {
              name: "Drainville",
              type: "FARMING",
              populationTier: "TOWN",
              baseGoldPerMinute: 2,
              supportCurrent: 8,
              supportMax: 8,
              goldPerMinute: 2,
              cap: 960,
              isFed: true,
              population: 5000,
              maxPopulation: 25000,
              connectedTownCount: 0,
              connectedTownBonus: 0,
              hasMintworks: false,
              mintworksActive: false,
              hasGranary: false,
              granaryActive: false,
            }
          },
          ...[
            [4, 4], [5, 4], [6, 4],
            [4, 5], [6, 5],
            [4, 6], [5, 6], [6, 6]
          ].map(([x, y]) => ({
            x,
            y,
            terrain: "LAND" as const,
            ownerId: "player-1",
            ownershipState: "SETTLED" as const
          })),
          // §5.4: the town needs 4 FOOD slots to not go dormant (which would
          // otherwise zero its gold income and make it non-yield-bearing).
          { x: 7, y: 5, terrain: "LAND" as const, resource: "FISH" as const, ownerId: "player-1", ownershipState: "SETTLED" as const },
          { x: 8, y: 5, terrain: "LAND" as const, resource: "FISH" as const, ownerId: "player-1", ownershipState: "SETTLED" as const }
        ],
        // lastCollectedAt = now means zero elapsed time → live buffer = 0.
        tileYieldCollectedAtByTile: [{ tileKey: "5,5", collectedAt: nowMs }],
        activeLocks: []
      }
    });

    const [centerDelta] = runtime.exportTilesInAreaForPlayer("player-1", 5, 5, 0, { fullVisibility: true });
    expect(centerDelta).toBeDefined();
    // Tile is yield-bearing (gpm > 0), so yield must be present even though
    // the buffer is 0 right now. If this assertion fails, the gateway's merge
    // will preserve whatever stale value the client cached previously.
    expect(centerDelta?.yield).toBeDefined();
    expect(centerDelta?.yield?.gold ?? -1).toBe(0);
  });

  it("applies connectedTownBonus to goldPerMinute and cap on owned-town tile detail (sim authority)", () => {
    // Mirror the user's prod scenario: TOWN-tier town at (5,5) with three
    // owned towns at 8-adjacent positions so buildConnectedTownNetworkForPlayer
    // returns connectedTownCount=3 / bonus=1.2. Town is fed, support 8/8, no
    // mintworks, no bank. Expected gpm = TOWN_BASE(2) * 1 * 1 * 2.2 * 1 * 1 * 1
    // = 4.4; cap = 4.4*60*8 = 2112. If this test fails, the sim has its own
    // bug; if it passes, the prod display of 2.00/m + cap 960 means the
    // gateway's buildSnapshotTileDetail is clobbering the sim's authoritative
    // value.
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { strategicResources: { FOOD: 1000, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 } })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: {
              name: "Gloamspire",
              type: "FARMING",
              populationTier: "TOWN",
              baseGoldPerMinute: 2,
              supportCurrent: 8,
              supportMax: 8,
              goldPerMinute: 2,
              cap: 960,
              isFed: true,
              population: 17669,
              maxPopulation: 10000000,
              connectedTownCount: 0,
              connectedTownBonus: 0,
              hasMintworks: false,
              mintworksActive: false,
              hasGranary: false,
              granaryActive: false,
            }
          },
          // Three more owned towns 8-adjacent to (5,5) so the BFS finds them.
          // Only `ownerId === "player-1"` + `ownershipState === "SETTLED"` + a
          // present `town` object matter for the connected-town count — the
          // population / support / isFed fields are placeholders so these
          // neighbors don't trigger unrelated guard paths (e.g. an unfed-town
          // food-coverage cascade); they aren't read by the assertion below.
          {
            x: 6, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
            town: { name: "Velorreach", type: "FARMING", populationTier: "TOWN", supportCurrent: 4, supportMax: 8, population: 10000, maxPopulation: 10000000, isFed: true }
          },
          {
            x: 5, y: 6, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
            town: { name: "Sablemanor", type: "FARMING", populationTier: "TOWN", supportCurrent: 4, supportMax: 8, population: 10000, maxPopulation: 10000000, isFed: true }
          },
          {
            x: 6, y: 6, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
            town: { name: "Velramanor", type: "FARMING", populationTier: "TOWN", supportCurrent: 4, supportMax: 8, population: 10000, maxPopulation: 10000000, isFed: true }
          },
          // Four plain settled-land tiles to fill (5,5)'s remaining 8-neighbors.
          ...[
            [4, 4], [5, 4], [6, 4],
            [4, 6]
          ].map(([x, y]) => ({
            x,
            y,
            terrain: "LAND" as const,
            ownerId: "player-1",
            ownershipState: "SETTLED" as const
          })),
          // Fifth neighbor carries a Caravanary support structure — the
          // connected-town road network (and its gold bonus) only exists
          // where at least one town has one built.
          {
            x: 4, y: 5, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const,
            economicStructure: { ownerId: "player-1", type: "CARAVANARY" as const, status: "active" as const }
          },
          // §5.4: 4 towns need 4 FOOD slots each (16 total), plus 1 more for
          // the Caravanary's own FOOD slot demand (17 total), to not go
          // dormant (which would otherwise zero their gold income / disable
          // the Caravanary's road-network gate) — 9 FISH tiles (2 slots
          // each = 18) cover it, placed well outside the BFS neighborhood.
          ...[[100, 100], [101, 100], [102, 100], [103, 100], [104, 100], [105, 100], [106, 100], [107, 100], [108, 100]].map(([x, y]) => ({
            x, y, terrain: "LAND" as const, resource: "FISH" as const, ownerId: "player-1", ownershipState: "SETTLED" as const
          }))
        ],
        activeLocks: []
      }
    });

    const [centerDelta] = runtime.exportTilesInAreaForPlayer("player-1", 5, 5, 0, { fullVisibility: true });
    expect(centerDelta).toBeDefined();
    const town = centerDelta?.townJson ? JSON.parse(centerDelta.townJson) as Record<string, unknown> : undefined;
    expect(town).toBeDefined();
    // First, prove the BFS sees all three neighbors (the actual user-visible
    // modifier line shows "3 connected towns: +120%").
    expect(town?.connectedTownCount).toBe(3);
    expect(town?.connectedTownBonus).toBeCloseTo(1.2, 5);
    // Now the load-bearing assertion: gpm must reflect that bonus.
    // yieldRate/yieldCap removed from tile export (bootstrap-payload-shrink PR A).
    // TOWN_BASE_GOLD_PER_MIN * 1.0 (support) * 1.0 (TOWN tier popMult) * 2.2 (connected bonus)
    // = 4.4 pre-gold-rescope; TOWN_BASE_GOLD_PER_MIN is now cut 288x (§6.1), so 4.4 / 288.
    expect(town?.goldPerMinute).toBeCloseTo(4.4 / 288, 5);
  });

  it("keeps ownerId/ownershipState in a tile delta even when an unrelated later event re-touches the same tile (#774/#777/#779 regression)", async () => {
    // Reproduces the real-world bug end-to-end through the actual runtime
    // wiring, not just the cache class in isolation: a tile gets its FIRST
    // real broadcast (which seeds TileDeltaStringifyCache's global
    // "last emitted" baseline for it: fort under_construction), then a
    // SECOND, later event re-touches the SAME tile (fort construction
    // completing) without ownerId/ownershipState changing at all between
    // the two. Any consumer who only ever sees the SECOND event (a fresh
    // subscriber, a reconnect, the gateway's own snapshot cache) must still
    // be able to tell who owns this tile from that delta alone -- it must
    // not rely on "ownerId didn't change since some other emission" to skip it.
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 60_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["masonry"]), strategicResources: { TITANIUM: 500 } })
          ]
        ]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Regression Town", type: "MARKET", populationTier: "TOWN" }
            },
            { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" }
          ],
          activeLocks: []
        }
      });

      type SeenTileDelta = { x: number; y: number; ownerId?: string; ownershipState?: string; fortJson?: string };
      const tileDeltaBatches: SeenTileDelta[][] = [];
      runtime.onEvent((event) => {
        if (event.eventType === "TILE_DELTA_BATCH") {
          tileDeltaBatches.push(event.tileDeltas.map((delta) => ({ ...delta })) as SeenTileDelta[]);
        }
      });

      // First real broadcast for (10,10): fort construction starting. This
      // is what seeds the cache's "last emitted" baseline for this tile.
      runtime.submitCommand({
        commandId: "fort-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 60_000,
        type: "BUILD_FORT",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      const firstBatch = tileDeltaBatches.find((batch) => batch.some((delta) => delta.x === 10 && delta.y === 10));
      expect(firstBatch).toBeDefined();
      const firstDelta = firstBatch!.find((delta) => delta.x === 10 && delta.y === 10)!;
      expect(firstDelta.ownerId).toBe("player-1");
      expect(firstDelta.ownershipState).toBe("SETTLED");
      expect(firstDelta.fortJson).toContain("under_construction");

      // Second, later event on the SAME tile: fort construction completes,
      // changing `fort` from under_construction to active -- not ownerId or
      // ownershipState. Under the pre-fix sparse diff, this delta would have
      // omitted ownerId/ownershipState entirely because they "hadn't
      // changed" since the fort-start emission above.
      tileDeltaBatches.length = 0;
      vi.advanceTimersByTime(structureBuildDurationMs("FORT"));

      const secondBatch = tileDeltaBatches.find((batch) => batch.some((delta) => delta.x === 10 && delta.y === 10));
      expect(secondBatch).toBeDefined();
      const secondDelta = secondBatch!.find((delta) => delta.x === 10 && delta.y === 10)!;
      expect(secondDelta.fortJson).toContain("\"status\":\"active\"");
      expect(secondDelta.ownerId).toBe("player-1");
      expect(secondDelta.ownershipState).toBe("SETTLED");
    } finally {
      vi.useRealTimers();
    }
  });
});
