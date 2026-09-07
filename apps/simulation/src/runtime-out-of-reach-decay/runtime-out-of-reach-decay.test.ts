import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { OUT_OF_REACH_DECAY_MS, type ReachAnchor } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import type { SimulationTileWireDelta } from "../runtime-types.js";
import {
  createOutOfReachDecayQueue,
  enqueueOutOfReachDecay,
  OUT_OF_REACH_DECAY_MAX_EXPIRIES_PER_TICK,
  OUT_OF_REACH_DECAY_QUEUE_CAP,
  outOfReachDecayQueueDepth,
  rebuildOutOfReachDecayQueue,
  tickOutOfReachDecay,
  type OutOfReachDecayQueue
} from "./runtime-out-of-reach-decay.js";

const frontierTile = (
  tileKey: string,
  overrides: Partial<DomainTileState> = {}
): DomainTileState => {
  const [xStr, yStr] = tileKey.split(",");
  return {
    x: Number(xStr),
    y: Number(yStr),
    ownerId: "p1",
    ownershipState: "FRONTIER",
    ...overrides
  } as DomainTileState;
};

type Harness = {
  queue: OutOfReachDecayQueue;
  tiles: Map<string, DomainTileState>;
  events: SimulationEvent[];
  tick: (nowMs: number) => number;
};

const harness = (anchors: ReachAnchor[] = []): Harness => {
  const queue = createOutOfReachDecayQueue();
  const tiles = new Map<string, DomainTileState>();
  const events: SimulationEvent[] = [];
  return {
    queue,
    tiles,
    events,
    tick: (nowMs: number) =>
      tickOutOfReachDecay({
        queue,
        nowMs,
        tiles,
        replaceTileState: (tileKey, tile) => {
          tiles.set(tileKey, tile);
        },
        tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }) as SimulationTileWireDelta,
        emitEvent: (event) => {
          events.push(event);
        },
        runtimeLogInfo: () => {},
        gatherReachAnchors: () => anchors,
        registerFrontierAutoHeal: () => {}
      })
  };
};

/** Stamp a tile as out-of-reach decaying and register it, the way the runtime does. */
const stamp = (h: Harness, tileKey: string, deadlineAt: number, overrides: Partial<DomainTileState> = {}): void => {
  h.tiles.set(
    tileKey,
    frontierTile(tileKey, { frontierDecayAt: deadlineAt, frontierDecayKind: "OUT_OF_REACH", ...overrides })
  );
  enqueueOutOfReachDecay(h.queue, tileKey, deadlineAt);
};

describe("tickOutOfReachDecay — expiry", () => {
  it("expires a tile once its deadline passes, clearing ownership", () => {
    const h = harness();
    stamp(h, "10,10", 1_000 + OUT_OF_REACH_DECAY_MS);

    expect(h.tick(1_000)).toBe(0); // not yet due
    expect(h.tiles.get("10,10")?.ownerId).toBe("p1");

    expect(h.tick(1_000 + OUT_OF_REACH_DECAY_MS)).toBe(1);
    const tile = h.tiles.get("10,10");
    expect(tile?.ownerId).toBeUndefined();
    expect(tile?.ownershipState).toBeUndefined();
    expect(tile?.frontierDecayAt).toBeUndefined();
    expect(tile?.frontierDecayKind).toBeUndefined();
  });

  it("emits one TILE_DELTA_BATCH per owner for expired tiles", () => {
    const h = harness();
    stamp(h, "10,10", 500);
    stamp(h, "11,10", 500);
    stamp(h, "12,10", 500, { ownerId: "p2" });

    expect(h.tick(1_000)).toBe(3);
    expect(h.events).toHaveLength(2);
    const owners = h.events.map((e) => (e as { playerId: string }).playerId).sort();
    expect(owners).toEqual(["p1", "p2"]);
  });

  it("does not expire a tile inside another player's live reach, clearing the timer instead", () => {
    const anchor: ReachAnchor = { ownerId: "p2", x: 10, y: 10, kind: "TOWN", activatedAt: 0 };
    const h = harness([anchor]);
    stamp(h, "10,10", 1_000);

    expect(h.tick(1_000)).toBe(0);
    const tile = h.tiles.get("10,10");
    // Ownership held onto — the tile is still contested/covered ground, not decayed.
    expect(tile?.ownerId).toBe("p1");
    expect(tile?.ownershipState).toBe("FRONTIER");
    // Timer cleared so it does not read as perpetually about to decay.
    expect(tile?.frontierDecayAt).toBeUndefined();
    expect(tile?.frontierDecayKind).toBeUndefined();
  });

  it("preserves naturalWonder on the tile once it decays back to neutral", () => {
    const h = harness();
    const wonder = { type: "CARTOGRAPHERS_LENS" } as DomainTileState["naturalWonder"];
    stamp(h, "10,10", 500, { naturalWonder: wonder });

    expect(h.tick(1_000)).toBe(1);
    const tile = h.tiles.get("10,10");
    expect(tile?.ownerId).toBeUndefined();
    expect(tile?.naturalWonder).toBe(wonder); // world-gen feature, not owner-scoped -- survives decay
  });

  it("stops at the first entry that is not yet due", () => {
    const h = harness();
    stamp(h, "10,10", 500);
    stamp(h, "11,10", 5_000);

    expect(h.tick(1_000)).toBe(1);
    expect(h.tiles.get("10,10")?.ownerId).toBeUndefined();
    expect(h.tiles.get("11,10")?.ownerId).toBe("p1"); // still pending
    expect(outOfReachDecayQueueDepth(h.queue)).toBe(1);
  });
});

