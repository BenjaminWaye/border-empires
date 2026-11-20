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
        originKey: `${lock.origin[0]},${lock.origin[1]}`, targetKey: `${lock.target[0]},${lock.target[1]}`, resolvesAt: 1_500,
        manpowerCost: 150
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

  // Review regression: the House-wide encirclement pass used to run over camp land
  // too, walking every touching camp's frontier (hitting its bfsCap) and handing
  // the attacker part of the camp. Camp land is supplied per camp instead.
  it("a House that takes a camp frees all of that camp's land to neutral, and only that camp's", async () => {
    // A real ATTACK from a funded flag, away from the default test world's
    // starting reach near (10,10) (it would re-claim freed land).
    vi.spyOn(Math, "random").mockReturnValue(0);
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => {
        scheduled.push(task);
      },
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 1_000, manpower: 1_000 })],
        ["barbarian-1", buildPlayer("barbarian-1", { isAi: true, points: Number.MAX_SAFE_INTEGER, manpower: Number.MAX_SAFE_INTEGER })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 68, y: 70, ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 69, y: 70, ownerId: "player-1", ownershipState: "FRONTIER", muster: { ownerId: "player-1", amount: 500, mode: "HOLD", updatedAt: 0 } },
          camp(70, 70), campLand(71, 70, "70,70"), campLand(72, 70, "70,70"),
          camp(73, 70), campLand(74, 70, "73,70")
        ].map((seed) => ({ terrain: "LAND" as const, ...seed })),
        activeLocks: []
      }
    });
    runtime.submitCommand({
      commandId: "take-camp", sessionId: "s", playerId: "player-1", clientSeq: 1, issuedAt: 1_000, type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 69, fromY: 70, toX: 70, toY: 70 })
    });
    await Promise.resolve();
    expect(scheduled).toHaveLength(1);
    scheduled[0]!();
    await Promise.resolve();
    const tile = (x: number, y: number) => runtime.exportState().tiles.find((t) => t.x === x && t.y === y);
    expect(tile(70, 70)?.ownerId).toBe("player-1");
    expect(tile(71, 70)?.ownerId).toBeUndefined();
    expect(tile(72, 70)?.ownerId).toBeUndefined();
    expect(tile(71, 70)?.campId).toBeUndefined();
    expect(tile(73, 70)).toMatchObject({ ownerId: "barbarian-1", campId: "73,70" });
    expect(tile(74, 70)).toMatchObject({ ownerId: "barbarian-1", campId: "73,70" });
    expect(runtime.barbarianStateSizes()).toMatchObject({ camps: 1, tiles: 2, releasedTotal: 2 });
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

  // Review regression: a camp whose camp tile fell while its own attack was in
  // flight still won that attack, and the target joined the dead camp and stuck.
  it("a fight won after its camp fell joins nothing: the tile collapses with the camp's land", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { runtime, resolve, tile } = buildRuntime(
      [camp(10, 10), { x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" }, { x: 30, y: 30, ownerId: "player-1", ownershipState: "SETTLED" }],
      { attackerId: "barbarian-1", actionType: "ATTACK", origin: [10, 10], target: [10, 11] }
    );
    (runtime as unknown as { replaceTileState: (key: string, tile: DomainTileState, commandId?: string) => void })
      .replaceTileState("10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }, "test-take-camp");
    await resolve();
    expect(tile(10, 11)?.ownerId).toBeUndefined();
    expect(runtime.barbarianStateSizes()).toMatchObject({ camps: 0, tiles: 0 });
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
