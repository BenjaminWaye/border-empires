import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { queueAfcModuleDeliveries, snapshotAfcModules, type AfcModuleDeliveryFxEntry } from "./client-afc-module-delivery-detect.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const afcTile = (ownerId: string, modules?: string[]): Tile =>
  ({ x: 4, y: 7, terrain: "LAND", ownerId, afc: { ownerId, status: "active", ...(modules ? { modules } : {}) } }) as Tile;

const deliveredAtByKey = new Map<string, number>();
const run = (before: Tile | undefined, after: Tile, me = "me"): AfcModuleDeliveryFxEntry[] => {
  const queue: AfcModuleDeliveryFxEntry[] = [];
  queueAfcModuleDeliveries({
    tileUpdates: [{ x: 4, y: 7 }],
    previousModulesByKey: new Map([[keyFor(4, 7), snapshotAfcModules(before)]]),
    tiles: new Map([[keyFor(4, 7), after]]),
    me,
    keyFor,
    queue,
    deliveredAtByKey,
    nowMs: 100
  });
  return queue;
};

describe("queueAfcModuleDeliveries", () => {
  it("queues a delivery for the socket the new module docks into", () => {
    expect(run(afcTile("me", ["masonry"]), afcTile("me", ["masonry", "leatherworking"]))).toEqual([
      { x: 4, y: 7, slot: 1, techId: "leatherworking", queuedAt: 100 }
    ]);
  });

  it("stamps the AFC tile for the 2D pulse only when a delivery lands", () => {
    deliveredAtByKey.clear();
    run(afcTile("me", ["masonry"]), afcTile("me", ["masonry"]));
    expect(deliveredAtByKey.size).toBe(0);
    run(afcTile("me", ["masonry"]), afcTile("me", ["masonry", "leatherworking"]));
    expect(deliveredAtByKey.has(keyFor(4, 7))).toBe(true);
  });

  it("queues one delivery per module when several land in one batch, each in its own slot", () => {
    const queue = run(afcTile("me"), afcTile("me", ["masonry", "leatherworking", "workshops"]));
    expect(queue.map((e) => [e.techId, e.slot])).toEqual([["masonry", 0], ["leatherworking", 1], ["workshops", 2]]);
  });

  it("queues nothing for a tile first seen in this batch", () => {
    expect(run(undefined, afcTile("me", ["masonry"]))).toEqual([]);
  });

  it("queues nothing for someone else's AFC", () => {
    expect(run(afcTile("them"), afcTile("them", ["masonry"]))).toEqual([]);
  });

  it("queues nothing when the module list is unchanged", () => {
    expect(run(afcTile("me", ["masonry"]), afcTile("me", ["masonry"]))).toEqual([]);
  });

  it("skips modules past the last socket", () => {
    const nine = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    expect(run(afcTile("me", nine.slice(0, 8)), afcTile("me", nine))).toEqual([]);
  });
});
