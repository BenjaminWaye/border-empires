import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { MARCH_ROUTE_CACHE_MAX, MARCH_ROUTE_CACHE_TTL_MS, marchRouteCacheSize, planMarchRoute } from "./muster-march-route-plan.js";
import { traceMarchPath } from "./muster-march-path-band.js";

const land = (x: number, y: number): DomainTileState => ({ x, y, terrain: "LAND" });

/** A 13x7 land box around a flag at (0,0) and a target at (10,0). */
const world = (): Map<string, DomainTileState> => {
  const tiles = new Map<string, DomainTileState>();
  for (let x = -1; x <= 11; x += 1) for (let y = -3; y <= 3; y += 1) tiles.set(`${x},${y}`, land(x, y));
  return tiles;
};

const plan = (tiles: Map<string, DomainTileState>, nowMs: number, target = { x: 10, y: 0 }) =>
  planMarchRoute({ tiles, playerId: "p1", flag: { x: 0, y: 0 }, target, nowMs, crossingKeysFor: () => undefined, crossingSignature: "" });

describe("planMarchRoute", () => {
  it("traces a straight path along the line to the target", () => {
    const route = plan(world(), 0);
    for (let x = 0; x <= 10; x += 1) expect(route.pathBand.has(`${x},0`)).toBe(true);
    expect(route.pathBand.has("5,2")).toBe(false);
    expect(route.walkBand.has("5,2")).toBe(true);
    expect(route.distanceToTarget(0, 0)).toBe(10);
  });

  // Regression (review): a cached route kept marching through a mountain
  // raised on its path for the rest of the cache window.
  it("re-plans at once when a tile on the cached path stops being land", () => {
    const tiles = world();
    expect(plan(tiles, 0).pathBand.has("5,0")).toBe(true);
    for (let y = -3; y <= 1; y += 1) tiles.set(`5,${y}`, { x: 5, y, terrain: "MOUNTAIN" });
    // The only way past the wall is round its end at y=2 (diagonal steps keep
    // the route 10 long), so a re-planned path's band reaches y=3 there.
    const replanned = plan(tiles, 1);
    expect(replanned.pathBand.has("5,3")).toBe(true);
  });

  it("keeps the cache bounded and sweeps expired plans", () => {
    const tiles = world();
    for (let i = 0; i < MARCH_ROUTE_CACHE_MAX + 20; i += 1) plan(tiles, 0, { x: 10, y: (i % 7) - 3 + 1000 * (i + 1) });
    expect(marchRouteCacheSize(tiles)).toBe(MARCH_ROUTE_CACHE_MAX);
    plan(tiles, MARCH_ROUTE_CACHE_TTL_MS + 1);
    expect(marchRouteCacheSize(tiles)).toBe(1);
  });
});

describe("traceMarchPath", () => {
  // Regression (review): with straight-line fallback distances (the flood
  // never reached the flag) the path ran straight over water.
  it("never steps onto impassable tiles", () => {
    const sea = new Set(["2,0", "2,1", "2,-1"]);
    const path = traceMarchPath(
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      (x, y) => Math.max(Math.abs(4 - x), Math.abs(y)),
      () => undefined,
      20,
      (x, y) => !sea.has(`${x},${y}`)
    );
    for (const key of sea) expect(path.has(key)).toBe(false);
    expect(path.has("1,0")).toBe(true);
  });
});
