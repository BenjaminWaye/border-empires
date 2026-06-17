import { describe, expect, it } from "vitest";
import { FRONTIER_CLAIM_COST, SETTLE_COST } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import {
  applySimulationEventsToRecoveredAccumulator,
  createRecoveredSimulationAccumulator,
  finalizeRecoveredSimulationAccumulator
} from "../event-recovery/event-recovery.js";
import { SimulationRuntime } from "../runtime/runtime.js";

const player = (id: string, points = 1_000, manpower = 1_000) => ({
  id,
  isAi: false,
  points,
  manpower,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const latestAutoSettlementQueue = (events: SimulationEvent[], playerId: string): string[] => {
  const updates = events.filter(
    (event) => event.eventType === "PLAYER_MESSAGE" && event.playerId === playerId && event.messageType === "PLAYER_UPDATE"
  );
  const latest = updates.at(-1);
  const payload =
    latest && latest.eventType === "PLAYER_MESSAGE"
      ? (JSON.parse(latest.payloadJson) as { autoSettlementQueue?: Array<{ x: number; y: number }> })
      : {};
  return (payload.autoSettlementQueue ?? []).map((tile) => `${tile.x},${tile.y}`);
};

describe("territory automation", () => {
  it("forts do NOT auto-claim nearby neutral land (only towns do)", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", player("player-1")]]),
      seedTiles: new Map(),
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
          { x: 9, y: 10, terrain: "LAND" },
          { x: 11, y: 10, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });
    const events: SimulationEvent[] = [];
    runtime.onEvent((event) => events.push(event));

    await runtime.tickTerritoryAutomation(1_000);

    const claimed = runtime.exportState().tiles.filter(
      (tile) => tile.ownerId === "player-1" && tile.ownershipState === "FRONTIER"
    );
    expect(claimed).toHaveLength(0);
    expect(events.filter((event) => event.eventType === "TILE_DELTA_BATCH")).toHaveLength(0);
  });

  it("settlement-tier towns do not frontier-claim or advertise adjacent tiles for the cancellable settle queue", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", player("player-1", 1_000)]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 20,
            y: 20,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "SETTLEMENT" }
          },
          { x: 19, y: 19, terrain: "LAND", resource: "FARM" },
          { x: 20, y: 19, terrain: "LAND", town: { type: "MARKET", populationTier: "TOWN" } },
          { x: 21, y: 19, terrain: "LAND", dockId: "dock-1" },
          { x: 19, y: 20, terrain: "LAND" },
          { x: 21, y: 20, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });
    const events: SimulationEvent[] = [];
    runtime.onEvent((event) => events.push(event));

    await runtime.tickTerritoryAutomation(1_000);

    const stateAfterTick = runtime.exportState();
    expect(stateAfterTick.pendingSettlements).toHaveLength(0);
    expect(stateAfterTick.players.find((entry) => entry.id === "player-1")?.points).toBe(1_000);
    expect(events.filter((event) => event.eventType === "SETTLEMENT_STARTED")).toHaveLength(0);
    expect(latestAutoSettlementQueue(events, "player-1")).toEqual([]);
    const plainFrontier = stateAfterTick.tiles.filter(
      (tile) => tile.ownerId === "player-1" && tile.ownershipState === "FRONTIER" && !tile.resource && !tile.townJson && !tile.dockId
    );
    expect(plainFrontier).toHaveLength(0);

    const accumulator = createRecoveredSimulationAccumulator({
      tiles: [
        {
          x: 20,
          y: 20,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          town: { type: "FARMING", populationTier: "SETTLEMENT" }
        },
        { x: 19, y: 19, terrain: "LAND", resource: "FARM" },
        { x: 20, y: 19, terrain: "LAND", town: { type: "MARKET", populationTier: "TOWN" } },
        { x: 21, y: 19, terrain: "LAND", dockId: "dock-1" },
        { x: 19, y: 20, terrain: "LAND" },
        { x: 21, y: 20, terrain: "LAND" }
      ],
      activeLocks: [],
      players: [{ id: "player-1", points: 1_000 }]
    });
    applySimulationEventsToRecoveredAccumulator(accumulator, events);
    const recoveredAfterTick = finalizeRecoveredSimulationAccumulator(accumulator);
    expect(recoveredAfterTick.pendingSettlements).toHaveLength(0);
    expect(recoveredAfterTick.players?.find((entry) => entry.id === "player-1")?.points).toBe(1_000);
  });

  it("advertises owned frontier support tiles adjacent to settled towns for the cancellable settle queue", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", player("player-1", 1_000)]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 40,
            y: 40,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "TOWN" }
          },
          { x: 39, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 41, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 70, y: 70, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const events: SimulationEvent[] = [];
    runtime.onEvent((event) => events.push(event));

    await runtime.tickTerritoryAutomation(1_000);

    const stateAfterTick = runtime.exportState();
    expect(stateAfterTick.pendingSettlements).toEqual([]);
    expect(stateAfterTick.players.find((entry) => entry.id === "player-1")?.points).toBe(1_000);
    expect(events.filter((event) => event.eventType === "SETTLEMENT_STARTED")).toHaveLength(0);
    expect(latestAutoSettlementQueue(events, "player-1")).toEqual(["39,40", "41,40"]);

    const remotePlainFrontier = runtime.exportState().tiles.find((tile) => tile.x === 70 && tile.y === 70);
    expect(remotePlainFrontier).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
  });

  it("advertises all owned high-value frontier tiles without requiring a nearby town or fort", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", player("player-1", 1_000)]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 30, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "IRON" },
          { x: 45, y: 45, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", town: { type: "MARKET", populationTier: "TOWN" } },
          { x: 60, y: 60, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", dockId: "dock-1" },
          { x: 75, y: 75, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const events: SimulationEvent[] = [];
    runtime.onEvent((event) => events.push(event));

    await runtime.tickTerritoryAutomation(1_000);

    const stateAfterTick = runtime.exportState();
    expect(stateAfterTick.pendingSettlements).toHaveLength(0);
    expect(stateAfterTick.players.find((entry) => entry.id === "player-1")?.points).toBe(1_000);
    expect(events.filter((event) => event.eventType === "SETTLEMENT_STARTED")).toHaveLength(0);
    expect(latestAutoSettlementQueue(events, "player-1")).toEqual(["30,30", "45,45", "60,60"]);
    const plainFrontier = runtime.exportState().tiles.find((tile) => tile.x === 75 && tile.y === 75);
    expect(plainFrontier).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
  });

  it("uses territory expansion order for the advertised auto-settlement queue", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", player("player-1", 1_000)]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 80,
            y: 80,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "TOWN" }
          },
          { x: 79, y: 80, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 80, y: 79, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 81, y: 80, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 30, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "IRON" },
          { x: 45, y: 45, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", town: { type: "MARKET", populationTier: "TOWN" } },
          { x: 60, y: 60, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", dockId: "dock-1" }
        ],
        activeLocks: []
      }
    });
    const events: SimulationEvent[] = [];
    runtime.onEvent((event) => events.push(event));

    await runtime.tickTerritoryAutomation(1_000);

    const stateAfterTick = runtime.exportState();
    expect(stateAfterTick.pendingSettlements).toEqual([]);
    expect(stateAfterTick.players.find((entry) => entry.id === "player-1")?.points).toBe(1_000);
    expect(latestAutoSettlementQueue(events, "player-1")).toEqual(["79,80", "80,79", "81,80", "30,30", "45,45", "60,60"]);
  });

  it("drops recovered pending settlements when combat changes the frontier tile owner before completion", async () => {
    const accumulator = createRecoveredSimulationAccumulator({
      tiles: [{ x: 40, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }],
      activeLocks: [],
      players: [{ id: "player-1", points: 100 }, { id: "player-2", points: 100 }]
    });

    applySimulationEventsToRecoveredAccumulator(accumulator, [
      {
        eventType: "SETTLEMENT_STARTED",
        commandId: "settle-1",
        playerId: "player-1",
        tileKey: "40,40",
        startedAt: 1_000,
        resolvesAt: 61_000,
        goldCost: SETTLE_COST
      },
      {
        eventType: "COMBAT_RESOLVED",
        commandId: "capture-1",
        playerId: "player-2",
        actionType: "ATTACK",
        originX: 40,
        originY: 41,
        targetX: 40,
        targetY: 40,
        attackerWon: true
      }
    ]);

    const recovered = finalizeRecoveredSimulationAccumulator(accumulator);
    expect(recovered.pendingSettlements).toEqual([]);
    expect(recovered.players?.find((entry) => entry.id === "player-1")?.points).toBe(100 - SETTLE_COST);
  });

  it("does not auto-frontier more tiles than the player's gold can fund", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", player("player-1", FRONTIER_CLAIM_COST * 2)]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "TOWN" }
          },
          { x: 9, y: 10, terrain: "LAND" },
          { x: 11, y: 10, terrain: "LAND" },
          { x: 10, y: 9, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });

    await runtime.tickTerritoryAutomation(1_000);

    const claimed = runtime.exportState().tiles.filter(
      (tile) => tile.ownerId === "player-1" && tile.ownershipState === "FRONTIER"
    );
    expect(claimed).toHaveLength(2);
    expect(runtime.exportState().players.find((entry) => entry.id === "player-1")?.points).toBe(0);
  });

  it("does not decay frontier while it is queued or pending for settlement", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", player("player-1", 1_000)]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 52, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "IRON" },
          { x: 53, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: [],
        pendingSettlements: [{ ownerId: "player-1", tileKey: "53,50", startedAt: 1_000, resolvesAt: 61_000, goldCost: SETTLE_COST }]
      }
    });

    await runtime.tickTerritoryAutomation(1_000);

    const byKey = new Map(runtime.exportState().tiles.map((tile) => [`${tile.x},${tile.y}`, tile] as const));
    expect(byKey.get("52,50")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    expect(byKey.get("53,50")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
  });

});

