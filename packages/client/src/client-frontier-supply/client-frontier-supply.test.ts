import { describe, expect, it } from "vitest";

import { computeFrontierSupplyModel, type FrontierSupplyModel, type FrontierSupplyTile } from "./client-frontier-supply.js";

const ME = "me";
const settled = (x: number, y: number, ownerId = ME): FrontierSupplyTile => ({ x, y, ownerId, ownershipState: "SETTLED" });
const frontier = (x: number, y: number, ownerId = ME, extra: Partial<FrontierSupplyTile> = {}): FrontierSupplyTile => ({ x, y, ownerId, ownershipState: "FRONTIER", ...extra });
const keys = (...pairs: Array<[number, number]>): Set<string> => new Set(pairs.map(([x, y]) => `${x},${y}`));
const WORLD = { worldWidth: 100, worldHeight: 100 };

/** Town at (10,10) with reach over x <= 12; a one-wide snake running east from it. */
const snake = (length: number): FrontierSupplyTile[] => [settled(10, 10), ...Array.from({ length }, (_, i) => frontier(11 + i, 10))];
const reachToX12 = keys([10, 10], [11, 10], [12, 10]);
const hops = (model: FrontierSupplyModel): string[] => model.links.map((link) => `${link.from.x},${link.from.y}>${link.to.x},${link.to.y}`);
const tips = (model: FrontierSupplyModel): string[] => model.links.filter((link) => link.tip).map((link) => `${link.to.x},${link.to.y}`);
const cuts = (model: FrontierSupplyModel): string[] => model.cuts.map((cut) => `${cut.x},${cut.y}`);
const feederOf = (model: FrontierSupplyModel, x: number, y: number) => model.links.find((link) => link.to.x === x && link.to.y === y)?.from;

