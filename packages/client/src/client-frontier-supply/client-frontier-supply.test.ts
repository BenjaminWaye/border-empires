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
const feederOf = (model: FrontierSupplyModel, x: number, y: number) => model.links.find((link) => link.to.x === x && link.to.y === y)?.from;

describe("computeFrontierSupplyModel", () => {
  it("draws nothing when every frontier tile is inside reach", () => {
    expect(computeFrontierSupplyModel({ tiles: snake(2), me: ME, reach: reachToX12, ...WORLD }).links).toEqual([]);
  });

  it("draws a snake past reach as one line from the reach edge to its tip, fed thickest near supply", () => {
    // The reported case: a long snake out of reach. Tiles 13..15 are beyond reach.
    const model = computeFrontierSupplyModel({ tiles: snake(5), me: ME, reach: reachToX12, ...WORLD });
    expect(model.links).toEqual([
      { from: { x: 12, y: 10 }, to: { x: 13, y: 10 }, depthBeyondReach: 1, downstream: 3, tip: false },
      { from: { x: 13, y: 10 }, to: { x: 14, y: 10 }, depthBeyondReach: 2, downstream: 2, tip: false },
      { from: { x: 14, y: 10 }, to: { x: 15, y: 10 }, depthBeyondReach: 3, downstream: 1, tip: true }
    ]);
  });

  it("only draws lines out to tips, so a wide block past reach gets one line to its far edge instead of one into every tile", () => {
    // A 4x5 block of frontier past reach, fed from the middle of its west side.
    const tiles = [settled(10, 10), frontier(11, 10)];
    for (let x = 12; x <= 15; x += 1) for (let y = 8; y <= 12; y += 1) tiles.push(frontier(x, y));
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [11, 10]), ...WORLD });
    expect(model.links.length).toBeLessThan(20); // far fewer than one hop per beyond-reach tile
    expect(tips(model)).toHaveLength(1);
    // The line still carries everything it feeds, so it draws thick.
    expect(model.links.find((link) => link.from.x === 11)?.downstream).toBe(20);
  });

  it("gives a two-wide corridor one line to its end, not one per row", () => {
    const tiles = [settled(10, 10), settled(10, 11)];
    for (let x = 11; x <= 15; x += 1) tiles.push(frontier(x, 10), frontier(x, 11));
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [10, 11], [11, 10], [11, 11]), ...WORLD });
    expect(tips(model)).toHaveLength(1);
    expect(hops(model)).toHaveLength(4); // 11 -> 12 -> 13 -> 14 -> 15 along one row
    for (const link of model.links) expect(link.from.y).toBe(link.to.y); // straight along the row, not zig-zagging
  });

  it("follows the fewest-steps route back to supply", () => {
    // A straight snake to (16,10), plus a long detour loop hanging under it that rejoins further along.
    const tiles = [settled(10, 10)];
    for (let x = 11; x <= 16; x += 1) tiles.push(frontier(x, 10));
    tiles.push(frontier(12, 11), frontier(12, 12), frontier(13, 13), frontier(14, 13), frontier(15, 12), frontier(15, 11));
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [11, 10]), ...WORLD });
    const route: string[] = [];
    for (let at: { x: number; y: number } | undefined = { x: 16, y: 10 }; at; at = feederOf(model, at.x, at.y)) route.push(`${at.x},${at.y}`);
    expect(route).toEqual(["16,10", "15,10", "14,10", "13,10", "12,10", "11,10"]);
  });

  it("branches at a fork: the trunk carries both branches and each branch ends in a tip", () => {
    const tiles = [settled(10, 10), frontier(11, 10), frontier(12, 10), frontier(13, 9), frontier(14, 8), frontier(13, 11), frontier(14, 12)];
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [11, 10]), ...WORLD });
    expect(tips(model).sort()).toEqual(["14,12", "14,8"]);
    expect(model.links.find((link) => link.to.x === 12)?.downstream).toBe(5);
  });

  it("reroutes the line around a tile an enemy takes when another route exists", () => {
    // A loop past reach: two routes out to the far side.
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

  it("doesn't put an arrowhead where two arms of a loop meet", () => {
    const tiles = [settled(10, 10), frontier(11, 10), frontier(12, 9), frontier(12, 11), frontier(13, 10), frontier(14, 10)];
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [11, 10]), ...WORLD });
    expect(tips(model)).toEqual(["14,10"]);
  });

  it("treats an owned frontier dock as a supply source, like the simulation does", () => {
    const tiles = [frontier(50, 50, ME, { dockId: "dock-1" }), frontier(51, 50), frontier(52, 50)];
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: new Set(), ...WORLD });
    expect(hops(model)).toEqual(["50,50>51,50", "51,50>52,50"]);
  });

  it("follows an Aether bridge link as a supply path", () => {
    const tiles = [settled(10, 10), frontier(11, 10), frontier(30, 10)];
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [11, 10]), extraLinks: [["11,10", "30,10"]], ...WORLD });
    expect(hops(model)).toEqual(["11,10>30,10"]);
  });

  it("wraps across the world edge", () => {
    const model = computeFrontierSupplyModel({ tiles: [settled(0, 5), frontier(99, 5)], me: ME, reach: keys([0, 5]), ...WORLD });
    expect(hops(model)).toEqual(["0,5>99,5"]);
  });

  it("ignores other players' tiles and never paths through them", () => {
    const model = computeFrontierSupplyModel({ tiles: [settled(10, 10), frontier(11, 10, "rival"), frontier(12, 10)], me: ME, reach: keys([10, 10]), ...WORLD });
    expect(model.links).toEqual([]); // (12,10) is cut off: no supply path, so no flow to draw
  });

  it("handles a very long snake without recursion", () => {
    const model = computeFrontierSupplyModel({ tiles: snake(5_000), me: ME, reach: reachToX12, worldWidth: 10_000, worldHeight: 100 });
    expect(model.links).toHaveLength(4_998);
  });
});
