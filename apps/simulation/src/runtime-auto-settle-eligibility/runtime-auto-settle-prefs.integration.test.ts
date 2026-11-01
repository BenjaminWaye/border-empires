import { describe, expect, it } from "vitest";
import { LANDING_MANPOWER_RESERVE, NEW_PLAYER_AUTO_SETTLE_PREFS, type AutoSettlePrefs, type Tile } from "@border-empires/shared";
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

const buildRuntime = (autoSettle: AutoSettlePrefs | undefined, extraTiles: Tile[] = []) => {
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000, manpowerUpdatedAt: 1_000, techIds: new Set(["masonry", "crystal-lattices"]), ...(autoSettle ? { autoSettle } : {}) })]
    ]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        // Reach anchor (TOWN tier), so the FRONTIER tiles below are in reach.
        { x: 40, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "TOWN" } },
        { x: 41, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "FARM" },
        { x: 40, y: 41, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", town: { name: "Neighbor", type: "MARKET", populationTier: "SETTLEMENT" } },
        ...extraTiles
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
    const { runtime, seen } = buildRuntime({ answered: true, towns: false, food: true, strategic: false, luxury: false });
    await runtime.tickTerritoryAutomation(1_000);
    expect(settlementStartedTileKeys(seen)).toEqual(["41,40"]);
  });

  it("strategic and luxury resources are gated separately", async () => {
    const resourceTiles: Tile[] = [
      { x: 39, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "TITANIUM" },
      { x: 40, y: 39, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "GEMS" },
      { x: 39, y: 39, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "LUXURY_BIOTA" }
    ];
    const strategicOnly = buildRuntime({ answered: true, towns: false, food: false, strategic: true, luxury: false }, resourceTiles);
    await strategicOnly.runtime.tickTerritoryAutomation(1_000);
    expect(settlementStartedTileKeys(strategicOnly.seen).sort()).toEqual(["39,40", "40,39"]);
    const luxuryOnly = buildRuntime({ answered: true, towns: false, food: false, strategic: false, luxury: true }, resourceTiles);
    await luxuryOnly.runtime.tickTerritoryAutomation(1_000);
    expect(settlementStartedTileKeys(luxuryOnly.seen)).toEqual(["39,39"]);
  });

  it("SET_AUTO_SETTLE_PREFS marks the prompt answered, persists, and immediately starts the newly-allowed settles", async () => {
    const { runtime, seen } = buildRuntime({ ...NEW_PLAYER_AUTO_SETTLE_PREFS });
    await runtime.tickTerritoryAutomation(1_000); // fills the held queue without spending
    setPrefs(runtime, { towns: false, food: true, strategic: false, luxury: false });
    await Promise.resolve();
    expect(seen).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "prefs-1" }));
    expect(settlementStartedTileKeys(seen)).toEqual(["41,40"]);
    expect(runtime.exportState().players.find((p) => p.id === "player-1")?.autoSettle).toEqual({
      answered: true,
      towns: false,
      food: true,
      strategic: false,
      luxury: false
    });
  });

  it("'Not now' (everything false) marks answered without settling anything", async () => {
    const { runtime, seen } = buildRuntime({ ...NEW_PLAYER_AUTO_SETTLE_PREFS });
    setPrefs(runtime, { towns: false, food: false, strategic: false, luxury: false });
    await runtime.tickTerritoryAutomation(1_000);
    expect(settlementStartedTileKeys(seen)).toEqual([]);
    expect(runtime.exportState().players.find((p) => p.id === "player-1")?.autoSettle?.answered).toBe(true);
  });

  it("applies a legacy single resources switch to both strategic and luxury", async () => {
    const { runtime, seen } = buildRuntime({ ...NEW_PLAYER_AUTO_SETTLE_PREFS });
    setPrefs(runtime, { towns: false, food: true, resources: true });
    await Promise.resolve();
    expect(seen).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "prefs-1" }));
    expect(runtime.exportState().players.find((p) => p.id === "player-1")?.autoSettle).toEqual({
      answered: true,
      towns: false,
      food: true,
      strategic: true,
      luxury: true
    });
  });

  it("rejects a payload with neither the split nor the legacy resources switch", async () => {
    const { runtime, seen } = buildRuntime({ ...NEW_PLAYER_AUTO_SETTLE_PREFS });
    setPrefs(runtime, { towns: false, food: true, strategic: true });
    await Promise.resolve();
    expect(seen).toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "prefs-1", code: "BAD_COMMAND" }));
  });

  it("rejects a malformed payload and leaves the stored prefs untouched", async () => {
    const { runtime, seen } = buildRuntime({ ...NEW_PLAYER_AUTO_SETTLE_PREFS });
    setPrefs(runtime, { towns: "yes" });
    await Promise.resolve();
    expect(seen).toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "prefs-1", code: "BAD_COMMAND" }));
    expect(runtime.exportState().players.find((p) => p.id === "player-1")?.autoSettle).toEqual(NEW_PLAYER_AUTO_SETTLE_PREFS);
  });
});

