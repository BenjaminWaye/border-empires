import { describe, expect, it } from "vitest";
import { ATTACK_MANPOWER_COST, FRONTIER_CLAIM_COST, SETTLE_COST } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import {
  applySimulationEventsToRecoveredAccumulator,
  createRecoveredSimulationAccumulator,
  finalizeRecoveredSimulationAccumulator
} from "./event-recovery.js";
import { SimulationRuntime } from "./runtime.js";

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

describe("territory automation", () => {
  it("active forts automatically frontier-claim the surrounding 3x3 ring", () => {
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

    runtime.tickTerritoryAutomation(1_000);

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

  it("settled towns frontier-claim and auto-start settlement for valuable adjacent tiles", () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => {
        scheduled.push(task);
      },
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

    runtime.tickTerritoryAutomation(1_000);

    const stateAfterTick = runtime.exportState();
    expect(stateAfterTick.pendingSettlements).toHaveLength(3);
    expect(stateAfterTick.players.find((entry) => entry.id === "player-1")?.points).toBe(1_000 - FRONTIER_CLAIM_COST * 5 - SETTLE_COST * 3);
    expect(events.filter((event) => event.eventType === "SETTLEMENT_STARTED")).toHaveLength(3);
    const plainFrontier = stateAfterTick.tiles.filter(
      (tile) => tile.ownerId === "player-1" && tile.ownershipState === "FRONTIER" && !tile.resource && !tile.townJson && !tile.dockId
    );
    expect(plainFrontier).toHaveLength(2);

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
    expect(recoveredAfterTick.pendingSettlements).toHaveLength(3);
    expect(recoveredAfterTick.players?.find((entry) => entry.id === "player-1")?.points).toBe(
      1_000 - FRONTIER_CLAIM_COST * 5 - SETTLE_COST * 3
    );

    for (const task of scheduled) task();

    const settledTiles = runtime.exportState().tiles.filter(
      (tile) => tile.ownerId === "player-1" && tile.ownershipState === "SETTLED"
    );
    expect(settledTiles).toHaveLength(4);
  });

  it("drops recovered pending settlements when combat changes the frontier tile owner before completion", () => {
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

  it("does not auto-frontier more tiles than the player's gold can fund", () => {
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

    runtime.tickTerritoryAutomation(1_000);

    const claimed = runtime.exportState().tiles.filter(
      (tile) => tile.ownerId === "player-1" && tile.ownershipState === "FRONTIER"
    );
    expect(claimed).toHaveLength(2);
    expect(runtime.exportState().players.find((entry) => entry.id === "player-1")?.points).toBe(0);
  });

  it("active siege outposts automatically launch one adjacent attack per tick", () => {
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
            siegeOutpost: { ownerId: "player-1", status: "active" }
          },
          { x: 31, y: 30, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });

    runtime.tickTerritoryAutomation(1_000);
    expect(scheduled).toHaveLength(1);

    scheduled[0]?.();

    const captured = runtime.exportState().tiles.find((tile) => tile.x === 31 && tile.y === 30);
    expect(captured).toEqual(expect.objectContaining({ ownerId: "player-1", ownershipState: "FRONTIER" }));
  });

  it("lets each active siege outpost launch an adjacent attack when resources allow", () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => {
        scheduled.push(task);
      },
      initialPlayers: new Map([
        ["player-1", player("player-1", 1_000, ATTACK_MANPOWER_COST * 2)],
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
            x: 35,
            y: 35,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            siegeOutpost: { ownerId: "player-1", status: "active" }
          },
          { x: 31, y: 30, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 36, y: 35, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });

    runtime.tickTerritoryAutomation(1_000);
    expect(scheduled).toHaveLength(2);
  });

  it("does not schedule more siege attacks than current manpower can fund", () => {
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
            siegeOutpost: { ownerId: "player-1", status: "active" }
          },
          {
            x: 35,
            y: 35,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            siegeOutpost: { ownerId: "player-1", status: "active" }
          },
          { x: 31, y: 30, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 36, y: 35, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });

    runtime.tickTerritoryAutomation(1_000);
    expect(scheduled).toHaveLength(1);
  });
});
