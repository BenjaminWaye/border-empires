import { describe, expect, it, vi } from "vitest";
import { getWorldSeed, setWorldSeed, structureBuildDurationMs } from "@border-empires/shared";
import { MANPOWER_BASE_CAP, MANPOWER_BASE_REGEN_PER_MINUTE, SIPHON_CRYSTAL_COST, SIPHON_DURATION_MS, TOWN_MANPOWER_BY_TIER } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { MAX_SETTLE_DURATION_MS, settlementBaseDurationMsForTile, SimulationRuntime } from "./runtime.js";
import { createPlayersFromRecoveredState } from "../runtime-hydration.js";
import { buildAiOpponent, buildPlayer, collectEvents, testRuntimePlayer } from "./runtime.test-helpers.js";

type SimulationRuntimeEventShape = SimulationEvent;

describe("simulation runtime", () => {
  it("applyPassiveIncome credits gold proportional to elapsed time for active players", () => {
    const startMs = 1_000_000;
    const elapsedMs = 60_000; // 1 minute
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
        ["player-1", buildPlayer("player-1", { manpower: 0, manpowerUpdatedAt: 0, manpowerCapSnapshot: 150 })]
      ]),
      seedTiles: new Map(),
      initialState: { tiles: [], activeLocks: [] }
    });

    const player = runtime.exportState().players.find((entry) => entry.id === "player-1");
    expect(player?.manpower).toBe(MANPOWER_BASE_REGEN_PER_MINUTE);
  });

  it("emits town-scaled manpower regen and breakdown in player updates", async () => {
    let currentNow = 60_000;
    const runtime = new SimulationRuntime({
      now: () => currentNow,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 0, manpowerUpdatedAt: 0, manpowerCapSnapshot: 150 })]
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
    expect(payload.manpowerCap).toBe(settlementCap * 2);
    expect(payload.manpowerRegenPerMinute).toBe(settlementRegen * 2);
    expect(payload.manpowerBreakdown.cap).toEqual([{ label: "2 Settlements", amount: settlementCap * 2 }]);
    expect(payload.manpowerBreakdown.regen).toEqual([{ label: "2 Settlements", amount: settlementRegen * 2 }]);

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
    expect(secondPayload.manpower - payload.manpower).toBeCloseTo(settlementRegen * 2, 10);
  });

  it("does not grant town manpower boosts while a claimed town tile is still frontier", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 0, manpowerUpdatedAt: 0, manpowerCapSnapshot: 150 })]
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

    expect(player?.manpowerCap).toBe(MANPOWER_BASE_CAP);
    expect(player?.manpowerRegenPerMinute).toBe(MANPOWER_BASE_REGEN_PER_MINUTE);
    expect(player?.manpowerBreakdown).toEqual({
      cap: [{ label: "Base minimum", amount: MANPOWER_BASE_CAP }],
      regen: [{ label: "Base minimum", amount: MANPOWER_BASE_REGEN_PER_MINUTE }]
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
    expect(payload.manpowerBreakdown.cap.map((line) => line.label)).toEqual(["2 Great Cities", "2 Metropolises"]);
    expect(payload.manpowerBreakdown.regen.map((line) => line.label)).toEqual(["2 Great Cities", "2 Metropolises"]);
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
          { x: 14, y: 10, terrain: "LAND" },
          { x: 30, y: 30, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const visibleState = runtime.exportVisibleStateForPlayer("player-1");

    expect(visibleState.tiles).toEqual([
      expect.objectContaining({ x: 10, y: 10, ownerId: "player-1", ownershipState: "SETTLED" }),
      expect.objectContaining({ x: 14, y: 10, terrain: "LAND" })
    ]);
    expect(visibleState.tiles.some((tile) => tile.x === 30 && tile.y === 30)).toBe(false);
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
          { x: 12, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
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

    const radiusAudit = audits.find((entry) => entry.tileKey === "12,10");
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
          { x: 12, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
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
        x: 12,
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

    expect(filtered.map((delta) => `${delta.x},${delta.y}`).sort()).toEqual(["10,10", "12,10"]);
    expect(filtered.some((delta) => delta.x === 50 && delta.y === 50)).toBe(false);
    const ownDelta = filtered.find((delta) => delta.x === 10 && delta.y === 10);
    expect(ownDelta?.ownerId).toBe("player-1");
    const visibleOpponent = filtered.find((delta) => delta.x === 12 && delta.y === 10);
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
      { x: 12, y: 10, terrain: "LAND" as const, ownerId: "player-3", ownershipState: "SETTLED", townJson: "{}" },
      { x: 102, y: 100, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED", townJson: "{}" },
      { x: 202, y: 200, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "SETTLED", townJson: "{}" }
    ];

    const p1Filtered = runtime.filterTileDeltasForPlayer(deltas, "player-1");
    const p2Filtered = runtime.filterTileDeltasForPlayer(deltas, "player-2");
    const p3Filtered = runtime.filterTileDeltasForPlayer(deltas, "player-3");

    // Each subscriber sees exactly the one delta in their vision radius and
    // no others — proving the leak from cross-region opponent activity is
    // closed even with multiple subscribers in a single batch.
    expect(p1Filtered.map((delta) => `${delta.x},${delta.y}`)).toEqual(["12,10"]);
    expect(p2Filtered.map((delta) => `${delta.x},${delta.y}`)).toEqual(["102,100"]);
    expect(p3Filtered.map((delta) => `${delta.x},${delta.y}`)).toEqual(["202,200"]);
  });

  it("filterTileDeltasForPlayer eager and lazy paths agree on large delta batches", () => {
    // The eager fast path kicks in when tileDeltas.length >= 16. This test
    // builds a batch large enough to trip the threshold and confirms the
    // visible-set output matches the lazy path on a smaller slice (R=4, so
    // tiles at Chebyshev distance ≤ 4 from an owned tile are visible).
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

    // Build 25 deltas: mix of tiles inside player-1's vision (Chebyshev ≤ 4
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
    // Player-1 owns (10,10) with vision radius 4 → x in [6..14] visible at y=10.
    expect(visibleXs).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14]);
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
          { x: 49, y: 49, terrain: "LAND" },
          { x: 50, y: 49, terrain: "LAND" },
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
      clientSeq: 1,
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
          { x: 24, y: 245, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
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
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
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
      expect(scheduled[0]?.delayMs).toBe(3_000);

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

  it("accepts dock-crossing frontier expansion to linked islands", async () => {
    const runtime = new SimulationRuntime({
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
        ],
        docks: [
          { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
          { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
        ],
        activeLocks: []
      }
    });
    const seen: string[] = [];
    runtime.onEvent((event) => {
      seen.push(event.eventType);
    });

    runtime.submitCommand({
      commandId: "cmd-dock-expand",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 51, toY: 50 })
    });

    await Promise.resolve();
    expect(seen[0]).toBe("COMMAND_ACCEPTED");
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
    expect(payload.gold).toBeGreaterThan(0.9);
  });

  it("drains food upkeep continuously so net-negative food balances actually decrement", async () => {
    let currentNow = 60_000;
    const runtime = new SimulationRuntime({
      now: () => currentNow,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { strategicResources: { FOOD: 10, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } })]
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
    // Town tier upkeep is 0.1 food/min; 5 minutes elapsed → 0.5 drained from 10.
    expect(payload.strategicResources.FOOD).toBeCloseTo(9.5, 2);
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
            economicStructure: { type: "CAMP", status: "active" }
          }
        ],
        activeLocks: []
      }
    });
    // 60 minutes elapse offline. Town produces 4 gold/min (~240 gold of
    // yield accumulates); CAMP draws 1.2 gold/min in upkeep (~72 gold owed).
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
            town: { type: "TRADE", populationTier: "SETTLEMENT", goldPerMinute: 1 }
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
    // 60 min elapse: town yields ~60 gold, GARRISON_HALL draws 2.5
    // gold/min (~150 gold). Yield covers part of it; the ~90 gold
    // deficit hits the stockpile, so points drops below 1000 but stays
    // well above 0.
    currentNow += 60 * 60_000;
    runtime.exportPlannerPlayerViews(["player-1"]);
    const exported = runtime.exportState();
    const player = exported.players.find((p) => p.id === "player-1");
    expect(player?.points).toBeGreaterThan(850);
    expect(player?.points).toBeLessThan(960);
  });

  it("drains accumulated food yield to cover food upkeep before touching the food stockpile", async () => {
    let currentNow = 60_000;
    const runtime = new SimulationRuntime({
      now: () => currentNow,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 0, strategicResources: { FOOD: 100, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } })]
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
    // 60 min elapse: TOWN tier draws 0.1 food/min (6 food). Two FARM
    // tiles produce 48/day = 0.0333/min each (4 food total). Net -2 food,
    // so FOOD stockpile drops from 100 to 98.
    currentNow += 60 * 60_000;
    runtime.exportPlannerPlayerViews(["player-1"]);
    const exported = runtime.exportState();
    const player = exported.players.find((p) => p.id === "player-1");
    expect(player?.strategicResources.FOOD).toBeCloseTo(98, 0);
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
            economicStructure: { type: "GARRISON_HALL", status: "active", ownerId: "player-1" }
          }
        ],
        activeLocks: []
      }
    });
    // 60 min elapse: tile (5,5) produces 10 gold/min (~610 gold yield
    // before any drain); GARRISON_HALL draws 150 gold. Accrual consumes
    // 150 from the buffer and advances the tile's anchor. A subsequent
    // COLLECT_TILE should only see the ~460 leftover — never the full
    // 610 — which would happen if the anchor hadn't moved.
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
    expect(player?.points).toBeGreaterThan(440);
    expect(player?.points).toBeLessThan(480);
  });

  it("drains unconsumed food yield on a mixed-yield tile when gold upkeep advances the shared anchor", async () => {
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
    // The mixed-yield tile (5,5) produces 10 gold/min AND 48 FOOD/day
    // (~2.03 FOOD over 61 minutes since the anchor was never set).
    // GARRISON_HALL draws gold but no food, so accrual consumes gold
    // only — yet the single shared anchor advances, so a later collect
    // sees less than the full 61-minute window of FOOD. This pins the
    // documented multi-resource trade-off; if per-resource anchors are
    // ever introduced, this test should be updated.
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
    expect(player?.strategicResources.FOOD).toBeGreaterThan(1);
    expect(player?.strategicResources.FOOD).toBeLessThan(2);
  });

  it("does not choose unaffordable frontier actions for AI automation", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["ai-1", testRuntimePlayer("ai-1", { isAi: true, points: 0, manpower: 0, strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } })]
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
    // has an expansionObjective pointing toward them. Without one, the AI should produce
    // no command rather than burning 1 gold on a tile that decays in ~10 minutes.
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["ai-1", testRuntimePlayer("ai-1", { isAi: true, manpower: 10_000, strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } })]
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
        ["ai-1", testRuntimePlayer("ai-1", { isAi: true, manpower: 10_000, strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } })]
      ]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", dockId: "dock-a", town: { name: "Spawn", type: "FARMING", populationTier: "SETTLEMENT" } },
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
      vi.advanceTimersByTime(3_100);

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
      vi.advanceTimersByTime(3_100);

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
      vi.advanceTimersByTime(3_100);

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

      vi.advanceTimersByTime(3_100);
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
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
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
      vi.advanceTimersByTime(3_100);

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
      expect((exported.players.find((entry) => entry.id === "player-1")?.manpower ?? 0) < 150).toBe(true);
      expect(exported.tiles.find((tile) => tile.x === 10 && tile.y === 11)).toEqual(
        expect.objectContaining({
          ownerId: "player-2",
          ownershipState: "SETTLED"
        })
      );
      expect(exported.players.find((entry) => entry.id === "player-1")?.points).toBe(100);
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
      vi.advanceTimersByTime(3_100);

      expect(runtime.exportState().players.find((entry) => entry.id === "player-1")?.points).toBe(99);
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
      vi.advanceTimersByTime(3_100);

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
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
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
      vi.advanceTimersByTime(3_100);

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
      vi.advanceTimersByTime(3_100);

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
      vi.advanceTimersByTime(3_100);

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
              fort: { ownerId: "player-1", status: "active" }
            },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
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
      vi.advanceTimersByTime(3_100);

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
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
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
      vi.advanceTimersByTime(3_100);

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
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["masonry"]), strategicResources: { IRON: 100 } })
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
            }
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
      expect(runtime.exportState().players.find((player) => player.id === "player-1")?.manpower).toBe(0);

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
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["masonry", "fortified-walls"]), strategicResources: { IRON: 500 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" } }
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
      expect(tile?.fortJson).toContain("\"variant\":\"IRON_BASTION\"");
    } finally {
      vi.useRealTimers();
    }
  });

  it("upgrades FORT → IRON_BASTION when fortified-walls is researched", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["masonry", "fortified-walls"]), strategicResources: { IRON: 500 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" }, fort: { ownerId: "player-1", status: "active", variant: "FORT" as const } }
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
      expect(tile?.fortJson).toContain("\"variant\":\"IRON_BASTION\"");
      // Should charge 1800 gold + 90 iron (not base FORT costs).
      // Points drop: 10_000 - (round(1800 * 1.0)) = 8_200
      const player = runtime.exportState().players.find((p) => p.id === "player-1")!;
      expect(player.points).toBeLessThan(9_000); // clearly less than the base FORT 900
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
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["masonry", "fortified-walls", "steelworking"]), strategicResources: { IRON: 500 } })
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
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["masonry"]), strategicResources: { IRON: 500 } })
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
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["masonry", "fortified-walls", "steelworking"]), strategicResources: { IRON: 500 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" } }
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
            buildPlayer("player-1", { points: 10_000, manpower: 300, techIds: new Set<string>(["masonry"]), strategicResources: { IRON: 100 } })
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
            }
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
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["masonry"]), strategicResources: { IRON: 100 } })
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
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["cartography"]), strategicResources: { CRYSTAL: 100 } })
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
            }
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
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["leatherworking"]), strategicResources: { SUPPLY: 100 } })
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
            }
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
      expect(runtime.exportState().players.find((player) => player.id === "player-1")?.manpower).toBe(90);

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
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["leatherworking", "siegecraft"]), strategicResources: { SUPPLY: 500, IRON: 200 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 14, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" } }
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
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["leatherworking", "siegecraft"]), strategicResources: { SUPPLY: 500, IRON: 200 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 14, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" }, siegeOutpost: { ownerId: "player-1", status: "active", variant: "SIEGE_OUTPOST" as const } }
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
      // Should charge 1800 gold + 90 supply + 60 iron (not base SIEGE_OUTPOST costs)
      const player = runtime.exportState().players.find((p) => p.id === "player-1")!;
      expect(player.points).toBeLessThan(9_000); // clearly less than the base 900
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
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["leatherworking", "siegecraft", "standing-army"]), strategicResources: { SUPPLY: 500, IRON: 200 } })
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
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["leatherworking"]), strategicResources: { SUPPLY: 500, IRON: 200 } })
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
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["leatherworking", "siegecraft", "standing-army"]), strategicResources: { SUPPLY: 500, IRON: 200 } })
          ]
        ]),
        initialState: {
          tiles: [
            { x: 14, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Test Town", type: "FARMING", populationTier: "TOWN" } }
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

  it("does not lose SUPPLY when IRON is insufficient for a siege upgrade", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            // enough SUPPLY, not enough IRON
            buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["leatherworking", "siegecraft"]), strategicResources: { SUPPLY: 100, IRON: 10 } })
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
        commandId: "siege-resource-theft-1",
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
      expect(events[0].message).toBe("insufficient IRON for siege outpost");
      // SUPPLY must be unchanged — no silent resource theft.
      const player = runtime.exportState().players.find((p) => p.id === "player-1")!;
      expect(player.strategicResources.SUPPLY).toBe(100);
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds a market through the rewrite simulation path and places it on a supported town tile", async () => {
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
            }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "market-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 16, y: 16, structureType: "MARKET" })
      });

      await Promise.resolve();
      expect(runtime.exportState().tiles).toContainEqual(
        expect.objectContaining({
          x: 16,
          y: 17,
          economicStructureJson: expect.any(String)
        })
      );

      vi.advanceTimersByTime(structureBuildDurationMs("MARKET"));

      const exported = runtime.exportState().tiles.find((tile) => tile.x === 16 && tile.y === 17);
      expect(exported?.economicStructureJson).toContain("\"type\":\"MARKET\"");
      expect(exported?.economicStructureJson).toContain("\"status\":\"active\"");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects duplicate support structures submitted directly on another support tile", async () => {
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
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "MARKET", status: "active" }
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
      commandId: "market-duplicate-support-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 17, y: 16, structureType: "MARKET" })
    });

    await Promise.resolve();
    expect(events).toEqual([{ code: "BUILD_INVALID", message: "town already has market" }]);
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
        commandId: "garrison-hall-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "GARRISON_HALL" })
      });

      await Promise.resolve();
      expect(events).toHaveLength(0);

      vi.advanceTimersByTime(structureBuildDurationMs("GARRISON_HALL"));

      const exported = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10);
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
              type: "FUR_SYNTHESIZER",
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

  it("overloads a ready synthesizer through the rewrite simulation path", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 20_000, manpower: 10_000, techIds: new Set<string>(["overload-protocols"]), strategicResources: { SUPPLY: 0 } })
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 22,
            y: 22,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: {
              ownerId: "player-1",
              type: "FUR_SYNTHESIZER",
              status: "active"
            }
          }
        ],
        activeLocks: []
      }
    });

    runtime.submitCommand({
      commandId: "overload-cmd-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "OVERLOAD_SYNTHESIZER",
      payloadJson: JSON.stringify({ x: 22, y: 22 })
    });

    await Promise.resolve();

    const exportedTile = runtime.exportState().tiles.find((tile) => tile.x === 22 && tile.y === 22);
    expect(exportedTile?.economicStructureJson).toContain("\"status\":\"inactive\"");
    expect(exportedTile?.economicStructureJson).toContain("\"disabledUntil\":86401000");
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
              type: "IRONWORKS",
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
      vi.advanceTimersByTime(3_100);

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
      now: () => 1_000
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
      now: () => 1_000
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

  it("emits reveal tile deltas around a hostile capture after combat resolution", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
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
      vi.advanceTimersByTime(3_100);

      expect(tileDeltaEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER", terrain: "LAND" }),
          expect.objectContaining({ x: 9, y: 11, terrain: "LAND" })
        ])
      );
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
      vi.advanceTimersByTime(3_100);

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
      vi.advanceTimersByTime(3_100);

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
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }],
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

  it("applies settlement speed tech to pending settlement duration", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { manpower: 100, techIds: new Set(["toolmaking"]) })
        ]
      ]),
      initialState: {
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }],
        activeLocks: []
      }
    });

    runtime.submitCommand({
      commandId: "settle-fast",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SETTLE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });

    await Promise.resolve();

    expect(scheduledTasks).toHaveLength(1);
    expect(scheduledTasks[0]?.delayMs).toBe(Math.round(60_000 / 1.05));
    expect(runtime.exportState().pendingSettlements).toEqual([
      expect.objectContaining({
        ownerId: "player-1",
        tileKey: "10,10",
        startedAt: 1_000,
        resolvesAt: 1_000 + Math.round(60_000 / 1.05)
      })
    ]);
  });

  it("applies forest settlement duration before settlement speed tech", async () => {
    const previousSeed = getWorldSeed();
    setWorldSeed(1);
    try {
      // Forest settlement tiles are worldgen-derived; locate one for this seed.
      let forest: { x: number; y: number } | undefined;
      for (let y = 0; y < 256 && !forest; y += 1) {
        for (let x = 0; x < 256 && !forest; x += 1) {
          if (settlementBaseDurationMsForTile({ x, y }) === MAX_SETTLE_DURATION_MS) forest = { x, y };
        }
      }
      if (!forest) throw new Error("no forest settlement tile found for world seed 1");
      const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        scheduleAfter: (delayMs, task) => {
          scheduledTasks.push({ delayMs, task });
        },
        initialPlayers: new Map([
          [
            "player-1",
            buildPlayer("player-1", { manpower: 100, techIds: new Set(["toolmaking"]) })
          ]
        ]),
        initialState: {
          tiles: [{ x: forest.x, y: forest.y, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "settle-fast-forest",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x: forest.x, y: forest.y })
      });

      await Promise.resolve();

      expect(scheduledTasks).toHaveLength(1);
      // Forest doubles the base (MAX_SETTLE_DURATION_MS); toolmaking applies a 1.05x speed mult.
      expect(scheduledTasks[0]?.delayMs).toBe(Math.round(MAX_SETTLE_DURATION_MS / 1.05));
    } finally {
      setWorldSeed(previousSeed);
    }
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
            { x: 10, y: 8, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 11, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER" },
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
      vi.advanceTimersByTime(3_100);

      expect(runtime.exportState().pendingSettlements).not.toContainEqual(
        expect.objectContaining({ ownerId: "player-1", tileKey: "10,10" })
      );
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
      vi.advanceTimersByTime(3_100);
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
            { x: 10, y: 8, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 11, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER" },
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
      vi.advanceTimersByTime(3_100);

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
      vi.advanceTimersByTime(3_100);

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
            strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 }
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
        gold: 88,
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
          { x: 30, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "TOWN", name: "Three" } }
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
    expect(recoveredPlayer?.incomePerMinute).toBeCloseTo(15.4);
  });

  it("preserves AI identity from initial players when recovered player rows omit isAi", () => {
    const runtime = new SimulationRuntime({
      initialPlayers: new Map([
        ["ai-1", testRuntimePlayer("ai-1", { isAi: true, name: "ai-1", strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } })]
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
          buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(["cryptography", "surveying"]), strategicResources: { CRYSTAL: 1_000 } })
        ],
        [
          "player-2",
          buildPlayer("player-2", { isAi: true, points: 900, manpower: 700, techIds: new Set<string>(["cartography"]), strategicResources: { FOOD: 4, IRON: 3, CRYSTAL: 2, SUPPLY: 1, SHARD: 0 } })
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } }
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
            strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 100, SUPPLY: 0, SHARD: 0 }
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
          { x: 0, y: 1, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "IRON" },
          { x: 2, y: 1, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER", resource: "WOOD" },
          { x: 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } },
          { x: 1, y: 2, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
          { x: 2, y: 2, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
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
          { x: 1, y: 2, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", shardSite: { kind: "CACHE", amount: 3 } }
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
          { x: 3, y: 2, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
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
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
          { x: 0, y: 1, terrain: "SEA" },
          { x: 0, y: 2, terrain: "SEA" },
          { x: 0, y: 3, terrain: "LAND" }
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
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
          { x: 0, y: 1, terrain: "SEA" },
          { x: 0, y: 2, terrain: "SEA" },
          { x: 0, y: 3, terrain: "LAND" }
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
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
          { x: 0, y: 1, terrain: "SEA" },
          { x: 0, y: 2, terrain: "SEA" },
          { x: 0, y: 3, terrain: "LAND" },
          { x: 0, y: 4, terrain: "LAND" }
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
          { x: 2, y: 3, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
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
    towerX?: number;
    towerY?: number;
    towerStatus?: "active" | "under_construction";
    towerOwnerId?: string;
    omitTower?: boolean;
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
      { x: 2, y: 3, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
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
          buildPlayer("player-1", { points: 20_000, manpower: 10_000, strategicResources: options.resources ?? { CRYSTAL: 10 } })
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

  it("AIRPORT_BOMBARD consumes CRYSTAL and rejects when CRYSTAL is insufficient", async () => {
    const runtime = buildAetherTowerRuntime({ resources: { CRYSTAL: 0 } });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "bombard-no-crystal",
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
        commandId: "bombard-no-crystal",
        code: "AIRPORT_BOMBARD_INVALID",
        message: "insufficient CRYSTAL for bombardment"
      })
    );
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
              ownershipState: "FRONTIER"
            },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              town: { name: "Target", type: "FARMING", populationTier: "SETTLEMENT" }
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
                      type: "LIGHT_OUTPOST" as const,
                      status: "active" as const
                    }
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

    it("walks instead of multiplying once barb population is at the cap", () => {
      // 200 barb tiles already. At cap, multiply is blocked — falls through to
      // plain walk (origin released, target claimed, net 0).
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
      // Stamp origin with at-threshold progress so without the cap it would multiply.
      readProgress(runtime).set("100,100", 5);

      runResolve();

      const state = runtime.exportState();
      const origin = state.tiles.find((tile) => tile.x === 100 && tile.y === 100);
      const target = state.tiles.find((tile) => tile.x === 50 && tile.y === 50);
      // Cap held: source released (walk), target captured.
      expect(origin?.ownerId).toBeUndefined();
      expect(target?.ownerId).toBe("barbarian-1");
      // Population stays at 200, not 201.
      expect(state.tiles.filter((tile) => tile.ownerId === "barbarian-1").length).toBe(200);
      // Over-threshold progress carries to target so the next walk multiplies
      // as soon as the population drops below cap.
      const progress = readProgress(runtime);
      expect(progress.get("100,100")).toBeUndefined();
      expect(progress.get("50,50")).toBe(5);

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
              { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", frontierDecayAt: 61_000, frontierDecayKind: "NATURAL" },
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

  it("subscription snapshot includes synthesizer crystal regen without COLLECT_VISIBLE", () => {
    // Regression: strategicProductionPerMinute in subscription snapshots was
    // sourced from summary.strategicProductionPerMinute (terrain-only), so
    // players with CRYSTAL_SYNTHESIZER but no GEMS tiles saw 0 crystal regen
    // on connect until COLLECT_VISIBLE fired emitPlayerStateUpdate.
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
    // Crystal synthesizer outputs CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY / 1440 per minute.
    expect(player?.strategicProductionPerMinute?.CRYSTAL ?? 0).toBeGreaterThan(0);
  });

  it("chosenTrickleResource round-trips through snapshot and trickle is credited after recovery", () => {
    // Regression: chosenTrickleResource was never persisted to the compaction
    // snapshot, so Clockwork Stipend trickle was lost after sim restart.
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", testRuntimePlayer("player-1", { domainIds: new Set(["clockwork-stipend"]), chosenTrickleResource: "IRON" as const })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "SETTLEMENT", name: "Trickle Town" }
          }
        ],
        activeLocks: []
      }
    });

    // Export the snapshot sections and verify chosenTrickleResource is present.
    const sections = runtime.exportSnapshotSections();
    const exportedPlayer = sections.initialState.players?.find((p) => p.id === "player-1");
    expect(exportedPlayer?.chosenTrickleResource).toBe("IRON");

    // Recover from those sections (simulates restart hydration).
    const recovered = createPlayersFromRecoveredState(sections.initialState);
    const recoveredPlayer = recovered?.get("player-1");
    expect(recoveredPlayer?.chosenTrickleResource).toBe("IRON");

    // Build a new runtime from the recovered state, use fake timers, and
    // advance time — the trickle should actually credit IRON.
    vi.useFakeTimers();
    const recoveredRuntime = new SimulationRuntime({
      now: () => Date.now(),
      initialPlayers: recovered,
      initialState: {
        tiles: [
          {
            x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "SETTLEMENT", name: "Trickle Town" }
          }
        ],
        activeLocks: []
      }
    });

    // Advance time by 10 minutes. Clockwork Stipend IRON rate is 0.2/min.
    vi.advanceTimersByTime(10 * 60_000);
    const stateAfter = recoveredRuntime.exportState();
    const playerAfter = stateAfter.players.find((p) => p.id === "player-1");
    // 10 min × 0.2/min = 2.0 IRON (before upkeep drain on a single settlement).
    expect(playerAfter?.strategicResources?.IRON ?? 0).toBeGreaterThan(0);
    vi.useRealTimers();
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
      now: () => localTime(11, 0),
      initialPlayers: new Map([["human-1", humanPlayer("human-1")]]),
      seedTiles: new Map(),
      initialState: { tiles: [], activeLocks: [] }
    });
    const seen = collectEvents(runtime);

    runtime.tickShardRain(localTime(11, 0));

    const notices = seen.filter(
      (event): event is Extract<SimulationEvent, { eventType: "PLAYER_MESSAGE" }> =>
        event.eventType === "PLAYER_MESSAGE" && event.messageType === "SHARD_RAIN_EVENT"
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]?.playerId).toBe("human-1");
    const payload = JSON.parse(notices[0]!.payloadJson);
    expect(payload).toEqual(
      expect.objectContaining({ type: "SHARD_RAIN_EVENT", phase: "upcoming", startsAt: localTime(12, 0) })
    );
  });

  it("spawns FALL shard sites and broadcasts 'started' at a scheduled hour", () => {
    const tiles = [
      { x: 0, y: 0, terrain: "LAND" as const },
      { x: 1, y: 0, terrain: "LAND" as const },
      { x: 2, y: 0, terrain: "LAND" as const }
    ];
    const runtime = new SimulationRuntime({
      now: () => localTime(12, 0),
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
      runtime.tickShardRain(localTime(12, 0));
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
        startsAt: localTime(12, 0),
        expiresAt: localTime(12, 0) + 30 * 60_000
      })
    );
  });

  it("does not double-spawn when ticked twice in the same slot", () => {
    const runtime = new SimulationRuntime({
      now: () => localTime(12, 0),
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
      runtime.tickShardRain(localTime(12, 0));
      runtime.tickShardRain(localTime(12, 0));
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
    const expiresAt = localTime(12, 0) + 30 * 60_000;
    const runtime = new SimulationRuntime({
      now: () => localTime(12, 0),
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
      now: () => localTime(12, 0),
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
      runtime.tickShardRain(localTime(12, 0));
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
    const expiresAt = localTime(12, 0) + 30 * 60_000;
    const runtime = new SimulationRuntime({
      now: () => localTime(12, 15),
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

    runtime.emitShardRainHelloFor("human-1", localTime(12, 15));

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
    const expiresAt = localTime(12, 0) + 30 * 60_000;
    const runtime = new SimulationRuntime({
      now: () => localTime(12, 15),
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
    runtime.emitShardRainHelloFor("human-1", localTime(12, 15));
    const helloNotices = seen
      .slice(helloBefore)
      .filter(
        (event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "SHARD_RAIN_EVENT"
      );
    expect(helloNotices).toHaveLength(0);
  });

  it("emitShardRainHelloFor only sends one hello per player per rain window", () => {
    const expiresAt = localTime(12, 0) + 30 * 60_000;
    const runtime = new SimulationRuntime({
      now: () => localTime(12, 15),
      initialPlayers: new Map([["human-1", humanPlayer("human-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [{ x: 0, y: 0, terrain: "LAND" as const, shardSite: { kind: "FALL", amount: 1, expiresAt } }],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.emitShardRainHelloFor("human-1", localTime(12, 15));
    runtime.emitShardRainHelloFor("human-1", localTime(12, 20));

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
      now: () => localTime(12, 0),
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
      // First rain at 12:00
      runtime.tickShardRain(localTime(12, 0));

      // Advance past TTL (30 min) and trigger second rain at 20:00.
      // expireShardFallSites runs first and clears shardSite; then the
      // spawn loop finds no eligible tiles because recentShardRainTileKeys
      // still holds the 3 tiles from the first event.
      runtime.tickShardRain(localTime(20, 0));

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
              { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
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
        vi.advanceTimersByTime(3_100);

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
              { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
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
        vi.advanceTimersByTime(3_100);

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
        expect(runtime.exportState().players.find((player) => player.id === "player-2")?.points).toBe(100);
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
              { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
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
        vi.advanceTimersByTime(3_100);

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

describe("imperial exchange levy", () => {
  const buildLevyRuntime = (options: {
    techIds?: string[];
    crystal?: number;
    omitTower?: boolean;
    rivalStocks?: Record<string, Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY", number>>>;
    allies?: string[];
  } = {}): SimulationRuntime => {
    const tiles: Array<Record<string, unknown>> = [
      {
        x: 0,
        y: 0,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "SETTLED",
        economicStructure: { ownerId: "player-1", type: "IMPERIAL_EXCHANGE", status: "active" }
      }
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
    const players = new Map<string, Record<string, unknown>>();
    players.set("player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000, techIds: new Set<string>(options.techIds ?? ["exchange-levy"]), allies: new Set<string>(options.allies ?? []), strategicResources: { CRYSTAL: options.crystal ?? 1_000 } }));
    for (const [pid, stocks] of Object.entries(options.rivalStocks ?? {})) {
      players.set(pid, {
        id: pid,
        isAi: true,
        points: 100,
        manpower: 100,
        techIds: new Set<string>(),
        domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local",
        allies: new Set<string>(),
        strategicResources: stocks
      });
    }
    return new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: players as never,
      initialState: { tiles: tiles as never, activeLocks: [] }
    });
  };

  it("rejects without exchange-levy tech", async () => {
    const runtime = buildLevyRuntime({ techIds: [] });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "levy-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "IMPERIAL_EXCHANGE_LEVY",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, resource: "FOOD" })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "levy-1",
      code: "IMPERIAL_EXCHANGE_LEVY_INVALID",
      message: "requires Exchange Levy Writs research"
    }));
  });

  it("rejects without a powering Aether Tower", async () => {
    const runtime = buildLevyRuntime({ omitTower: true });
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "levy-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "IMPERIAL_EXCHANGE_LEVY",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, resource: "FOOD" })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      code: "IMPERIAL_EXCHANGE_LEVY_INVALID",
      message: "Imperial Exchange requires a nearby Aether Tower"
    }));
  });

  it("transfers a quarter of each rival's stock and applies cooldown", async () => {
    const runtime = buildLevyRuntime({
      rivalStocks: {
        "player-2": { FOOD: 100 },
        "player-3": { FOOD: 40 }
      }
    });
    runtime.submitCommand({
      commandId: "levy-3",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "IMPERIAL_EXCHANGE_LEVY",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, resource: "FOOD" })
    });
    await Promise.resolve();
    const state = runtime.exportState();
    const p1 = state.players.find((p) => p.id === "player-1");
    const p2 = state.players.find((p) => p.id === "player-2");
    const p3 = state.players.find((p) => p.id === "player-3");
    // 25% of 100 = 25; 25% of 40 = 10. Actor gets 35.
    expect(p1?.strategicResources?.FOOD).toBe(35);
    expect(p2?.strategicResources?.FOOD).toBe(75);
    expect(p3?.strategicResources?.FOOD).toBe(30);
    // Second invocation should be on cooldown.
    const events: Array<Record<string, unknown>> = [];
    runtime.onEvent((event) => events.push(event as unknown as Record<string, unknown>));
    runtime.submitCommand({
      commandId: "levy-3b",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "IMPERIAL_EXCHANGE_LEVY",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, resource: "FOOD" })
    });
    await Promise.resolve();
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "levy-3b",
      code: "IMPERIAL_EXCHANGE_LEVY_INVALID",
      message: "ability on cooldown"
    }));
  });

  it("does not seize from allies", async () => {
    const runtime = buildLevyRuntime({
      rivalStocks: {
        "player-2": { FOOD: 100 },
        "player-3": { FOOD: 100 }
      },
      allies: ["player-2"]
    });
    runtime.submitCommand({
      commandId: "levy-ally",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "IMPERIAL_EXCHANGE_LEVY",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, resource: "FOOD" })
    });
    await Promise.resolve();
    const state = runtime.exportState();
    const p1 = state.players.find((p) => p.id === "player-1");
    const p2 = state.players.find((p) => p.id === "player-2");
    const p3 = state.players.find((p) => p.id === "player-3");
    expect(p2?.strategicResources?.FOOD).toBe(100);
    expect(p3?.strategicResources?.FOOD).toBe(75);
    expect(p1?.strategicResources?.FOOD).toBe(25);
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
        fort: { ownerId: "player-2", status: "active" }
      }
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
        }
      );
    }
    return new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: options.points ?? 5_000, manpower: 10_000, techIds: new Set<string>(["signal-fires"]), strategicResources: { CRYSTAL: options.crystal ?? 500 } })],
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
    expect(actor?.points).toBe(2_000);
    expect(actor?.strategicResources?.CRYSTAL).toBe(400);
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
      }
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

  it("rejects without worldbreaker-fire tech", async () => {
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
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "COMMAND_REJECTED",
      commandId: "strike-1",
      code: "WORLD_ENGINE_STRIKE_INVALID",
      message: "requires Worldbreaker Fire research"
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
    const runtime = buildStrikeRuntime({ points: 1_000 });
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
            strategicResources: { FOOD: 100, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 }
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
              hasMarket: false,
              marketActive: false,
              hasGranary: false,
              granaryActive: false,
              hasBank: false,
              bankActive: false
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
    // Persisted goldPerMinute was 0.5; live recompute must override it. Exact
    // value depends on the gold formula, just assert it's the recomputed one
    // (not the stale stub).
    const refreshedTown = centerDelta?.townJson ? JSON.parse(centerDelta.townJson) : undefined;
    expect(refreshedTown?.goldPerMinute).toBeGreaterThan(0.5);
  });

  it("emits an explicit zero yield buffer for yield-bearing tiles so fresh responses can clear stale cached buffers", () => {
    // Repro for the post-PR-353 bug: a town's cached client snapshot kept
    // `yield: { gold: 2105 }` from when the town had a market (cap ~2112), but
    // after market loss + an upkeep tick that emptied the live buffer to 0,
    // FetchTileDetail omitted the `yield` field entirely (because gold was
    // ≤ 0.0001), and the gateway's shallow snapshot merge preserved the stale
    // 2105. Verify the delta now carries `yield: { gold: 0 }` so the client
    // can authoritatively clear stale buffers even when the live value is zero.
    const nowMs = 1_000_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { strategicResources: { FOOD: 100, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } })]
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
              hasMarket: false,
              marketActive: false,
              hasGranary: false,
              granaryActive: false,
              hasBank: false,
              bankActive: false
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
          }))
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
    // market, no bank. Expected gpm = TOWN_BASE(2) * 1 * 1 * 2.2 * 1 * 1 * 1
    // = 4.4; cap = 4.4*60*8 = 2112. If this test fails, the sim has its own
    // bug; if it passes, the prod display of 2.00/m + cap 960 means the
    // gateway's buildSnapshotTileDetail is clobbering the sim's authoritative
    // value.
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { strategicResources: { FOOD: 1000, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } })]
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
              hasMarket: false,
              marketActive: false,
              hasGranary: false,
              granaryActive: false,
              hasBank: false,
              bankActive: false
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
          // Five plain settled-land tiles to fill (5,5)'s remaining 8-neighbors.
          ...[
            [4, 4], [5, 4], [6, 4],
            [4, 5],
            [4, 6]
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
    const town = centerDelta?.townJson ? JSON.parse(centerDelta.townJson) as Record<string, unknown> : undefined;
    expect(town).toBeDefined();
    // First, prove the BFS sees all three neighbors (the actual user-visible
    // modifier line shows "3 connected towns: +120%").
    expect(town?.connectedTownCount).toBe(3);
    expect(town?.connectedTownBonus).toBeCloseTo(1.2, 5);
    // Now the load-bearing assertion: gpm must reflect that bonus.
    // yieldRate/yieldCap removed from tile export (bootstrap-payload-shrink PR A).
    // 2 * 1.0 * 1.0 (TOWN tier popMult) * 2.2 = 4.4
    expect(town?.goldPerMinute).toBeCloseTo(4.4, 2);
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
            buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["masonry"]), strategicResources: { IRON: 500 } })
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
            }
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
