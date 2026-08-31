import { describe, expect, it } from "vitest";

import {
  attachDockSeaRoutes,
  computeSeaRouteWaypoints,
  finalizeSeasonWorldDocks,
  type SeaRouteTerrainReader
} from "./dock-sea-routes.js";

describe("dock sea routes (server-authoritative)", () => {
  const WORLD_WIDTH = 12;
  const WORLD_HEIGHT = 12;
  const key = (x: number, y: number): string => `${x},${y}`;
  const wrap = (n: number, size: number): number => ((n % size) + size) % size;
  const readerFor = (landTiles: Set<string>): SeaRouteTerrainReader => ({
    terrainAt: (x: number, y: number) => (landTiles.has(key(wrap(x, WORLD_WIDTH), wrap(y, WORLD_HEIGHT))) ? "LAND" : "SEA"),
    worldIndex: (x: number, y: number) => y * WORLD_WIDTH + x,
    wrapX: (x: number) => wrap(x, WORLD_WIDTH),
    wrapY: (y: number) => wrap(y, WORLD_HEIGHT),
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT
  });

  it("persists a sea route between two connected docks on the authoritative terrain", () => {
    // An open sea channel separates the two land masses, so on the world's real
    // (frozen) terrain there is an unambiguous sea path between the docks.
    const landTiles = new Set<string>(["2,4", "3,4", "2,5", "3,5", "8,4", "9,4", "8,5", "9,5"]);
    const reader = readerFor(landTiles);
    const dockById = new Map([
      ["dock-a", { dockId: "dock-a", tileKey: "3,4", pairedDockId: "dock-b" }],
      ["dock-b", { dockId: "dock-b", tileKey: "8,5", pairedDockId: "dock-a" }]
    ]);

    attachDockSeaRoutes(dockById, reader);

    const route = dockById.get("dock-a")!.routeWaypointsByLinkedDockId?.["dock-b"];
    expect(route).toBeDefined();
    expect(route!.length).toBeGreaterThanOrEqual(2);
    // The whole path must be sea on the authoritative terrain, and it must
    // span from dock-a's shoreline toward dock-b.
    for (const waypoint of route!) {
      expect(reader.terrainAt(waypoint.x, waypoint.y)).toBe("SEA");
    }
    expect(route![route!.length - 1]!.x).toBeGreaterThanOrEqual(6);
  });

  it("still emits the server route to the client when the client's drifted terrain found none", () => {
    // Regression for routeFound:false. The client's old A* ran over its own
    // procedural terrainAt(), which can drift from the frozen server terrain.
    const authoritativeLand = new Set<string>(["2,4", "3,4", "2,5", "3,5", "8,4", "9,4", "8,5", "9,5"]);
    const authoritative = readerFor(authoritativeLand);

    // Simulate a severe worldgen drift: the client came to believe the entire
    // world is land, so from the client's point of view neither dock has any
    // sea to route through and its A* returns nothing.
    const allTileKeys: string[] = [];
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) allTileKeys.push(`${x},${y}`);
    }
    const drifted = readerFor(new Set(allTileKeys));

    const authoritativeRoute = computeSeaRouteWaypoints(3, 4, 8, 5, authoritative);
    const driftedRoute = computeSeaRouteWaypoints(3, 4, 8, 5, drifted);

    expect(authoritativeRoute.length).toBeGreaterThanOrEqual(2);
    // Pre-fix the drifted terrain (still used by the client) produced no path.
    expect(driftedRoute).toHaveLength(0);

    // Post-fix the server computes from authoritative terrain and ships it, so
    // the client draws the persisted path instead of re-deriving terrain.
    const dockById = new Map([
      ["dock-a", { dockId: "dock-a", tileKey: "3,4", pairedDockId: "dock-b" }],
      ["dock-b", { dockId: "dock-b", tileKey: "8,5", pairedDockId: "dock-a" }]
    ]);
    const exported = finalizeSeasonWorldDocks(dockById, authoritative);
    const exportedRoute = exported.find((dock) => dock.dockId === "dock-a")?.routeWaypointsByLinkedDockId?.["dock-b"];
    expect(exportedRoute).toBeDefined();
    expect(exportedRoute!.length).toBeGreaterThanOrEqual(2);
  });

  it("omits route geometry for a dock with no linked neighbors", () => {
    const reader = readerFor(new Set<string>(["4,4", "5,4", "4,5", "5,5"]));
    const dockById = new Map([["solo", { dockId: "solo", tileKey: "4,4", pairedDockId: "" }]]);

    const exported = finalizeSeasonWorldDocks(dockById, reader);

    expect(exported[0]!.routeWaypointsByLinkedDockId).toBeUndefined();
  });
});
