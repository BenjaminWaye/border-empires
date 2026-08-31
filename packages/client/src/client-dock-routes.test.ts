import { describe, expect, it } from "vitest";
import { resolveDockSeaRoute } from "./client-dock-routes.js";

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
