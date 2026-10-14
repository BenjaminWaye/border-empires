import { describe, expect, it } from "vitest";
import { isDockRouteVisibleForPlayer, markDockDiscovered, resolveDockSeaRoute } from "./client-dock-routes.js";

describe("resolveDockSeaRoute", () => {
  const deps = {
    dockRouteCache: new Map(),
    worldIndex: (x: number, y: number): number => y * 1000 + x,
    wrapX: (x: number): number => x,
    wrapY: (y: number): number => y
  };

  it("prefers the server-computed route when the server ships one (drift fix)", () => {
    const serverRoute = [
      { x: 5, y: 5 },
      { x: 35, y: 15 },
      { x: 60, y: 60 }
    ];
    const pair = { ax: 5, ay: 5, bx: 60, by: 60, route: serverRoute };
    const result = resolveDockSeaRoute(pair, deps);
    expect(result).toBe(serverRoute);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to client A* for older servers that omit a route", () => {
    const pair = { ax: 5, ay: 5, bx: 8, by: 5 };
    const result = resolveDockSeaRoute(pair, deps);
    expect(Array.isArray(result)).toBe(true);
  });

  it("ignores a degenerate single-point server route and falls back to A*", () => {
    const pair = { ax: 5, ay: 5, bx: 8, by: 5, route: [{ x: 5, y: 5 }] };
    const result = resolveDockSeaRoute(pair, deps);
    expect(result).not.toEqual([{ x: 5, y: 5 }]);
  });
});


describe("dock route discovery", () => {
  const pair = { ax: 10, ay: 10, bx: 50, by: 50 };
  const keyFor = (x: number, y: number): string => `${x},${y}`;

  it("does not reveal a hidden destination when selecting an enemy or ungarrisoned dock", () => {
    for (const selected of [{ x: 10, y: 10 }, { x: 50, y: 50 }]) {
      expect(isDockRouteVisibleForPlayer(pair, {
        fogDisabled: false, discoveredDockTiles: new Set([keyFor(selected.x, selected.y)]), keyFor
      })).toBe(false);
    }
  });

  it("unlocks routes when authoritative garrison vision discovers the linked dock", () => {
    const discoveredDockTiles = new Set(["10,10"]);
    const deps = { fogDisabled: false, selected: { x: 10, y: 10 }, discoveredDockTiles, keyFor };
    markDockDiscovered({ x: 50, y: 50, terrain: "LAND", dockId: "b", fogged: true }, deps);
    expect(isDockRouteVisibleForPlayer(pair, deps)).toBe(false);
    markDockDiscovered({ x: 50, y: 50, terrain: "LAND", dockId: "b" }, deps);
    expect(isDockRouteVisibleForPlayer(pair, deps)).toBe(true);
  });

  it("preserves previously discovered routes and administrative map reveal", () => {
    const deps = { fogDisabled: false, selected: undefined, discoveredDockTiles: new Set(["10,10", "50,50"]), keyFor };
    expect(isDockRouteVisibleForPlayer(pair, deps)).toBe(true);
    expect(isDockRouteVisibleForPlayer(pair, { ...deps, fogDisabled: true, discoveredDockTiles: new Set() })).toBe(true);
  });
});
