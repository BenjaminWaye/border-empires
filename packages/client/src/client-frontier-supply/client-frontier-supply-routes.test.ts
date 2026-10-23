import { describe, expect, it } from "vitest";

import { computeFrontierSupplyModel, type FrontierSupplyTile } from "./client-frontier-supply.js";
import { buildSupplyRoutes } from "./client-frontier-supply-routes.js";

const ME = "me";
const settled = (x: number, y: number): FrontierSupplyTile => ({ x, y, ownerId: ME, ownershipState: "SETTLED" });
const frontier = (x: number, y: number): FrontierSupplyTile => ({ x, y, ownerId: ME, ownershipState: "FRONTIER" });
const WORLD = { worldWidth: 100, worldHeight: 100 };
const model = (tiles: FrontierSupplyTile[], reach: string[]) => computeFrontierSupplyModel({ tiles, me: ME, reach: new Set(reach), ...WORLD });

describe("buildSupplyRoutes", () => {
  it("draws an unbranched snake as one route from the settled tile to the tip", () => {
    const snake = [settled(10, 10), frontier(11, 10), frontier(12, 10), frontier(13, 10), frontier(14, 10)];
    const routes = buildSupplyRoutes(model(snake, ["10,10", "11,10"]), { ...WORLD, smoothing: 0 });
    expect(routes).toHaveLength(1);
    expect(routes[0]!.points.map((p) => [p.x, p.y, p.distance])).toEqual([[10, 10, 0], [11, 10, 1], [12, 10, 2], [13, 10, 3], [14, 10, 4]]);
  });

  it("splits at a fork into a trunk plus one route per branch, all meeting at the fork with the same distance", () => {
    const tiles = [settled(10, 10), frontier(11, 10), frontier(12, 10), frontier(13, 9), frontier(14, 9), frontier(13, 11)];
    const routes = buildSupplyRoutes(model(tiles, ["10,10", "11,10"]), { ...WORLD, smoothing: 0 });
    expect(routes).toHaveLength(3);
    const trunk = routes.find((r) => r.points[0]!.x === 10)!;
    expect(trunk.points.at(-1)).toMatchObject({ x: 12, y: 10, distance: 2 });
    const branches = routes.filter((r) => r !== trunk);
    for (const branch of branches) expect(branch.points[0]).toMatchObject({ x: 12, y: 10, distance: 2 });
  });

  it("smooths corners but keeps both ends fixed so routes still join", () => {
    const tiles = [settled(10, 10), frontier(11, 10), frontier(12, 10), frontier(13, 11), frontier(14, 11)];
    const [route] = buildSupplyRoutes(model(tiles, ["10,10", "11,10"]), { ...WORLD, smoothing: 2 });
    expect(route!.points[0]).toMatchObject({ x: 10, y: 10 });
    expect(route!.points.at(-1)).toMatchObject({ x: 14, y: 11 });
    expect(route!.points.length).toBeGreaterThan(5);
  });

  it("stays continuous across the world seam, anchored on the real first tile", () => {
    const tiles = [settled(1, 5), frontier(0, 5), frontier(99, 5), frontier(98, 5)];
    const [route] = buildSupplyRoutes(model(tiles, ["1,5", "0,5"]), { ...WORLD, smoothing: 0 });
    expect(route!.points.map((p) => p.x)).toEqual([1, 0, -1, -2]);
  });

  it("returns nothing when nothing is beyond reach", () => {
    expect(buildSupplyRoutes(model([settled(10, 10), frontier(11, 10)], ["10,10", "11,10"]), WORLD)).toEqual([]);
  });
});
