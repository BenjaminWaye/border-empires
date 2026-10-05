import { afterEach, describe, expect, it, vi } from "vitest";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

const START = 1_000;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// The launch tile is a town: without a reach anchor it reads as cut off from supply (ORIGIN_CUT_OFF).
const attackerTiles = [
  { x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, town: { name: "Home", type: "FARMING" as const, populationTier: "SETTLEMENT" as const }, muster: { ownerId: "player-1", amount: 999, mode: "HOLD" as const, updatedAt: 0 } }
];

type SeenStructure = { status: string; completesAt?: number; pausedAt?: number };

// The most recent wire delta for (10, 11): what a subscribed client would be showing for its structure.
const latestStructureDelta = (seen: SimulationEvent[]): { present: boolean; structure?: SeenStructure; ownerId?: string } => {
  let latest: { present: boolean; structure?: SeenStructure; ownerId?: string } = { present: false };
  for (const event of seen) {
    if (event.eventType !== "TILE_DELTA_BATCH") continue;
    for (const delta of event.tileDeltas) {
      if (delta.x !== 10 || delta.y !== 11) continue;
      latest = {
        present: true,
        ...(delta.economicStructureJson ? { structure: JSON.parse(delta.economicStructureJson) as SeenStructure } : {}),
        ...(delta.ownerId ? { ownerId: delta.ownerId } : {})
      };
    }
  }
  return latest;
};

const defenderTown = { x: 10, y: 12, terrain: "LAND" as const, ownerId: "player-2", ownershipState: "SETTLED" as const, town: { name: "Home", type: "FARMING" as const, populationTier: "SETTLEMENT" as const } };

const command = (commandId: string, playerId: string, type: "ATTACK" | "SETTLE" | "BUILD_STRUCTURE", payload: object, clientSeq: number) => ({
  commandId,
  sessionId: `session-${playerId}`,
  playerId,
  clientSeq,
  issuedAt: START,
  type,
  payloadJson: JSON.stringify(payload)
});

