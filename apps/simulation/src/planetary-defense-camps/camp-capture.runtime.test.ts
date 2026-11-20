import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";

// Planetary Defense captures through the real lock pipeline
// (docs/planetary-defense-camps-plan.md): no walking, frontier with a campId,
// towns and docks found camps, a fallen camp loses its land.
type Seed = Partial<DomainTileState> & { x: number; y: number };

const camp = (x: number, y: number, extra: Partial<DomainTileState> = {}): Seed => ({ x, y, ownerId: "barbarian-1", ownershipState: "SETTLED", campId: `${x},${y}`, ...extra });
const campLand = (x: number, y: number, campId: string): Seed => ({ x, y, ownerId: "barbarian-1", ownershipState: "FRONTIER", campId });
const town = { type: "FARMING" as const, populationTier: "SETTLEMENT" as const };

const buildRuntime = (seeds: Seed[], lock: { attackerId: string; actionType: "ATTACK" | "EXPAND"; origin: [number, number]; target: [number, number] }) => {
  const scheduled: Array<() => void> = [];
  const players = new Map([
    ["barbarian-1", buildPlayer("barbarian-1", { isAi: true, points: Number.MAX_SAFE_INTEGER, manpower: Number.MAX_SAFE_INTEGER })],
    ["player-1", buildPlayer("player-1", { points: 1_000, manpower: 200 })]
  ]);
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    scheduleAfter: (_delayMs, task) => {
      scheduled.push(task);
    },
    initialPlayers: players,
    initialState: {
      tiles: seeds.map((seed) => ({ terrain: "LAND" as const, ...seed })),
      players: [...players.values()].map((player) => ({
        id: player.id, isAi: player.isAi, points: player.points, manpower: player.manpower, techIds: [], domainIds: [],
        mods: player.mods, techRootId: player.techRootId, allies: []
      })),
      activeLocks: [{
        commandId: "lock-1", playerId: lock.attackerId, actionType: lock.actionType,
        originX: lock.origin[0], originY: lock.origin[1], targetX: lock.target[0], targetY: lock.target[1],
        originKey: `${lock.origin[0]},${lock.origin[1]}`, targetKey: `${lock.target[0]},${lock.target[1]}`, resolvesAt: 1_500
      }]
    }
  });
  const resolve = async (): Promise<void> => {
    expect(scheduled).toHaveLength(1);
    scheduled[0]!();
    await Promise.resolve(); // the camp collapse drain runs as a microtask
  };
  const tile = (x: number, y: number) => runtime.exportState().tiles.find((t) => t.x === x && t.y === y);
  return { runtime, resolve, tile };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Planetary Defense captures", () => {
  it("expanding keeps the camp where it is and adds the ground as that camp's frontier", async () => {
    const { resolve, tile } = buildRuntime([camp(10, 10), { x: 10, y: 11 }], { attackerId: "barbarian-1", actionType: "EXPAND", origin: [10, 10], target: [10, 11] });
    await resolve();
    expect(tile(10, 10)).toMatchObject({ ownerId: "barbarian-1", ownershipState: "SETTLED", campId: "10,10" });
    expect(tile(10, 11)).toMatchObject({ ownerId: "barbarian-1", ownershipState: "FRONTIER", campId: "10,10" });
  });

  it("taking a House's town founds a new camp there", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { runtime, resolve, tile } = buildRuntime(
      [camp(10, 10), { x: 10, y: 11, ownerId: "player-1", ownershipState: "SETTLED", town }, { x: 30, y: 30, ownerId: "player-1", ownershipState: "SETTLED" }],
      { attackerId: "barbarian-1", actionType: "ATTACK", origin: [10, 10], target: [10, 11] }
    );
    await resolve();
    expect(tile(10, 11)).toMatchObject({ ownerId: "barbarian-1", ownershipState: "SETTLED", campId: "10,11" });
    expect(tile(10, 10)).toMatchObject({ ownerId: "barbarian-1", campId: "10,10" });
    expect(runtime.barbarianStateSizes().camps).toBe(2);
  });

  it("a House that takes a camp also takes the frontier that capture cut off, as for any encirclement, and only that camp's", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { runtime, resolve, tile } = buildRuntime(
      [
        { x: 9, y: 10, ownerId: "player-1", ownershipState: "SETTLED" },
        camp(10, 10), campLand(11, 10, "10,10"), campLand(12, 10, "10,10"),
        camp(13, 10), campLand(14, 10, "13,10")
      ],
      { attackerId: "player-1", actionType: "ATTACK", origin: [9, 10], target: [10, 10] }
    );
    await resolve();
    expect(tile(10, 10)?.ownerId).toBe("player-1");
    expect(tile(11, 10)).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    // (12,10) touches the other camp's land, so the House encirclement rule doesn't see it as
    // cut off; its own camp has fallen, so the per-camp rule releases it to neutral.
    expect(tile(12, 10)?.ownerId).toBeUndefined();
    expect(tile(11, 10)?.campId).toBeUndefined();
    expect(tile(13, 10)).toMatchObject({ ownerId: "barbarian-1", campId: "13,10" });
    expect(tile(14, 10)).toMatchObject({ ownerId: "barbarian-1", campId: "13,10" });
    expect(runtime.barbarianStateSizes()).toMatchObject({ camps: 1, tiles: 2 });
  });

  it("a camp that falls some other way loses all of its land to neutral", async () => {
    // An EXPAND can't take a camp, so drop the camp tile directly, as an AFC landing clear does.
    const { runtime, resolve, tile } = buildRuntime(
      [camp(10, 10), campLand(11, 10, "10,10"), campLand(12, 10, "10,10"), { x: 30, y: 30 }],
      { attackerId: "barbarian-1", actionType: "EXPAND", origin: [10, 10], target: [10, 11] }
    );
    (runtime as unknown as { replaceTileState: (key: string, tile: DomainTileState, commandId?: string) => void })
      .replaceTileState("10,10", { x: 10, y: 10, terrain: "LAND" }, "test-clear");
    await Promise.resolve();
    expect(tile(11, 10)?.ownerId).toBeUndefined();
    expect(tile(12, 10)?.ownerId).toBeUndefined();
    expect(runtime.barbarianStateSizes()).toMatchObject({ camps: 0, releasedTotal: 2 });
    await resolve();
  });

  it("a failed attack on a camp hands the attacker's tile to that camp without the camp moving", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const { resolve, tile } = buildRuntime(
      [{ x: 9, y: 10, ownerId: "player-1", ownershipState: "FRONTIER" }, { x: 8, y: 10, ownerId: "player-1", ownershipState: "SETTLED" }, camp(10, 10)],
      { attackerId: "player-1", actionType: "ATTACK", origin: [9, 10], target: [10, 10] }
    );
    await resolve();
    expect(tile(10, 10)).toMatchObject({ ownerId: "barbarian-1", ownershipState: "SETTLED", campId: "10,10" });
    expect(tile(9, 10)).toMatchObject({ ownerId: "barbarian-1", ownershipState: "FRONTIER", campId: "10,10" });
  });
});
