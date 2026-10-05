import { describe, expect, it } from "vitest";
import { NEW_PLAYER_AUTO_SETTLE_PREFS, type AutoSettlePrefs } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

// Per-category auto-settle opt-in (shared auto-settle-prefs.ts): the server must
// never spend manpower on a category the player hasn't opted into, must start
// settling the moment they opt in, and must keep legacy/AI behavior (all on).

const settlementStartedTileKeys = (events: SimulationEvent[]): string[] =>
  events
    .filter((event): event is Extract<SimulationEvent, { eventType: "SETTLEMENT_STARTED" }> => event.eventType === "SETTLEMENT_STARTED")
    .map((event) => event.tileKey);

const buildRuntime = (autoSettle: AutoSettlePrefs | undefined) => {
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000, manpowerUpdatedAt: 1_000, ...(autoSettle ? { autoSettle } : {}) })]
    ]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        // Reach anchor (TOWN tier), so the FRONTIER tiles below are in reach.
        { x: 40, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "TOWN" } },
        { x: 41, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "FARM" },
        { x: 40, y: 41, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", town: { name: "Neighbor", type: "MARKET", populationTier: "SETTLEMENT" } }
      ],
      activeLocks: []
    }
  });
  return { runtime, seen: collectEvents(runtime) };
};

const setPrefs = (runtime: SimulationRuntime, payload: unknown, commandId = "prefs-1"): void => {
  runtime.submitCommand({
    commandId,
    sessionId: "session-1",
    playerId: "player-1",
    clientSeq: 1,
    issuedAt: 1_000,
    type: "SET_AUTO_SETTLE_PREFS",
    payloadJson: typeof payload === "string" ? payload : JSON.stringify(payload)
  });
};

describe("auto-settle prefs gate", () => {
  it("a brand-new player (unanswered prompt) spends no manpower and starts no settlement on the tick", async () => {
    const { runtime, seen } = buildRuntime({ ...NEW_PLAYER_AUTO_SETTLE_PREFS });
    const manpowerBefore = runtime.exportState().players.find((p) => p.id === "player-1")?.manpower;
    await runtime.tickTerritoryAutomation(1_000);
    expect(settlementStartedTileKeys(seen)).toEqual([]);
    expect(runtime.exportState().pendingSettlements).toHaveLength(0);
    expect(runtime.exportState().players.find((p) => p.id === "player-1")?.manpower).toBe(manpowerBefore);
  });

  it("legacy players (no prefs stored) keep auto-settling every category", async () => {
    const { runtime, seen } = buildRuntime(undefined);
    await runtime.tickTerritoryAutomation(1_000);
    expect(settlementStartedTileKeys(seen).sort()).toEqual(["40,41", "41,40"]);
  });

  it("only the opted-in category settles", async () => {
    const { runtime, seen } = buildRuntime({ answered: true, towns: false, food: true, resources: false });
    await runtime.tickTerritoryAutomation(1_000);
    expect(settlementStartedTileKeys(seen)).toEqual(["41,40"]);
  });

  it("SET_AUTO_SETTLE_PREFS marks the prompt answered, persists, and immediately starts the newly-allowed settles", async () => {
    const { runtime, seen } = buildRuntime({ ...NEW_PLAYER_AUTO_SETTLE_PREFS });
    await runtime.tickTerritoryAutomation(1_000); // fills the held queue without spending
    setPrefs(runtime, { towns: false, food: true, resources: false });
    await Promise.resolve();
    expect(seen).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "prefs-1" }));
    expect(settlementStartedTileKeys(seen)).toEqual(["41,40"]);
    expect(runtime.exportState().players.find((p) => p.id === "player-1")?.autoSettle).toEqual({
      answered: true,
      towns: false,
      food: true,
      resources: false
    });
  });

  it("'Not now' (everything false) marks answered without settling anything", async () => {
    const { runtime, seen } = buildRuntime({ ...NEW_PLAYER_AUTO_SETTLE_PREFS });
    setPrefs(runtime, { towns: false, food: false, resources: false });
    await runtime.tickTerritoryAutomation(1_000);
    expect(settlementStartedTileKeys(seen)).toEqual([]);
    expect(runtime.exportState().players.find((p) => p.id === "player-1")?.autoSettle?.answered).toBe(true);
  });

  it("rejects a malformed payload and leaves the stored prefs untouched", async () => {
    const { runtime, seen } = buildRuntime({ ...NEW_PLAYER_AUTO_SETTLE_PREFS });
    setPrefs(runtime, { towns: "yes" });
    await Promise.resolve();
    expect(seen).toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "prefs-1", code: "BAD_COMMAND" }));
    expect(runtime.exportState().players.find((p) => p.id === "player-1")?.autoSettle).toEqual(NEW_PLAYER_AUTO_SETTLE_PREFS);
  });
});

describe("join / spawn does not spend manpower on a new human", () => {
  const spawnWorld = (initialPlayers?: Map<string, ReturnType<typeof buildPlayer>>) => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      ...(initialPlayers ? { initialPlayers } : {}),
      // Farms lie inside the opening AFC's 7x7 reach disk, but outside its
      // 3x3 footprint: an AFC may not land on or beside a resource node.
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND" as const },
          ...[13, 14, 15, 16, 17].map((x) => ({ x, y: 10, terrain: "LAND" as const, resource: "FARM" as const }))
        ],
        activeLocks: []
      }
    });
    return { runtime, seen: collectEvents(runtime) };
  };

  it("a new human joining beside farmland gets the reach claim but no auto-settle, and keeps full manpower", () => {
    const { runtime, seen } = spawnWorld();
    expect(runtime.ensurePlayerHasSpawnTerritory("newbie")).toBe(true);
    expect(settlementStartedTileKeys(seen)).toEqual([]);
    const player = runtime.exportState().players.find((p) => p.id === "newbie");
    expect(player?.autoSettle).toEqual(NEW_PLAYER_AUTO_SETTLE_PREFS);
    expect(player?.manpower).toBe(720);
  });

  it("control: the same spawn for an established (legacy) player does auto-settle the farmland", () => {
    const { runtime, seen } = spawnWorld(new Map([["veteran", buildPlayer("veteran", { points: 1_000, manpower: 720 })]]));
    expect(runtime.ensurePlayerHasSpawnTerritory("veteran")).toBe(true);
    expect(settlementStartedTileKeys(seen).length).toBeGreaterThan(0);
  });
});
