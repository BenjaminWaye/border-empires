import { describe, expect, it } from "vitest";

import { computeFrontierSupplyModel, type FrontierSupplyTile } from "./client-frontier-supply.js";
import { buildSupplyRoutes } from "./client-frontier-supply-routes.js";
import { supplyPulseAt, supplyRouteWidth } from "./client-frontier-supply-style.js";

const ME = "me";
const settled = (x: number, y: number): FrontierSupplyTile => ({ x, y, ownerId: ME, ownershipState: "SETTLED" });
const frontier = (x: number, y: number): FrontierSupplyTile => ({ x, y, ownerId: ME, ownershipState: "FRONTIER" });
const WORLD = { worldWidth: 100, worldHeight: 100 };
const model = (tiles: FrontierSupplyTile[], reach: string[]) => computeFrontierSupplyModel({ tiles, me: ME, reach: new Set(reach), ...WORLD });

describe("buildSupplyRoutes", () => {
  it("draws an unbranched snake as one route from the reach edge to an arrowhead at the tip", () => {
    const snake = [settled(10, 10), frontier(11, 10), frontier(12, 10), frontier(13, 10), frontier(14, 10)];
    const routes = buildSupplyRoutes(model(snake, ["10,10", "11,10"]), { ...WORLD, smoothing: 0 });
    expect(routes).toHaveLength(1);
    const [route] = routes;
    expect(route!.endsAtTip).toBe(true);
    expect(route!.points.map((p) => [p.x, p.y, p.distance])).toEqual([[11, 10, 0], [12, 10, 1], [13, 10, 2], [14, 10, 3]]);
    // Thicker near supply (it feeds more), thinner and fainter toward the tip.
    expect(route!.points[1]!.width).toBeGreaterThan(route!.points[3]!.width);
    expect(route!.points[1]!.alpha).toBeGreaterThan(route!.points[3]!.alpha);
  });

  it("splits at a fork into a trunk plus one route per branch, all meeting at the fork", () => {
    const tiles = [settled(10, 10), frontier(11, 10), frontier(12, 10), frontier(13, 9), frontier(14, 9), frontier(13, 11)];
    const routes = buildSupplyRoutes(model(tiles, ["10,10", "11,10"]), { ...WORLD, smoothing: 0 });
    expect(routes).toHaveLength(3);
    const trunk = routes.find((r) => !r.endsAtTip)!;
    expect(trunk.points.at(-1)).toMatchObject({ x: 12, y: 10, distance: 1 });
    const branches = routes.filter((r) => r.endsAtTip);
    for (const branch of branches) expect(branch.points[0]).toMatchObject({ x: 12, y: 10, distance: 1 });
    expect(trunk.points.at(-1)!.width).toBeGreaterThan(branches[0]!.points.at(-1)!.width);
  });

  it("smooths corners but keeps both ends fixed so routes still join", () => {
    const tiles = [settled(10, 10), frontier(11, 10), frontier(12, 10), frontier(13, 11), frontier(14, 11)];
    const [route] = buildSupplyRoutes(model(tiles, ["10,10", "11,10"]), { ...WORLD, smoothing: 2 });
    expect(route!.points[0]).toMatchObject({ x: 11, y: 10 });
    expect(route!.points.at(-1)).toMatchObject({ x: 14, y: 11 });
    expect(route!.points.length).toBeGreaterThan(5);
  });

  it("stays continuous across the world seam, anchored on the real first tile", () => {
    const tiles = [settled(1, 5), frontier(0, 5), frontier(99, 5), frontier(98, 5)];
    const [route] = buildSupplyRoutes(model(tiles, ["1,5", "0,5"]), { ...WORLD, smoothing: 0 });
    expect(route!.points.map((p) => p.x)).toEqual([0, -1, -2]);
  });

  it("returns nothing when nothing is beyond reach", () => {
    expect(buildSupplyRoutes(model([settled(10, 10), frontier(11, 10)], ["10,10", "11,10"]), WORLD)).toEqual([]);
  });
});

describe("supply route style", () => {
  it("moves pulses outward, away from supply, with the bright head in front of its tail", () => {
    // Find a pulse head at t=0, then check it has moved to a larger distance a moment later.
    const brightestAt = (nowMs: number): number => {
      let best = 0;
      let bestDistance = 0;
      for (let d = 0; d < 2.4; d += 0.01) {
        const v = supplyPulseAt(d, nowMs);
        if (v > best) { best = v; bestDistance = d; }
      }
      return bestDistance;
    };
    const head0 = brightestAt(0);
    // 0.2s at 1.2 tiles/s: about 0.24 tiles further out (measured round the 2.4-tile pulse spacing).
    const moved = (brightestAt(200) - head0 + 2.4) % 2.4;
    expect(moved).toBeCloseTo(0.24, 1);
    // The tail glows behind the head (toward supply), not ahead of it.
    expect(supplyPulseAt(head0 - 0.3, 0)).toBeGreaterThan(supplyPulseAt(head0 + 0.3, 0));
  });

  it("thickens routes with how much land they feed, up to a cap", () => {
    expect(supplyRouteWidth(1)).toBeLessThan(supplyRouteWidth(4));
    expect(supplyRouteWidth(10_000)).toBe(0.3);
  });
});
