import { afterEach, describe, expect, it, vi } from "vitest";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// The tile an enemy attack launched from is not "locked" -- only the tile
// being attacked is. The defender can counter-attack the launch tile while the
// enemy's attack is still pending, so the answer runs in parallel with the
// fight instead of queueing behind its lock.
//
// Layout (x,y):   (9,10) p2 flag --> (10,10) p1 ORIGIN --> (10,11) p2 TARGET
const muster = (ownerId: string) => ({ ownerId, amount: 999, mode: "HOLD" as const, updatedAt: 0 });

const rejectedCodes = (seen: SimulationEvent[]): string[] =>
  seen.flatMap((event) => (event.eventType === "COMMAND_REJECTED" ? [event.code] : []));

const attack = (playerId: string, commandId: string, clientSeq: number, from: [number, number], to: [number, number]) => ({
  commandId,
  sessionId: "session-1",
  playerId,
  clientSeq,
  issuedAt: 1_000,
  type: "ATTACK" as const,
  payloadJson: JSON.stringify({ fromX: from[0], fromY: from[1], toX: to[0], toY: to[1] })
});

const players = () =>
  new Map([
    ["player-1", buildPlayer("player-1", { manpower: 1_000 })],
    ["player-2", buildPlayer("player-2", { manpower: 1_000 })],
    ["player-3", buildPlayer("player-3", { manpower: 1_000 })]
  ]);

// player-1's attack (10,10) -> (10,11) is already in flight and resolves well
// after anything submitted at t=1_000 does.
const inFlightLock = {
  commandId: "p1-in-flight",
  playerId: "player-1",
  actionType: "ATTACK" as const,
  originX: 10,
  originY: 10,
  targetX: 10,
  targetY: 11,
  originKey: "10,10",
  targetKey: "10,11",
  resolvesAt: 1_000 + COMBAT_LOCK_MS * 2
};

describe("counter-attacking the tile an enemy attack launched from", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const buildRuntime = (target: "FRONTIER" | "SETTLED") =>
    new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: players(),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", muster: muster("player-1") },
          // Keeps player-1 alive after losing the launch tile, so elimination/respawn doesn't muddy the result.
          { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: target },
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", muster: muster("player-2") },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-3", ownershipState: "SETTLED", muster: muster("player-3") }
        ],
        activeLocks: [inFlightLock]
      }
    });

  it("accepts an attack on a tile that only launched someone else's fight", async () => {
    vi.useFakeTimers();
    const runtime = buildRuntime("FRONTIER");
    const seen = collectEvents(runtime);
    runtime.submitCommand(attack("player-2", "counter", 1, [9, 10], [10, 10]));
    await Promise.resolve();
    expect(rejectedCodes(seen)).toEqual([]);
    expect(seen.some((event) => event.eventType === "COMMAND_ACCEPTED" && event.commandId === "counter")).toBe(true);
  });

  it("still rejects a second attack on a tile that is already the target of a fight", async () => {
    vi.useFakeTimers();
    const runtime = buildRuntime("FRONTIER");
    const seen = collectEvents(runtime);
    runtime.submitCommand(attack("player-1", "again", 1, [10, 10], [10, 11]));
    await Promise.resolve();
    expect(rejectedCodes(seen)).toEqual(["LOCKED"]);
  });

  it("still rejects launching from a tile that is itself under attack", async () => {
    vi.useFakeTimers();
    const runtime = buildRuntime("FRONTIER");
    const seen = collectEvents(runtime);
    // player-2 attacks (10,10); (10,11) is the target of player-1's fight and
    // is adjacent to (10,10), so it is the origin player-2 would use.
    runtime.submitCommand(attack("player-2", "launch-from-target", 1, [10, 11], [10, 10]));
    await Promise.resolve();
    expect(rejectedCodes(seen)).toEqual(["LOCKED"]);
  });

  it("resolves the original attack anyway when its origin was captured mid-fight", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const runtime = buildRuntime("FRONTIER");
    const seen = collectEvents(runtime);
    runtime.submitCommand(attack("player-2", "counter", 1, [9, 10], [10, 10]));
    await Promise.resolve();
    // The counter-attack resolves first (it was accepted later but locks for half as long).
    vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
    expect(runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10)?.ownerId).toBe("player-2");

    vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
    const resolved = seen.flatMap((event) => (event.eventType === "COMBAT_RESOLVED" && event.commandId === "p1-in-flight" ? [event] : []));
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.attackerWon).toBe(true);
    expect(runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11)?.ownerId).toBe("player-1");
    expect(runtime.exportState().activeLocks).toEqual([]);
  });

  it("does not hand a captured origin to the defender when the original attack loses", async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const runtime = buildRuntime("SETTLED");
    const seen = collectEvents(runtime);
    // player-3 takes player-1's launch tile while player-1's attack is pending.
    runtime.submitCommand(attack("player-3", "third-party-capture", 1, [11, 10], [10, 10]));
    await Promise.resolve();
    vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
    expect(runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10)?.ownerId).toBe("player-3");

    // player-1's attack is decided when it resolves, and it loses.
    random.mockReturnValue(0.999999);
    vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
    const resolved = seen.flatMap((event) => (event.eventType === "COMBAT_RESOLVED" && event.commandId === "p1-in-flight" ? [event] : []));
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.attackerWon).toBe(false);
    // Without the ownership guard in resolveLock the defender (player-2) would be handed the tile.
    expect(runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10)?.ownerId).toBe("player-3");
  });

  it("barbarian walk does not release a launch tile a player captured mid-fight", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 1_000 })],
        ["player-2", buildPlayer("player-2", { manpower: 1_000 })],
        ["barbarian-1", buildPlayer("barbarian-1", { manpower: 1_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" },
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", muster: muster("player-1") },
          { x: 9, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
        ],
        activeLocks: [{ ...inFlightLock, commandId: "barb-in-flight", playerId: "barbarian-1" }]
      }
    });
    const seen = collectEvents(runtime);
    // The player takes the barbarian's launch tile while its attack is still pending.
    runtime.submitCommand(attack("player-1", "take-barb-origin", 1, [9, 10], [10, 10]));
    await Promise.resolve();
    expect(rejectedCodes(seen)).toEqual([]);
    vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
    expect(runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10)?.ownerId).toBe("player-1");

    vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
    expect(seen.some((event) => event.eventType === "COMBAT_RESOLVED" && event.commandId === "barb-in-flight")).toBe(true);
    const tiles = runtime.exportState().tiles;
    expect(tiles.find((tile) => tile.x === 10 && tile.y === 11)?.ownerId).toBe("barbarian-1");
    // The walk would normally neutralise the barbarian's origin; it must leave the player's tile alone.
    expect(tiles.find((tile) => tile.x === 10 && tile.y === 10)?.ownerId).toBe("player-1");
  });
});
