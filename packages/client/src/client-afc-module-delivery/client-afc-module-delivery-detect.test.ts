import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import {
  AFC_DELIVERY_2D_PULSE_MS,
  detectAfcModuleDeliveries,
  recordAfcModuleDeliveries,
  snapshotAfcModules,
  type AfcModuleDeliveryFxEntry
} from "./client-afc-module-delivery-detect.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const afcTile = (x: number, y: number, ownerId: string, modules?: string[]): Tile =>
  ({ x, y, ownerId, afc: { ownerId, status: "active", ...(modules ? { modules } : {}) } }) as Tile;

const run = (previous: Tile | undefined, next: Tile, me = "p1") =>
  detectAfcModuleDeliveries({
    tileUpdates: [{ x: next.x, y: next.y }],
    previousAfcModulesByKey: new Map([[keyFor(next.x, next.y), snapshotAfcModules(previous)]]),
    tiles: new Map([[keyFor(next.x, next.y), next]]),
    me,
    keyFor,
    nowMs: 100
  });

describe("detectAfcModuleDeliveries", () => {
  it("queues one delivery when an owned AFC gains a module", () => {
    expect(run(afcTile(4, 5, "p1", ["masonry"]), afcTile(4, 5, "p1", ["masonry", "alchemy"]))).toEqual([{ x: 4, y: 5, techId: "alchemy", queuedAt: 100 }]);
  });

  it("treats an AFC with no modules field as an empty set (first module docks)", () => {
    expect(run(afcTile(4, 5, "p1"), afcTile(4, 5, "p1", ["masonry"]))).toEqual([{ x: 4, y: 5, techId: "masonry", queuedAt: 100 }]);
  });

  it("queues one entry per module when several dock in the same batch", () => {
    const out = run(afcTile(4, 5, "p1", []), afcTile(4, 5, "p1", ["masonry", "alchemy"]));
    expect(out.map((e) => e.techId)).toEqual(["masonry", "alchemy"]);
  });

  it("queues nothing for a tile seen for the first time (no previous snapshot)", () => {
    expect(run(undefined, afcTile(4, 5, "p1", ["masonry"]))).toEqual([]);
  });

  it("queues nothing when the AFC itself just arrived (previous tile had no AFC)", () => {
    expect(run({ x: 4, y: 5, ownerId: "p1" } as Tile, afcTile(4, 5, "p1", ["masonry"]))).toEqual([]);
  });

  it("queues nothing for another player's AFC", () => {
    expect(run(afcTile(4, 5, "p2", []), afcTile(4, 5, "p2", ["masonry"]))).toEqual([]);
  });

  it("queues nothing when the module list is unchanged", () => {
    expect(run(afcTile(4, 5, "p1", ["masonry"]), afcTile(4, 5, "p1", ["masonry"]))).toEqual([]);
  });
});

describe("recordAfcModuleDeliveries", () => {
  const newState = () => ({ afcModuleDeliveryFxQueue: [] as AfcModuleDeliveryFxEntry[], afcModuleDeliveryLandedAt: new Map<string, number>() });

  it("queues for 3D and stamps the 2D pulse map", () => {
    const state = newState();
    recordAfcModuleDeliveries(state, [{ x: 1, y: 2, techId: "masonry", queuedAt: 10 }], keyFor, 10);
    expect(state.afcModuleDeliveryFxQueue).toHaveLength(1);
    expect(state.afcModuleDeliveryLandedAt.get("1,2")).toBe(10);
  });

  it("prunes expired 2D stamps so the map stays bounded", () => {
    const state = newState();
    state.afcModuleDeliveryLandedAt.set("9,9", 0);
    recordAfcModuleDeliveries(state, [], keyFor, AFC_DELIVERY_2D_PULSE_MS + 1);
    expect(state.afcModuleDeliveryLandedAt.size).toBe(0);
  });

  it("caps the undrained 3D queue (it never drains in 2D-only sessions)", () => {
    const state = newState();
    const many = Array.from({ length: 100 }, (_, i) => ({ x: i, y: 0, techId: "masonry", queuedAt: i }));
    recordAfcModuleDeliveries(state, many, keyFor, 1);
    expect(state.afcModuleDeliveryFxQueue.length).toBeLessThanOrEqual(32);
    expect(state.afcModuleDeliveryFxQueue.at(-1)?.x).toBe(99);
  });
});
