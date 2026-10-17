import { describe, expect, it } from "vitest";

import { computeFrontierSupplyModel, type FrontierSupplyTile } from "./client-frontier-supply.js";

const ME = "me";
const settled = (x: number, y: number, ownerId = ME): FrontierSupplyTile => ({ x, y, ownerId, ownershipState: "SETTLED" });
const frontier = (x: number, y: number, ownerId = ME, extra: Partial<FrontierSupplyTile> = {}): FrontierSupplyTile => ({ x, y, ownerId, ownershipState: "FRONTIER", ...extra });
const keys = (...pairs: Array<[number, number]>): Set<string> => new Set(pairs.map(([x, y]) => `${x},${y}`));
const WORLD = { worldWidth: 100, worldHeight: 100 };

/** Town at (10,10) with reach over x <= 12; a one-wide snake running east from it. */
const snake = (length: number): FrontierSupplyTile[] => [settled(10, 10), ...Array.from({ length }, (_, i) => frontier(11 + i, 10))];
const reachToX12 = keys([10, 10], [11, 10], [12, 10]);

describe("computeFrontierSupplyModel", () => {
  it("returns no links or chokepoints when every frontier tile is inside reach", () => {
    const model = computeFrontierSupplyModel({ tiles: snake(2), me: ME, reach: reachToX12, ...WORLD });
    expect(model.links).toEqual([]);
    expect(model.chokepoints.size).toBe(0);
  });

  it("draws one supply hop per beyond-reach tile, pointing away from supply, deeper hops numbered further out", () => {
    // The reported case: a long snake out of reach. Tiles 13..15 are beyond reach.
    const model = computeFrontierSupplyModel({ tiles: snake(5), me: ME, reach: reachToX12, ...WORLD });
    expect(model.links).toEqual([
      { from: { x: 12, y: 10 }, to: { x: 13, y: 10 }, depthBeyondReach: 1, fragile: true },
      { from: { x: 13, y: 10 }, to: { x: 14, y: 10 }, depthBeyondReach: 2, fragile: true },
      { from: { x: 14, y: 10 }, to: { x: 15, y: 10 }, depthBeyondReach: 3, fragile: true }
    ]);
  });

  it("marks every tile of a one-wide snake that holds up beyond-reach tiles as a chokepoint, with how many depend on it", () => {
    const model = computeFrontierSupplyModel({ tiles: snake(5), me: ME, reach: reachToX12, ...WORLD });
    // 11 and 12 are in reach but still the only link to 13..15; 15 holds nothing up.
    expect([...model.chokepoints.values()].map(({ x, dependentTiles, pinch }) => [x, dependentTiles, pinch])).toEqual([
      [11, 4, true], // where the line narrows: the only marked pinch
      [12, 3, false],
      [13, 2, false],
      [14, 1, false]
    ]);
  });

  it("drops the chokepoint when a second, parallel path exists", () => {
    const tiles = [
      settled(10, 10),
      settled(10, 11),
      frontier(11, 10), frontier(12, 10), frontier(13, 10),
      frontier(11, 11), frontier(12, 11), frontier(13, 11)
    ];
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [10, 11], [11, 10], [11, 11]), ...WORLD });
    expect(model.links.length).toBeGreaterThan(0);
    expect(model.links.every((link) => !link.fragile)).toBe(true);
    expect(model.chokepoints.size).toBe(0);
  });

  it("runs the flow along rows instead of zig-zagging diagonally when a straight step is just as short", () => {
    const tiles = [settled(10, 10), settled(10, 11)];
    for (let x = 11; x <= 15; x += 1) tiles.push(frontier(x, 10), frontier(x, 11));
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [10, 11], [11, 10], [11, 11]), ...WORLD });
    for (const link of model.links) expect(link.from.y).toBe(link.to.y);
  });

  it("treats an owned frontier dock as a supply source, like the simulation does", () => {
    const tiles = [frontier(50, 50, ME, { dockId: "dock-1" }), frontier(51, 50), frontier(52, 50)];
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: new Set(), ...WORLD });
    expect(model.links).toEqual([
      { from: { x: 50, y: 50 }, to: { x: 51, y: 50 }, depthBeyondReach: 1, fragile: false },
      { from: { x: 51, y: 50 }, to: { x: 52, y: 50 }, depthBeyondReach: 2, fragile: true }
    ]);
    expect(model.chokepoints.get("51,50")?.dependentTiles).toBe(1);
    expect(model.chokepoints.has("50,50")).toBe(false); // sources are never chokepoints
  });

  it("follows an Aether bridge link as a supply path", () => {
    const tiles = [settled(10, 10), frontier(11, 10), frontier(30, 10)];
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10], [11, 10]), extraLinks: [["11,10", "30,10"]], ...WORLD });
    expect(model.links).toEqual([{ from: { x: 11, y: 10 }, to: { x: 30, y: 10 }, depthBeyondReach: 1, fragile: true }]);
  });

  it("wraps across the world edge", () => {
    const tiles = [settled(0, 5), frontier(99, 5)];
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([0, 5]), ...WORLD });
    expect(model.links).toEqual([{ from: { x: 0, y: 5 }, to: { x: 99, y: 5 }, depthBeyondReach: 1, fragile: false }]);
  });

  it("ignores other players' tiles and never paths through them", () => {
    const tiles = [settled(10, 10), frontier(11, 10, "rival"), frontier(12, 10)];
    const model = computeFrontierSupplyModel({ tiles, me: ME, reach: keys([10, 10]), ...WORLD });
    expect(model.links).toEqual([]); // (12,10) is cut off: no supply path, so no flow to draw
  });

  it("handles a very long snake without recursion", () => {
    const model = computeFrontierSupplyModel({ tiles: snake(5_000), me: ME, reach: reachToX12, worldWidth: 10_000, worldHeight: 100 });
    expect(model.links).toHaveLength(4_998);
    expect(model.chokepoints.get("11,10")?.dependentTiles).toBe(4_999);
  });
});