// 25 FRONTIER farms ahead of one FRONTIER town, all inside the TOWN_REACH_RADIUS (3) disk of a TOWN-tier anchor at 40,40.
const buildFarmFieldRuntime = (autoSettle: AutoSettlePrefs) => {
  const farms = Array.from({ length: 25 }, (_, i) => ({
    x: 37 + (i % 7),
    y: [37, 38, 39, 41][Math.floor(i / 7)]!,
    terrain: "LAND" as const,
    ownerId: "player-1",
    ownershipState: "FRONTIER" as const,
    resource: "FARM" as const
  }));
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000, manpowerUpdatedAt: 1_000, autoSettle })]]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        { x: 40, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "TOWN" } },
        ...farms,
        { x: 43, y: 43, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", town: { name: "Neighbor", type: "MARKET", populationTier: "SETTLEMENT" } }
      ],
      activeLocks: []
    }
  });
  return { runtime, seen: collectEvents(runtime) };
};

describe("auto-settle queue with a category switched off", () => {
  it("lots of farms with food off do not crowd a town out of the queue (regression)", async () => {
    const { runtime, seen } = buildFarmFieldRuntime({ answered: true, towns: true, food: false, strategic: false, luxury: false });
    await runtime.tickTerritoryAutomation(1_000);
    expect(settlementStartedTileKeys(seen)).toEqual(["43,43"]);
  });

  it("switching food off while every slot is busy frees the queue for the town (regression)", async () => {
    const { runtime } = buildFarmFieldRuntime({ answered: true, towns: true, food: true, strategic: false, luxury: false });
    await runtime.tickTerritoryAutomation(1_000); // 3 farms take every slot; 20 more fill the queue, the town is dropped
    const queued = () => runtime["autoSettlementQueueForPlayer"]("player-1").map(({ x, y }) => `${x},${y}`);
    expect(queued()).not.toContain("43,43");
    setPrefs(runtime, { towns: true, food: false, strategic: false, luxury: false });
    await Promise.resolve();
    expect(queued()).toEqual([]); // stale farms dropped even though no slot is free
    await runtime.tickTerritoryAutomation(31_000);
    expect(queued()).toEqual(["43,43"]);
  });

  it("switching food on afterwards starts garrisoning the farms captured while it was off", async () => {
    const { runtime, seen } = buildFarmFieldRuntime({ answered: true, towns: false, food: false, strategic: false, luxury: false });
    await runtime.tickTerritoryAutomation(1_000);
    expect(settlementStartedTileKeys(seen)).toEqual([]);
    setPrefs(runtime, { towns: false, food: true, strategic: false, luxury: false });
    await Promise.resolve();
    const started = settlementStartedTileKeys(seen);
    expect(started.length).toBeGreaterThan(0);
    expect(started.every((key) => key !== "43,43")).toBe(true);
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
    // Full starting manpower plus the one-time landing reserve, nothing spent.
    expect(player?.manpower).toBe(720 + LANDING_MANPOWER_RESERVE);
  });

  it("control: the same spawn for an established (legacy) player does auto-settle the farmland", () => {
    const { runtime, seen } = spawnWorld(new Map([["veteran", buildPlayer("veteran", { points: 1_000, manpower: 720 })]]));
    expect(runtime.ensurePlayerHasSpawnTerritory("veteran")).toBe(true);
    expect(settlementStartedTileKeys(seen).length).toBeGreaterThan(0);
  });
});