describe("development hold while a tile is under attack", () => {
  it("cancels a pending SETTLE on the attacked tile and refunds it, and refuses a new SETTLE until the fight ends", async () => {
    vi.useFakeTimers();
    let nowMs = START;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 1_000 })],
        ["player-2", buildPlayer("player-2", { points: 500, manpower: 1_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          ...attackerTiles,
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          defenderTown
        ],
        activeLocks: [],
        // Seeded rather than started with SETTLE: the attacker's adjacent town now contests the defender's reach.
        pendingSettlements: [{ ownerId: "player-2", tileKey: "10,11", startedAt: START, resolvesAt: START + 600_000, goldCost: 25, commandId: "settle-1" }]
      }
    });
    const defenderBefore = runtime.exportState().players.find((p) => p.id === "player-2");
    expect(runtime.exportState().pendingSettlements).toHaveLength(1);

    runtime.submitCommand(command("attack-1", "player-1", "ATTACK", { fromX: 10, fromY: 10, toX: 10, toY: 11 }, 1));
    await Promise.resolve();

    const afterAttack = runtime.exportState();
    expect(afterAttack.activeLocks.some((lock) => lock.commandId === "attack-1")).toBe(true);
    expect(afterAttack.pendingSettlements).toHaveLength(0);
    // goldCost (25) is refunded on cancel.
    expect(afterAttack.players.find((p) => p.id === "player-2")?.points).toBe((defenderBefore?.points ?? 0) + 25);

    const seen = collectEvents(runtime);
    runtime.submitCommand(command("settle-2", "player-2", "SETTLE", { x: 10, y: 11 }, 2));
    await Promise.resolve();
    expect(seen.some((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "settle-2" && event.message === "tile is under attack")).toBe(true);
    expect(runtime.exportState().pendingSettlements).toHaveLength(0);
  });

  it("pauses an under-construction build while attacked, then resumes with the remaining time once the defender holds", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let nowMs = START;
    const originalCompletesAt = START + COMBAT_LOCK_MS + 10_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 1_000 })],
        ["player-2", buildPlayer("player-2", { isAi: true, manpower: 1_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          ...attackerTiles,
          {
            x: 10,
            y: 11,
            terrain: "LAND",
            ownerId: "player-2",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-2", type: "FARMSTEAD", status: "under_construction", completesAt: originalCompletesAt }
          },
          defenderTown
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);
    const structureOnTile = () => latestStructureDelta(seen).structure;

    runtime.submitCommand(command("attack-1", "player-1", "ATTACK", { fromX: 10, fromY: 10, toX: 10, toY: 11 }, 1));
    await Promise.resolve();
    expect(structureOnTile()).toMatchObject({ status: "under_construction", pausedAt: START, completesAt: originalCompletesAt });

    // The fight resolves; the attacker loses (Math.random = 0.99), so the defender keeps the tile.
    nowMs = START + COMBAT_LOCK_MS;
    vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
    const resumed = structureOnTile();
    expect(resumed?.status).toBe("under_construction");
    expect(resumed?.pausedAt).toBeUndefined();
    expect(resumed?.completesAt).toBe(originalCompletesAt + COMBAT_LOCK_MS);

    // The original (pre-pause) deadline passes: the stale timer must not finish the build early.
    nowMs = originalCompletesAt + 1;
    vi.advanceTimersByTime(10_000); // fake clock: 30_100 -> 40_100, past the 40_000 the pre-pause timer was armed for
    expect(structureOnTile()?.status).toBe("under_construction");

    // The shifted deadline completes it.
    nowMs = originalCompletesAt + COMBAT_LOCK_MS + 1;
    vi.advanceTimersByTime(31_000);
    expect(structureOnTile()?.status).toBe("active");
  });

  it("refuses to start a build or rush-buy a paused build on a tile under attack", async () => {
    vi.useFakeTimers();
    let nowMs = START;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 1_000 })],
        ["player-2", buildPlayer("player-2", { points: 10_000, manpower: 1_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          ...attackerTiles,
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", economicStructure: { ownerId: "player-2", type: "FARMSTEAD", status: "under_construction", completesAt: START + 600_000 } },
          defenderTown
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);
    runtime.submitCommand(command("attack-1", "player-1", "ATTACK", { fromX: 10, fromY: 10, toX: 10, toY: 11 }, 1));
    await Promise.resolve();

    runtime.submitCommand({ ...command("rush-1", "player-2", "BUILD_STRUCTURE", { x: 10, y: 11 }, 1), type: "RUSH_BUY" as never });
    runtime.submitCommand(command("build-1", "player-2", "BUILD_STRUCTURE", { x: 10, y: 11, structureType: "FORT" }, 2));
    await Promise.resolve();

    expect(seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "rush-1")).toMatchObject({ message: "construction is paused due to an ongoing attack" });
    expect(seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "build-1")).toMatchObject({ message: "tile is under attack" });
    expect(latestStructureDelta(seen).structure).toMatchObject({ status: "under_construction", pausedAt: START });
  });

  it("drops the paused build when the attacker captures the tile", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    let nowMs = START;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 1_000 })],
        ["player-2", buildPlayer("player-2", { isAi: true, manpower: 1_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          ...attackerTiles,
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", economicStructure: { ownerId: "player-2", type: "FARMSTEAD", status: "under_construction", completesAt: START + 600_000 } },
          defenderTown
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);
    runtime.submitCommand(command("attack-1", "player-1", "ATTACK", { fromX: 10, fromY: 10, toX: 10, toY: 11 }, 1));
    await Promise.resolve();
    expect(latestStructureDelta(seen).structure?.pausedAt).toBe(START);
    nowMs = START + COMBAT_LOCK_MS;
    vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

    const latest = latestStructureDelta(seen);
    expect(latest.ownerId).toBe("player-1");
    expect(latest.structure).toBeUndefined();
  });

  it("resumes a build left paused by a restart that lost its attack lock", async () => {
    vi.useFakeTimers();
    let nowMs = START + 20_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      initialPlayers: new Map([["player-2", buildPlayer("player-2", { isAi: true })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", economicStructure: { ownerId: "player-2", type: "FARMSTEAD", status: "under_construction", completesAt: START + 60_000, pausedAt: START } }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);
    vi.advanceTimersByTime(1);
    // Paused for 20s before the restart (pausedAt -> now), so the deadline slides 20s.
    expect(latestStructureDelta(seen).structure).toMatchObject({ status: "under_construction", completesAt: START + 80_000 });
    expect(latestStructureDelta(seen).structure?.pausedAt).toBeUndefined();
    nowMs = START + 80_001;
    vi.advanceTimersByTime(60_000);
    expect(latestStructureDelta(seen).structure?.status).toBe("active");
  });
});
