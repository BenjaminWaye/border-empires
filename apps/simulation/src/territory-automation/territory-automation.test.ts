import { describe, expect, it } from "vitest";
import { FRONTIER_CLAIM_COST, SETTLE_COST } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import {
  applySimulationEventsToRecoveredAccumulator,
  createRecoveredSimulationAccumulator,
  finalizeRecoveredSimulationAccumulator
} from "../event-recovery/event-recovery.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import { orderedAutoSettlementTileKeys } from "./territory-automation.js";
import type { DomainTileState } from "@border-empires/game-domain";

const player = (id: string, points = 1_000, manpower = 1_000) => ({
  id,
  isAi: false,
  points,
  manpower,
  // masonry reveals TITANIUM tiles -- several tests here place a TITANIUM
  // resource tile and expect it to be auto-settle eligible once within fog-
  // of-war vision; without the tech those tiles would also fail the (newer)
  // tech-reveal gate, which is not what those tests are exercising.
  techIds: new Set<string>(["masonry"]),
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
          { x: 30, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "TITANIUM" },
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

  it("excludes an owned frontier resource tile that has not been revealed to the player", () => {
    const tiles = new Map<string, DomainTileState>([
      [
        "30,30",
        { x: 30, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "TITANIUM" }
      ],
      [
        "31,31",
        { x: 31, y: 31, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "TITANIUM" }
      ]
    ]);
    const revealed = new Set(["31,31"]);

    const result = orderedAutoSettlementTileKeys("player-1", ["30,30", "31,31"], {
      getTile: (tileKey) => tiles.get(tileKey),
      isBlocked: () => false,
      hasTownSupport: () => false,
      isRevealedToPlayer: (tile) => revealed.has(`${tile.x},${tile.y}`)
    });

    // Only the revealed tile is eligible — the unrevealed resource tile must
    // never be auto-settled, regardless of how valuable it is.
    expect(result).toEqual(["31,31"]);
  });

  it("does not require reveal for owned frontier town/dock tiles", () => {
    const tiles = new Map<string, DomainTileState>([
      [
        "30,30",
        {
          x: 30,
          y: 30,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "FRONTIER",
          town: { type: "MARKET", populationTier: "TOWN" }
        }
      ],
      ["31,31", { x: 31, y: 31, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", dockId: "dock-1" }]
    ]);

    const result = orderedAutoSettlementTileKeys("player-1", ["30,30", "31,31"], {
      getTile: (tileKey) => tiles.get(tileKey),
      isBlocked: () => false,
      hasTownSupport: () => false,
      isRevealedToPlayer: () => false
    });

    // A player's own towns and docks are never hidden from them, so they
    // remain eligible even when isRevealedToPlayer reports false.
    expect(result).toEqual(["30,30", "31,31"]);
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
          { x: 30, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "TITANIUM" },
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
    expect(claimed).toHaveLength(3);
  });

  it("excludes an owned, visible frontier resource tile whose resource tech has not been researched", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", { ...player("player-1", 1_000), techIds: new Set<string>() }]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 30, y: 30, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "TITANIUM" },
          { x: 45, y: 45, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", town: { type: "MARKET", populationTier: "TOWN" } }
        ],
        activeLocks: []
      }
    });
    const events: SimulationEvent[] = [];
    runtime.onEvent((event) => events.push(event));

    await runtime.tickTerritoryAutomation(1_000);

    // The TITANIUM tile is within fog-of-war vision (it's owned frontier
    // territory) but the player has not researched masonry, so it must not
    // be auto-settled -- only the town tile (unaffected by tech-reveal) is.
    expect(latestAutoSettlementQueue(events, "player-1")).toEqual(["45,45"]);
  });

  it("does not decay frontier while it is queued or pending for settlement", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", player("player-1", 1_000)]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 52, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "TITANIUM" },
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