describe("tickOutOfReachDecay — stale entries (O(1) cancellation)", () => {
  it("drops the entry without expiring when the tile was settled", () => {
    const h = harness();
    stamp(h, "10,10", 500);
    // Settling clears the decay fields; the queue is deliberately not touched.
    h.tiles.set("10,10", frontierTile("10,10", { ownershipState: "SETTLED" }));

    expect(h.tick(1_000)).toBe(0);
    expect(h.tiles.get("10,10")?.ownershipState).toBe("SETTLED");
    expect(outOfReachDecayQueueDepth(h.queue)).toBe(0); // entry drained, not leaked
  });

  it("drops the entry when reach caught up and cleared the decay fields", () => {
    const h = harness();
    stamp(h, "10,10", 500);
    h.tiles.set("10,10", frontierTile("10,10")); // decay fields cleared

    expect(h.tick(1_000)).toBe(0);
    expect(h.tiles.get("10,10")?.ownerId).toBe("p1"); // kept the tile
  });

  it("drops the entry when the tile was re-stamped with a later deadline", () => {
    const h = harness();
    stamp(h, "10,10", 500);
    stamp(h, "10,10", 9_000); // re-claimed later; both entries now queued

    // At t=1000 the first (stale) entry is due but no longer matches the tile.
    expect(h.tick(1_000)).toBe(0);
    expect(h.tiles.get("10,10")?.ownerId).toBe("p1");
    // The live entry still expires at its own deadline.
    expect(h.tick(9_000)).toBe(1);
    expect(h.tiles.get("10,10")?.ownerId).toBeUndefined();
  });

  it("drops the entry when the tile changed owner", () => {
    const h = harness();
    stamp(h, "10,10", 500);
    h.tiles.set(
      "10,10",
      frontierTile("10,10", { ownerId: "p2", frontierDecayAt: 500, frontierDecayKind: "OUT_OF_REACH" })
    );

    // Owner changed, but the deadline still matches, so this entry is still
    // live for the *current* owner — it expires against them.
    expect(h.tick(1_000)).toBe(1);
    expect(h.tiles.get("10,10")?.ownerId).toBeUndefined();
  });

  it("ignores a tile that no longer exists", () => {
    const h = harness();
    stamp(h, "10,10", 500);
    h.tiles.delete("10,10");

    expect(h.tick(1_000)).toBe(0);
  });
});

describe("tickOutOfReachDecay — performance guards", () => {
  it("never scans past the due entries (cost is O(expiring), not O(queue))", () => {
    const h = harness();
    stamp(h, "0,0", 500);
    for (let i = 1; i <= 5_000; i += 1) stamp(h, `${i},0`, 1_000_000 + i);

    let reads = 0;
    const countingTiles = new Proxy(h.tiles, {
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

    tickOutOfReachDecay({
      queue: h.queue,
      nowMs: 1_000,
      tiles: countingTiles,
      replaceTileState: (tileKey, tile) => {
        h.tiles.set(tileKey, tile);
      },
      tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }) as SimulationTileWireDelta,
      emitEvent: () => {},
      runtimeLogInfo: () => {},
      gatherReachAnchors: () => [],
      registerFrontierAutoHeal: () => {}
    });

    // Exactly one tile was due; the other 5,000 must not have been touched.
    expect(reads).toBe(1);
  });

  it("caps expiries per tick and defers the remainder", () => {
    const h = harness();
    const total = OUT_OF_REACH_DECAY_MAX_EXPIRIES_PER_TICK + 250;
    for (let i = 0; i < total; i += 1) stamp(h, `${i},0`, 500);

    expect(h.tick(1_000)).toBe(OUT_OF_REACH_DECAY_MAX_EXPIRIES_PER_TICK);
    expect(outOfReachDecayQueueDepth(h.queue)).toBe(250);
    expect(h.tick(1_000)).toBe(250); // remainder on the next tick
    expect(outOfReachDecayQueueDepth(h.queue)).toBe(0);
  });

  it("compacts the drained prefix so the backing array does not grow unboundedly", () => {
    const h = harness();
    for (let i = 0; i < 3_000; i += 1) stamp(h, `${i},0`, 500);

    // Drain in capped batches until everything is processed.
    while (outOfReachDecayQueueDepth(h.queue) > 0) h.tick(1_000);

    expect(h.queue.entries.length).toBeLessThan(3_000);
  });

  it("drops new registrations at the queue cap rather than growing without bound", () => {
    const queue = createOutOfReachDecayQueue();
    for (let i = 0; i < OUT_OF_REACH_DECAY_QUEUE_CAP; i += 1) {
      queue.entries.push({ tileKey: `${i},0`, deadlineAt: 500 });
    }
    enqueueOutOfReachDecay(queue, "overflow,0", 500);
    expect(outOfReachDecayQueueDepth(queue)).toBe(OUT_OF_REACH_DECAY_QUEUE_CAP);
  });
});

describe("rebuildOutOfReachDecayQueue", () => {
  it("rebuilds only OUT_OF_REACH frontier tiles, in deadline order", () => {
    const tiles = new Map<string, DomainTileState>([
      ["10,10", frontierTile("10,10", { frontierDecayAt: 900, frontierDecayKind: "OUT_OF_REACH" })],
      ["11,10", frontierTile("11,10", { frontierDecayAt: 300, frontierDecayKind: "OUT_OF_REACH" })],
      ["12,10", frontierTile("12,10")], // no decay
      ["13,10", frontierTile("13,10", { ownershipState: "SETTLED", frontierDecayAt: 100, frontierDecayKind: "OUT_OF_REACH" })]
    ]);

    const queue = rebuildOutOfReachDecayQueue(tiles);
    expect(queue.entries.map((e) => e.tileKey)).toEqual(["11,10", "10,10"]);
  });
});
