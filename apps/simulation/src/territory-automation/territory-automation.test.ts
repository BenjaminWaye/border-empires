import { describe, expect, it, vi } from "vitest";
import { ATTACK_MANPOWER_COST, FRONTIER_CLAIM_COST, SETTLE_COST } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import {
  applySimulationEventsToRecoveredAccumulator,
  createRecoveredSimulationAccumulator,
  finalizeRecoveredSimulationAccumulator
} from "../event-recovery/event-recovery.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import { chooseSweepExpansionStep, FRONTIER_DECAY_MS } from "./territory-automation.js";

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
  it("active forts automatically frontier-claim nearby neutral land", async () => {
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
          { x: 9, y: 9, terrain: "LAND" },
          { x: 10, y: 9, terrain: "LAND" },
          { x: 11, y: 9, terrain: "LAND" },
          { x: 9, y: 10, terrain: "LAND" },
          { x: 11, y: 10, terrain: "LAND" },
          { x: 9, y: 11, terrain: "LAND" },
          { x: 10, y: 11, terrain: "LAND" },
          { x: 11, y: 11, terrain: "LAND" }
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
    expect(claimed).toHaveLength(8);
    expect(runtime.exportState().players.find((entry) => entry.id === "player-1")?.points).toBe(1_000 - FRONTIER_CLAIM_COST * 8);
    const tileDeltaBatches = events.filter((event) => event.eventType === "TILE_DELTA_BATCH");
    const playerUpdates = events.filter((event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE");
    expect(tileDeltaBatches).toHaveLength(1);
    expect(tileDeltaBatches[0]).toMatchObject({ goldCost: FRONTIER_CLAIM_COST * 8 });
    expect(playerUpdates).toHaveLength(1);

    const accumulator = createRecoveredSimulationAccumulator({
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          fort: { ownerId: "player-1", status: "active" }
        },
        { x: 9, y: 9, terrain: "LAND" },
        { x: 10, y: 9, terrain: "LAND" },
        { x: 11, y: 9, terrain: "LAND" },
        { x: 9, y: 10, terrain: "LAND" },
        { x: 11, y: 10, terrain: "LAND" },
        { x: 9, y: 11, terrain: "LAND" },
        { x: 10, y: 11, terrain: "LAND" },
        { x: 11, y: 11, terrain: "LAND" }
      ],
      activeLocks: [],
      players: [{ id: "player-1", points: 1_000 }]
    });
    applySimulationEventsToRecoveredAccumulator(accumulator, events);
    expect(finalizeRecoveredSimulationAccumulator(accumulator).players?.find((entry) => entry.id === "player-1")?.points).toBe(
      1_000 - FRONTIER_CLAIM_COST * 8
    );
  });

  it("scales fort auto-frontier radius by fortification tier", async () => {
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
            economicStructure: { ownerId: "player-1", type: "WOODEN_FORT", status: "active" }
          },
          { x: 21, y: 20, terrain: "LAND" },
          { x: 22, y: 20, terrain: "LAND" },
          {
            x: 30,
            y: 30,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "active" }
          },
          { x: 32, y: 30, terrain: "LAND" },
          {
            x: 40,
            y: 40,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "active", variant: "IRON_BASTION" }
          },
          { x: 43, y: 40, terrain: "LAND" },
          {
            x: 50,
            y: 50,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "active", variant: "THUNDER_BASTION" }
          },
          { x: 54, y: 50, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });

    await runtime.tickTerritoryAutomation(1_000);

    const byKey = new Map(runtime.exportState().tiles.map((tile) => [`${tile.x},${tile.y}`, tile] as const));
    expect(byKey.get("21,20")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    expect(byKey.get("22,20")?.ownerId).toBeUndefined();
    expect(byKey.get("32,30")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    expect(byKey.get("43,40")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    expect(byKey.get("54,50")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
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
            fort: { ownerId: "player-1", status: "active" }
          },
          { x: 9, y: 9, terrain: "LAND" },
          { x: 10, y: 9, terrain: "LAND" },
          { x: 11, y: 9, terrain: "LAND" }
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

  it("starts a 10 minute decay timer on unsupported frontier tiles", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", player("player-1", 1_000)]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [{ x: 50, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }],
        activeLocks: []
      }
    });
    const events: SimulationEvent[] = [];
    runtime.onEvent((event) => events.push(event));

    await runtime.tickTerritoryAutomation(1_000);

    const frontier = runtime.exportState().tiles.find((tile) => tile.x === 50 && tile.y === 50);
    expect(frontier).toMatchObject({
      ownerId: "player-1",
      ownershipState: "FRONTIER",
      frontierDecayAt: 1_000 + FRONTIER_DECAY_MS
    });
    const decayDelta = events
      .filter((event) => event.eventType === "TILE_DELTA_BATCH")
      .flatMap((event) => event.tileDeltas)
      .find((tile) => tile.x === 50 && tile.y === 50);
    expect(decayDelta?.frontierDecayAt).toBe(1_000 + FRONTIER_DECAY_MS);
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
    expect(byKey.get("52,50")?.frontierDecayAt).toBeUndefined();
    expect(byKey.get("53,50")?.frontierDecayAt).toBeUndefined();
  });

  it("clears an existing frontier decay timer while the tile is settlement queued", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", player("player-1", 1_000)]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 54,
            y: 52,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER",
            resource: "IRON",
            frontierDecayAt: 61_000
          }
        ],
        activeLocks: []
      }
    });

    await runtime.tickTerritoryAutomation(1_000);

    expect(runtime.exportState().tiles.find((tile) => tile.x === 54 && tile.y === 52)?.frontierDecayAt).toBeUndefined();
  });

  it("removes unsupported frontier ownership when its decay timer expires", async () => {
    const decayAt = 1_000 + FRONTIER_DECAY_MS;
    const runtime = new SimulationRuntime({
      now: () => decayAt,
      initialPlayers: new Map([["player-1", player("player-1", 1_000)]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 51,
            y: 50,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER",
            frontierDecayAt: decayAt,
            siegeOutpost: { ownerId: "player-1", status: "active" }
          }
        ],
        activeLocks: []
      }
    });
    const events: SimulationEvent[] = [];
    runtime.onEvent((event) => events.push(event));

    await runtime.tickTerritoryAutomation(decayAt);

    const expired = runtime.exportState().tiles.find((tile) => tile.x === 51 && tile.y === 50);
    expect(expired).toMatchObject({ x: 51, y: 50, terrain: "LAND" });
    expect(expired?.ownerId).toBeUndefined();
    expect(expired?.ownershipState).toBeUndefined();
    expect(expired?.frontierDecayAt).toBeUndefined();
    expect(expired?.siegeOutpostJson).toBeUndefined();
    const decayDelta = events
      .filter((event) => event.eventType === "TILE_DELTA_BATCH")
      .flatMap((event) => event.tileDeltas)
      .find((tile) => tile.x === 51 && tile.y === 50);
    expect(decayDelta).toMatchObject({
      x: 51,
      y: 50,
      ownerId: undefined,
      ownershipState: undefined,
      frontierDecayAt: undefined,
      siegeOutpostJson: undefined
    });
  });

  it("clears frontier decay when an active owned fort supports the tile", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", player("player-1", 1_000)]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 60,
            y: 60,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER",
            frontierDecayAt: 61_000
          },
          {
            x: 61,
            y: 60,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "active" }
          }
        ],
        activeLocks: []
      }
    });

    await runtime.tickTerritoryAutomation(1_000);

    const supported = runtime.exportState().tiles.find((tile) => tile.x === 60 && tile.y === 60);
    expect(supported).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    expect(supported?.frontierDecayAt).toBeUndefined();
  });

  it("clears frontier decay when the frontier tile is itself an active fort", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", player("player-1", 1_000)]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 64,
            y: 64,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER",
            frontierDecayAt: 61_000,
            fort: { ownerId: "player-1", status: "active" }
          }
        ],
        activeLocks: []
      }
    });

    await runtime.tickTerritoryAutomation(1_000);

    const supported = runtime.exportState().tiles.find((tile) => tile.x === 64 && tile.y === 64);
    expect(supported).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    expect(supported?.frontierDecayAt).toBeUndefined();
  });

  it("active forts automatically attack adjacent enemy frontier tiles", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => {
        scheduled.push(task);
      },
      initialPlayers: new Map([
        ["player-1", player("player-1", 1_000, ATTACK_MANPOWER_COST)],
        ["player-2", player("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 30,
            y: 30,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "active" }
          },
          { x: 31, y: 30, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });

    await runtime.tickTerritoryAutomation(1_000);

    expect(scheduled).toHaveLength(1);
  });

  it("fort patrol gives newly claimed staging frontier 20 seconds before attacking it", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => {
        scheduled.push(task);
      },
      initialPlayers: new Map([
        ["player-1", player("player-1", 1_000, ATTACK_MANPOWER_COST)],
        ["player-2", player("player-2", 1_000, ATTACK_MANPOWER_COST)]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 30,
            y: 30,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "active" }
          },
          { x: 31, y: 30, terrain: "LAND" },
          {
            x: 32,
            y: 30,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-2", status: "active" }
          }
        ],
        activeLocks: []
      }
    });

    await runtime.tickTerritoryAutomation(1_000);
    expect(runtime.exportState().tiles.find((tile) => tile.x === 31 && tile.y === 30)).toMatchObject({
      ownerId: "player-1",
      ownershipState: "FRONTIER"
    });
    expect(scheduled).toHaveLength(0);

    await runtime.tickTerritoryAutomation(21_001);
    expect(scheduled).toHaveLength(1);
  });

  it("extends fort patrol grace after launching an attack on an enemy fort from frontier", async () => {
    let now = 1_000;
    const scheduled: Array<() => void> = [];
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    try {
      const runtime = new SimulationRuntime({
        now: () => now,
        scheduleAfter: (_delayMs, task) => {
          scheduled.push(task);
        },
        initialPlayers: new Map([
          ["player-1", player("player-1", 1_000, 1_000)],
          ["player-2", player("player-2", 1_000, 1_000)]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            {
              x: 30,
              y: 30,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              fort: { ownerId: "player-2", status: "active" }
            },
            {
              x: 31,
              y: 30,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER"
            },
            {
              x: 80,
              y: 80,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { type: "FARMING", populationTier: "TOWN" }
            }
          ],
          activeLocks: []
        }
      });
      const events: SimulationEvent[] = [];
      runtime.onEvent((event) => events.push(event));

      runtime.submitCommand({
        commandId: "attack-fort-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: now,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 31, fromY: 30, toX: 30, toY: 30 })
      });
      await Promise.resolve();

      const accepted = events.find(
        (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> => event.eventType === "COMMAND_ACCEPTED"
      );
      expect(accepted).toBeDefined();
      expect(scheduled).toHaveLength(1);
      const graceState = runtime as unknown as { fortPatrolGraceUntilByTile: Map<string, number> };
      expect(graceState.fortPatrolGraceUntilByTile.get("31,30")).toBe(accepted!.resolvesAt + 20_000);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("fort auto attacks skip enemy settled and fortified frontier tiles", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => {
        scheduled.push(task);
      },
      initialPlayers: new Map([
        ["player-1", player("player-1", 1_000, ATTACK_MANPOWER_COST * 3)],
        ["player-2", player("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 40,
            y: 40,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "active" }
          },
          { x: 41, y: 40, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          {
            x: 40,
            y: 41,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "FRONTIER",
            fort: { ownerId: "player-2", status: "active" }
          },
          {
            x: 39,
            y: 40,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "FRONTIER",
            economicStructure: { ownerId: "player-2", type: "WOODEN_FORT", status: "active" }
          }
        ],
        activeLocks: []
      }
    });

    await runtime.tickTerritoryAutomation(1_000);

    expect(scheduled).toHaveLength(0);
  });

  it("fort auto attacks enemy frontier with an unfinished wooden fort", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => {
        scheduled.push(task);
      },
      initialPlayers: new Map([
        ["player-1", player("player-1", 1_000, ATTACK_MANPOWER_COST)],
        ["player-2", player("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 42,
            y: 42,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "active" }
          },
          {
            x: 43,
            y: 42,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "FRONTIER",
            economicStructure: { ownerId: "player-2", type: "WOODEN_FORT", status: "under_construction", completesAt: 61_000 }
          }
        ],
        activeLocks: []
      }
    });

    scheduled.length = 0;
    await runtime.tickTerritoryAutomation(1_000);

    expect(scheduled).toHaveLength(1);
  });

  it("requires fort-scaled manpower before auto attacking a fortified tile", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => {
        scheduled.push(task);
      },
      initialPlayers: new Map([
        ["player-1", player("player-1", 1_000, ATTACK_MANPOWER_COST * 2 - 1)],
        ["player-2", player("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 30,
            y: 30,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            siegeOutpost: { ownerId: "player-1", status: "active" }
          },
          {
            x: 31,
            y: 30,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "FRONTIER",
            fort: { ownerId: "player-2", status: "active" }
          }
        ],
        activeLocks: []
      }
    });

    await runtime.tickTerritoryAutomation(1_000);
    expect(scheduled).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// chooseSweepExpansionStep unit tests
