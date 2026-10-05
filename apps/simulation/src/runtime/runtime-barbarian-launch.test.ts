import { afterEach, describe, expect, it, vi } from "vitest";
import { BARBARIAN_MULTIPLY_THRESHOLD, COMBAT_LOCK_MS } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { applyBarbarianWalkOrMultiply, type BarbarianWalkContext } from "../runtime-barbarian-walk.js";
import type { LockRecord } from "../runtime-types.js";
import { buildPlayer, collectEvents, testRuntimePlayer } from "./runtime.test-helpers.js";

// A barbarian ATTACK leaves its origin tile when the attack starts. Otherwise a
// player who defeats the launch tile mid-fight would still watch the barbarian
// take their tile and survive.
const attack = (playerId: string, commandId: string, from: [number, number], to: [number, number]) => ({
  commandId,
  sessionId: "session-1",
  playerId,
  clientSeq: 1,
  issuedAt: 1_000,
  type: "ATTACK" as const,
  payloadJson: JSON.stringify({ fromX: from[0], fromY: from[1], toX: to[0], toY: to[1] })
});
const rejectedCodes = (seen: SimulationEvent[]): string[] => seen.flatMap((event) => (event.eventType === "COMMAND_REJECTED" ? [event.code] : []));
const ownerAt = (runtime: SimulationRuntime, x: number, y: number) => runtime.exportState().tiles.find((tile) => tile.x === x && tile.y === y)?.ownerId;

const buildRuntime = (target: "FRONTIER" | "SETTLED") =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { manpower: 1_000 })],
      ["player-2", testRuntimePlayer("player-2", { manpower: 1_000 })],
      ["barbarian-1", buildPlayer("barbarian-1", { manpower: 1_000 })]
    ]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" },
        { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: target },
        // Keeps player-2 alive after losing the target.
        { x: 40, y: 40, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
        { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 } },
        { x: 9, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
      ],
      activeLocks: []
    }
  });

describe("barbarian attack launch", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("releases the launch tile as the attack starts, so it can't be captured mid-fight", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const runtime = buildRuntime("FRONTIER");
    const seen = collectEvents(runtime);
    runtime.submitCommand(attack("barbarian-1", "barb-attack", [10, 10], [10, 11]));
    await Promise.resolve();
    expect(rejectedCodes(seen)).toEqual([]);
    expect(ownerAt(runtime, 10, 10)).toBeUndefined();

    runtime.submitCommand({ ...attack("player-1", "take-origin", [9, 10], [10, 10]), clientSeq: 2 });
    await Promise.resolve();
    expect(rejectedCodes(seen)).toEqual(["ATTACK_TARGET_INVALID"]);

    vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
    // Judged from the tile deltas, not the end state: a displaced defender may be re-seated
    // onto the freed tile afterwards, which says nothing about whether the barbarian left it.
    const deltas = seen.flatMap((event) => (event.eventType === "TILE_DELTA_BATCH" ? event.tileDeltas : []));
    expect(deltas.some((d) => d.x === 10 && d.y === 11 && d.ownerId === "barbarian-1")).toBe(true);
    expect(deltas.filter((d) => d.x === 10 && d.y === 10).some((d) => d.ownerId === "barbarian-1")).toBe(false);
    expect(ownerAt(runtime, 10, 10)).not.toBe("player-1");
  });

  it("still hands the launch tile to the defender when the barbarian loses", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const runtime = buildRuntime("SETTLED");
    const seen = collectEvents(runtime);
    runtime.submitCommand(attack("barbarian-1", "barb-attack", [10, 10], [10, 11]));
    await Promise.resolve();
    expect(ownerAt(runtime, 10, 10)).toBeUndefined();
    vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
    const resolved = seen.flatMap((event) => (event.eventType === "COMBAT_RESOLVED" ? [event] : []));
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.attackerWon).toBe(false);
    expect(ownerAt(runtime, 10, 11)).toBe("player-2");
    expect(ownerAt(runtime, 10, 10)).toBe("player-2");
  });

  it("refuses to launch from a tile that is itself under attack", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const runtime = buildRuntime("FRONTIER");
    const seen = collectEvents(runtime);
    runtime.submitCommand(attack("player-1", "attack-barb-tile", [9, 10], [10, 10]));
    await Promise.resolve();
    expect(rejectedCodes(seen)).toEqual([]);
    runtime.submitCommand({ ...attack("barbarian-1", "barb-attack", [10, 10], [10, 11]), clientSeq: 2 });
    await Promise.resolve();
    expect(rejectedCodes(seen)).toEqual(["LOCKED"]);
  });
});

describe("barbarian multiply after launching", () => {
  it("puts the launch tile back when the barbarian multiplies, unless someone claimed it", () => {
    const tiles = new Map<string, DomainTileState>([
      ["10,10", { x: 10, y: 10, terrain: "LAND" }],
      ["10,11", { x: 10, y: 11, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }]
    ]);
    const events: SimulationEvent[] = [];
    const ctx: BarbarianWalkContext = {
      barbarianTileProgress: new Map(),
      summaryForPlayer: () => ({ territoryTileKeys: new Set<string>() }) as ReturnType<BarbarianWalkContext["summaryForPlayer"]>,
      emitEvent: (event) => events.push(event),
      tiles,
      replaceTileState: (key, tile) => tiles.set(key, tile),
      tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y })
    };
    const lock: LockRecord = {
      commandId: "barb", playerId: "barbarian-1", actionType: "ATTACK", manpowerCost: 0,
      originX: 10, originY: 10, targetX: 10, targetY: 11, originKey: "10,10", targetKey: "10,11",
      resolvesAt: 1, source: "system", barbarianLaunch: { progress: BARBARIAN_MULTIPLY_THRESHOLD }
    };
    const previousTarget: DomainTileState = { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" };

    applyBarbarianWalkOrMultiply(ctx, lock, previousTarget);
    expect(events.some((event) => event.eventType === "BARB_MULTIPLIED")).toBe(true);
    expect(tiles.get("10,10")?.ownerId).toBe("barbarian-1");

    tiles.set("10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" });
    applyBarbarianWalkOrMultiply(ctx, lock, previousTarget);
    expect(tiles.get("10,10")?.ownerId).toBe("player-2");
  });
});