describe("computeFrontierSupplyModel", () => {
  it("draws nothing when every frontier tile is inside reach", () => {
    expect(computeFrontierSupplyModel({ tiles: snake(2), me: ME, reach: reachToX12, ...WORLD })).toEqual({ links: [], cuts: [] });
  });

  it("draws a snake past reach as one line from the nearest settled tile, through the tile it hangs on, out to its tip", () => {
    // Every tile past (11,10) hangs on it: it is the cut nearest supply. The line starts at the town behind it.
    const model = computeFrontierSupplyModel({ tiles: snake(5), me: ME, reach: reachToX12, ...WORLD });
    expect(cuts(model)).toEqual(["11,10"]);
    expect(model.links).toEqual([
      { from: { x: 10, y: 10 }, to: { x: 11, y: 10 }, tip: false },
      { from: { x: 11, y: 10 }, to: { x: 12, y: 10 }, tip: false },
      { from: { x: 12, y: 10 }, to: { x: 13, y: 10 }, tip: false },
      { from: { x: 13, y: 10 }, to: { x: 14, y: 10 }, tip: false },
      { from: { x: 14, y: 10 }, to: { x: 15, y: 10 }, tip: true }
    ]);
  });

  it("draws nothing for land beyond reach that has more than one way back to supply", () => {
    // A 5x5 block past reach, joined to a settled column along its whole west side.
    const tiles: FrontierSupplyTile[] = [];
    for (let y = 8; y <= 12; y += 1) tiles.push(settled(10, y));
    for (let x = 11; x <= 15; x += 1) for (let y = 8; y <= 12; y += 1) tiles.push(frontier(x, y));
    const reach = keys([10, 8], [10, 9], [10, 10], [10, 11], [10, 12]);
    expect(computeFrontierSupplyModel({ tiles, me: ME, reach, ...WORLD })).toEqual({ links: [], cuts: [] });
  });

  it("gives a wide block hanging on a one-tile neck a single line to its far edge, from the neck", () => {
    const tiles = [settled(10, 10), frontier(11, 10)];
    for (let x = 12; x <= 15; x += 1) for (let y = 8; y <= 12; y += 1) tiles.push(frontier(x, y));
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [11, 10]), ...WORLD });
    expect(cuts(model)).toEqual(["11,10"]);
    expect(tips(model)).toHaveLength(1);
    expect(model.links.length).toBeLessThan(20); // far fewer than one hop per beyond-reach tile
  });

  it("leaves a two-wide corridor undrawn until it narrows to one tile", () => {
    const tiles = [settled(10, 10), settled(10, 11)];
    for (let x = 11; x <= 15; x += 1) tiles.push(frontier(x, 10), frontier(x, 11));
    tiles.push(frontier(16, 10), frontier(17, 10), frontier(18, 10));
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [10, 11], [11, 10], [11, 11]), ...WORLD });
    // (16,10) is where it narrows: it alone carries everything past it.
    expect(cuts(model)).toEqual(["16,10"]);
    expect(hops(model)).toEqual(["10,10>11,10", "11,10>12,10", "12,10>13,10", "13,10>14,10", "14,10>15,10", "15,10>16,10", "16,10>17,10", "17,10>18,10"]);
  });

  it("follows the fewest-steps route back to the nearest settled tile", () => {
    // A straight snake to (16,10), plus a long detour loop hanging under it that rejoins further along.
    const tiles = [settled(10, 10)];
    for (let x = 11; x <= 16; x += 1) tiles.push(frontier(x, 10));
    tiles.push(frontier(12, 11), frontier(12, 12), frontier(13, 13), frontier(14, 13), frontier(15, 12), frontier(15, 11));
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [11, 10]), ...WORLD });
    const route: string[] = [];
    for (let at: { x: number; y: number } | undefined = { x: 16, y: 10 }; at; at = feederOf(model, at.x, at.y)) route.push(`${at.x},${at.y}`);
    expect(route).toEqual(["16,10", "15,10", "14,10", "13,10", "12,10", "11,10", "10,10"]);
  });

  it("branches at a fork: both branches end in a tip and share the one cut nearest supply", () => {
    const tiles = [settled(10, 10), frontier(11, 10), frontier(12, 10), frontier(13, 9), frontier(14, 8), frontier(13, 11), frontier(14, 12)];
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [11, 10]), ...WORLD });
    expect(tips(model).sort()).toEqual(["14,12", "14,8"]);
    expect(cuts(model)).toEqual(["11,10"]);
  });

  it("leaves a loop past reach undrawn but flags the tail hanging off it", () => {
    // Two arms out of the town that rejoin at (13,10), then a one-wide tail.
    const loop = [settled(10, 10), frontier(11, 9), frontier(12, 9), frontier(11, 11), frontier(12, 11), frontier(13, 10), frontier(14, 10), frontier(15, 10)];
    const model = computeFrontierSupplyModel({ tiles: loop, me: ME, reach: keys([10, 10]), ...WORLD });
    expect(cuts(model)).toEqual(["13,10"]);
    // The line runs back through the loop (one arm, fewest steps) to the town.
    expect(hops(model)).toHaveLength(5);
    expect(hops(model).slice(-2)).toEqual(["13,10>14,10", "14,10>15,10"]);
    expect(model.links[0]!.from).toEqual({ x: 10, y: 10 });
  });

  it("flags the other arm of a loop once an enemy takes a tile on one arm", () => {
    const loop = [settled(10, 10), frontier(11, 9), frontier(12, 9), frontier(11, 11), frontier(12, 11), frontier(13, 10), frontier(14, 10), frontier(15, 10)];
    const captured = loop.map((tile) => (tile.x === 12 && tile.y === 9 ? { ...tile, ownerId: "rival" } : tile));
    const model = computeFrontierSupplyModel({ tiles: captured, me: ME, reach: keys([10, 10]), ...WORLD });
    expect(cuts(model)).toEqual(["11,11"]);
    expect(hops(model).sort()).toEqual(["10,10>11,11", "11,11>12,11", "12,11>13,10", "13,10>14,10", "14,10>15,10"]);
  });

  it("reroutes the line around a tile an enemy takes when another route exists", () => {
    // A loop past reach, all hanging on (11,10): two routes out to the far side.
    const ring = [settled(10, 10), frontier(11, 10), frontier(12, 9), frontier(13, 9), frontier(12, 11), frontier(13, 11), frontier(14, 10), frontier(15, 10)];
    const reach = keys([10, 10], [11, 10]);
    const before = computeFrontierSupplyModel({ tiles: ring, me: ME, reach, ...WORLD });
    const routeBefore = feederOf(before, 14, 10)!;

    const captured = ring.map((tile) => (tile.x === routeBefore.x && tile.y === routeBefore.y ? { ...tile, ownerId: "rival" } : tile));
    const after = computeFrontierSupplyModel({ tiles: captured, me: ME, reach, ...WORLD });

    const routeAfter = feederOf(after, 14, 10)!;
    expect(routeAfter).toBeDefined(); // still supplied...
    expect(routeAfter.y).toBe(routeBefore.y === 9 ? 11 : 9); // ...round the other side of the loop
    expect(tips(after)).toContain("15,10");
  });

  it("still ends a line in an out-of-reach pocket that sits beside deeper in-reach frontier", () => {
    // Concave reach: (13,12) is out of reach, next to in-reach (14,13) which is one step further from supply.
    const tiles = [settled(10, 10), frontier(11, 10), frontier(12, 10), frontier(13, 10), frontier(14, 11), frontier(13, 12), frontier(14, 13)];
    const reach = keys([10, 10], [11, 10], [12, 10], [13, 10], [14, 11], [14, 13]);
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach, ...WORLD });
    expect(tips(model)).toEqual(["13,12"]);
  });

  it("doesn't put a tip where two arms of a loop meet", () => {
    const tiles = [settled(10, 10), frontier(11, 10), frontier(12, 9), frontier(12, 11), frontier(13, 10), frontier(14, 10)];
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [11, 10]), ...WORLD });
    expect(tips(model)).toEqual(["14,10"]);
  });

  it("treats an owned frontier dock as a supply source, like the simulation does", () => {
    const tiles = [frontier(50, 50, ME, { dockId: "dock-1" }), frontier(51, 50), frontier(52, 50)];
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: new Set(), ...WORLD });
    expect(hops(model)).toEqual(["50,50>51,50", "51,50>52,50"]);
  });

  it("flags land hanging on a lone frontier dock: the dock is supply, but taking it cuts that land off", () => {
    const tiles = [frontier(50, 50, ME, { dockId: "dock-1" }), frontier(51, 50)];
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: new Set(), ...WORLD });
    expect(cuts(model)).toEqual(["50,50"]);
    expect(hops(model)).toEqual(["50,50>51,50"]);
  });

  it("never marks a settled tile as the cut", () => {
    // (11,10) touches only the town tile: losing the town is a different threat from encirclement of frontier.
    const model = computeFrontierSupplyModel({ tiles: [settled(10, 10), frontier(11, 10)], me: ME, reach: keys([10, 10]), ...WORLD });
    expect(model).toEqual({ links: [], cuts: [] });
  });

  it("follows an Aether bridge link as a supply path", () => {
    const tiles = [settled(10, 10), frontier(11, 10), frontier(30, 10)];
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [11, 10]), extraLinks: [["11,10", "30,10"]], ...WORLD });
    expect(hops(model)).toEqual(["10,10>11,10", "11,10>30,10"]);
  });

  it("wraps across the world edge", () => {
    const model = computeFrontierSupplyModel({ tiles: [settled(0, 5), frontier(99, 5), frontier(98, 5)], me: ME, reach: keys([0, 5]), ...WORLD });
    expect(cuts(model)).toEqual(["99,5"]);
    expect(hops(model)).toEqual(["0,5>99,5", "99,5>98,5"]);
  });

  it("ignores other players' tiles and never paths through them", () => {
    const model = computeFrontierSupplyModel({ tiles: [settled(10, 10), frontier(11, 10, "rival"), frontier(12, 10)], me: ME, reach: keys([10, 10]), ...WORLD });
    expect(model.links).toEqual([]); // (12,10) is cut off: no supply path, so nothing to draw
  });

  it("handles a very long snake without recursion", () => {
    const model = computeFrontierSupplyModel({ tiles: snake(5_000), me: ME, reach: reachToX12, worldWidth: 10_000, worldHeight: 100 });
    expect(cuts(model)).toEqual(["11,10"]);
    expect(model.links).toHaveLength(5_000);
  });
});