// ---------------------------------------------------------------------------

type TileSpec = {
  x: number;
  y: number;
  terrain?: "LAND" | "SEA";
  ownerId?: string;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
  frontierDecayKind?: "ENCIRCLEMENT" | "NATURAL";
};

const mkTileMap = (specs: TileSpec[]) => {
  const map = new Map<string, TileSpec & { terrain: "LAND" | "SEA" }>();
  for (const spec of specs) {
    map.set(`${spec.x},${spec.y}`, { terrain: "LAND", ...spec });
  }
  return (x: number, y: number) => map.get(`${x},${y}`) as (TileSpec & { terrain: "LAND" | "SEA" }) | undefined;
};

describe("chooseSweepExpansionStep", () => {
  it("returns undefined when no owned tiles exist in radius", async () => {
    const getTile = mkTileMap([
      { x: 15, y: 15, terrain: "LAND" } // neutral, no owner
    ]);
    const result = chooseSweepExpansionStep({ x: 10, y: 10 }, { x: 15, y: 15 }, "player-1", 5, getTile);
    expect(result).toBeUndefined();
  });

  it("returns undefined when owned tiles have no neutral land neighbours", async () => {
    // Owned tile at (11,10) but all neighbours are enemy-owned or sea
    const getTile = mkTileMap([
      { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 12, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
      { x: 10, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
      { x: 11, y: 11, terrain: "SEA" },
      { x: 11, y: 9,  terrain: "SEA" },
      { x: 12, y: 11, terrain: "SEA" },
      { x: 10, y: 11, terrain: "SEA" },
      { x: 12, y: 9,  terrain: "SEA" },
      { x: 10, y: 9,  terrain: "SEA" },
    ]);
    const result = chooseSweepExpansionStep({ x: 10, y: 10 }, { x: 20, y: 20 }, "player-1", 5, getTile);
    expect(result).toBeUndefined();
  });

  it("picks the neutral neighbour closest to the target", async () => {
    // Outpost at (10,10). Owned tile at (11,10).
    // Two neutral neighbours of (11,10): (12,10) and (11,11).
    // Target at (20,20). (12,10) is closer to (20,20) in Chebyshev than (11,11).
    // chebyshev(12,10, 20,20) = max(8,10) = 10
    // chebyshev(11,11, 20,20) = max(9,9) = 9  <- closer
    const getTile = mkTileMap([
      { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 12, y: 10, terrain: "LAND" }, // neutral, dist 10 to (20,20)
      { x: 11, y: 11, terrain: "LAND" }, // neutral, dist 9 to (20,20)
    ]);
    const result = chooseSweepExpansionStep({ x: 10, y: 10 }, { x: 20, y: 20 }, "player-1", 5, getTile);
    expect(result).toBeDefined();
    expect(result!.to).toEqual({ x: 11, y: 11 });
    expect(result!.origin).toEqual({ x: 11, y: 10 });
  });

  it("tie-breaks by lower x then lower y when distances are equal", async () => {
    // Owned at (10,10). Two neutral neighbours equidistant from target (30,30).
    // chebyshev(11,10, 30,30) = max(19,20) = 20
    // chebyshev(10,11, 30,30) = max(20,19) = 20   <- same distance, higher x
    // (11,10) has lower x, should be picked first
    const getTile = mkTileMap([
      { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 11, y: 10, terrain: "LAND" }, // neutral, x=11
      { x: 10, y: 11, terrain: "LAND" }, // neutral, x=10 (lower x)
    ]);
    const result = chooseSweepExpansionStep({ x: 10, y: 10 }, { x: 30, y: 30 }, "player-1", 3, getTile);
    expect(result).toBeDefined();
    // Lower x tie-break: (10,11) has x=10, (11,10) has x=11 → pick (10,11)
    expect(result!.to).toEqual({ x: 10, y: 11 });
  });

  it("skips encirclement-blocked owned tiles as origins", async () => {
    // Encircled tile at (11,10) has a neutral neighbour at (12,10).
    // Healthy tile at (11,11) has a neutral neighbour at (12,11).
    // Only (12,11) should be reachable since (11,10) is encircled.
    const getTile = mkTileMap([
      { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", frontierDecayKind: "ENCIRCLEMENT" },
      { x: 12, y: 10, terrain: "LAND" }, // neutral neighbour of encircled tile — should be skipped
      { x: 11, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
      { x: 12, y: 11, terrain: "LAND" }, // neutral neighbour of healthy tile
    ]);
    const result = chooseSweepExpansionStep({ x: 10, y: 10 }, { x: 20, y: 20 }, "player-1", 5, getTile);
    expect(result).toBeDefined();
    expect(result!.origin).toEqual({ x: 11, y: 11 });
    expect(result!.to).toEqual({ x: 12, y: 11 });
  });
});
