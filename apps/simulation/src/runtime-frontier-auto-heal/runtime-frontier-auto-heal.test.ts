import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";
import {
  createFrontierAutoHealQueue,
  enqueueFrontierAutoHeal,
  frontierAutoHealQueueDepth,
  rebuildFrontierAutoHealQueue,
  tickFrontierAutoHeal,
  FRONTIER_AUTO_HEAL_MAX_PER_TICK,
  type FrontierAutoHealQueue
} from "./runtime-frontier-auto-heal.js";
import type { SimulationTileWireDelta } from "../runtime-types.js";

const baseTile: DomainTileState = { x: 1, y: 1, terrain: "LAND" };

const harness = (queue: FrontierAutoHealQueue, tiles: Map<string, DomainTileState>, reachOwnerAt: (x: number, y: number) => string | undefined) => {
  const events: SimulationEvent[] = [];
  const tick = (nowMs: number) =>
    tickFrontierAutoHeal({
      queue,
      nowMs,
      tiles,
      replaceTileState: (k, t) => tiles.set(k, t),
      tileDeltaFromState: (t) => ({ x: t.x, y: t.y }) as SimulationTileWireDelta,
      emitEvent: (e) => events.push(e),
      runtimeLogInfo: () => {},
      reachBorderOwnerAt: reachOwnerAt
    });
  return { events, tick };
};

describe("tickFrontierAutoHeal", () => {
  it("re-grants FRONTIER for the owner currently covering the tile once its deadline is due", () => {
    const queue = createFrontierAutoHealQueue();
    const tiles = new Map<string, DomainTileState>([["1,1", { ...baseTile, healAt: 1_000 }]]);
    enqueueFrontierAutoHeal(queue, "1,1", 1_000);
    const { events, tick } = harness(queue, tiles, () => "player-1");

    const healed = tick(1_000);

    expect(healed).toBe(1);
    expect(tiles.get("1,1")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER", healAt: undefined });
    expect(events).toHaveLength(1);
  });

  it("does not fire before the deadline", () => {
    const queue = createFrontierAutoHealQueue();
    const tiles = new Map<string, DomainTileState>([["1,1", { ...baseTile, healAt: 1_000 }]]);
    enqueueFrontierAutoHeal(queue, "1,1", 1_000);
    const { tick } = harness(queue, tiles, () => "player-1");

    expect(tick(999)).toBe(0);
    expect(tiles.get("1,1")?.ownerId).toBeUndefined();
  });

  it("drops the entry (no heal) when nobody currently covers the tile — auto-claim will pick it up later if reach ever arrives", () => {
    const queue = createFrontierAutoHealQueue();
    const tiles = new Map<string, DomainTileState>([["1,1", { ...baseTile, healAt: 1_000 }]]);
    enqueueFrontierAutoHeal(queue, "1,1", 1_000);
    const { events, tick } = harness(queue, tiles, () => undefined);

    expect(tick(1_000)).toBe(0);
    expect(tiles.get("1,1")?.ownerId).toBeUndefined();
    expect(tiles.get("1,1")?.healAt).toBeUndefined();
    expect(events).toHaveLength(0);
  });

  it("drops a stale entry when the tile was re-claimed before the deadline", () => {
    const queue = createFrontierAutoHealQueue();
    const tiles = new Map<string, DomainTileState>([["1,1", { ...baseTile, ownerId: "player-3", ownershipState: "FRONTIER" }]]);
    enqueueFrontierAutoHeal(queue, "1,1", 1_000);
    const { tick } = harness(queue, tiles, () => "player-1");

    expect(tick(1_000)).toBe(0);
    expect(tiles.get("1,1")?.ownerId).toBe("player-3"); // untouched
  });

  it("never scans past the due entries — cost is O(due), not O(queue depth)", () => {
    const queue = createFrontierAutoHealQueue();
    const tiles = new Map<string, DomainTileState>();
    for (let i = 0; i < 5_000; i++) {
      const key = `${i},1`;
      tiles.set(key, { x: i, y: 1, terrain: "LAND", healAt: 10_000 + i });
      enqueueFrontierAutoHeal(queue, key, 10_000 + i);
    }
    let reads = 0;
    const countingTiles = new Proxy(tiles, {
      get(target, prop, receiver) {
        if (prop === "get") {
          return (key: string) => {
            reads += 1;
            return target.get(key);
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    tickFrontierAutoHeal({
      queue,
      nowMs: 10_000, // only the first entry is due
      tiles: countingTiles,
      replaceTileState: (k, t) => tiles.set(k, t),
      tileDeltaFromState: (t) => ({ x: t.x, y: t.y }) as SimulationTileWireDelta,
      emitEvent: () => {},
      runtimeLogInfo: () => {},
      reachBorderOwnerAt: () => "player-1"
    });
    expect(reads).toBe(1);
  });

  it("caps heals per tick and defers the remainder", () => {
    const queue = createFrontierAutoHealQueue();
    const tiles = new Map<string, DomainTileState>();
    const overCap = FRONTIER_AUTO_HEAL_MAX_PER_TICK + 10;
    for (let i = 0; i < overCap; i++) {
      const key = `${i},1`;
      tiles.set(key, { x: i, y: 1, terrain: "LAND", healAt: 1_000 });
      enqueueFrontierAutoHeal(queue, key, 1_000);
    }
    const { tick } = harness(queue, tiles, () => "player-1");

    const firstTick = tick(1_000);
    expect(firstTick).toBe(FRONTIER_AUTO_HEAL_MAX_PER_TICK);
    expect(frontierAutoHealQueueDepth(queue)).toBe(10);

    const secondTick = tick(1_000);
    expect(secondTick).toBe(10);
    expect(frontierAutoHealQueueDepth(queue)).toBe(0);
  });
});

describe("rebuildFrontierAutoHealQueue", () => {
  it("rebuilds only from neutral tiles carrying a healAt stamp, in deadline order", () => {
    const tiles = new Map<string, DomainTileState>([
      ["a", { x: 0, y: 0, terrain: "LAND", healAt: 2_000 }],
      ["b", { x: 1, y: 0, terrain: "LAND", healAt: 1_000 }],
      ["c", { x: 2, y: 0, terrain: "LAND", ownerId: "player-1", healAt: 500 }], // owned -- not eligible
      ["d", { x: 3, y: 0, terrain: "LAND" }] // no healAt at all
    ]);
    const queue = rebuildFrontierAutoHealQueue(tiles);
    expect(queue.entries.map((e) => e.tileKey)).toEqual(["b", "a"]);
  });
});
