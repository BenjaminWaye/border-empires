import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import {
  computeLocalReachSet,
  filterReachToLand,
  traceReachBoundaryEdgeLoops,
  type ReachBoundaryDeps,
  type TileCoord
} from "./client-reach-overlay.js";

const GRID = 40;
const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrap = (v: number): number => ((v % GRID) + GRID) % GRID;

/** Every (x,y) in an inclusive rectangle. */
const rect = (x0: number, y0: number, x1: number, y1: number): TileCoord[] => {
  const out: TileCoord[] = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) out.push({ x, y });
  }
  return out;
};

const toReach = (coords: TileCoord[]): Set<string> => new Set(coords.map((c) => keyFor(c.x, c.y)));

describe("computeLocalReachSet", () => {
  it("projects a DOCK_REACH_RADIUS bubble around an owned dock tile using only dockId, not the heavy dock detail payload", () => {
    // Mirrors the server's gatherReachAnchors (runtime.ts), which only ever
    // checks that the tile is an owned dock-registry tile -- it has no
    // concept of `tile.dock`'s full economic-detail payload
    // (goldPerMinute/modifiers/etc.), which the client only populates once
    // it's fetched full detail for that specific tile. Gating on that
    // object instead of `dockId` silently dropped almost every real dock
    // anchor, since most map tiles never get full detail fetched.
    const tiles = new Map<string, Tile>([
      [keyFor(5, 5), { x: 5, y: 5, terrain: "LAND", ownerId: "me", dockId: "dock-1" } as unknown as Tile]
    ]);
    const reach = computeLocalReachSet(tiles, "me");
    // DOCK_REACH_RADIUS = 1 -- the dock tile itself plus its 8 neighbours.
    expect(reach.has(keyFor(5, 5))).toBe(true);
    expect(reach.has(keyFor(6, 5))).toBe(true);
    expect(reach.has(keyFor(4, 4))).toBe(true);
    expect(reach.has(keyFor(7, 5))).toBe(false);
  });

  it("does not require ownershipState SETTLED for a dock anchor (dock reach is deliberately ungated, matching the server)", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(5, 5), { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", dockId: "dock-1" } as unknown as Tile]
    ]);
    const reach = computeLocalReachSet(tiles, "me");
    expect(reach.has(keyFor(5, 5))).toBe(true);
  });

  it("projects a TOWN_REACH_RADIUS disk around a settled town tile", () => {
    const tiles = new Map<string, Tile>([
      [
        keyFor(10, 10),
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT" }
        } as unknown as Tile
      ]
    ]);
    const reach = computeLocalReachSet(tiles, "me");
    // TOWN_REACH_RADIUS = 3
    expect(reach.has(keyFor(13, 10))).toBe(true);
    expect(reach.has(keyFor(14, 10))).toBe(false);
  });

  it("projects a town anchor using only the lightweight townType field, not the heavy town detail payload", () => {
    // Same detail-payload-vs-lightweight-reference bug the dock anchor had:
    // `tile.town` (name/goldPerMinute/population/etc.) is only populated
    // once the client fetches full detail for that specific tile -- most
    // map tiles never do, including a player's own town if it hasn't been
    // recently viewed. `townType` is the lightweight reference always
    // present regardless of detail level. Gating on `tile.town` alone
    // silently zeroed out the single most common reach anchor.
    const tiles = new Map<string, Tile>([
      [
        keyFor(10, 10),
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          townType: "FARMING"
        } as unknown as Tile
      ]
    ]);
    const reach = computeLocalReachSet(tiles, "me");
    expect(reach.has(keyFor(13, 10))).toBe(true);
    expect(reach.has(keyFor(14, 10))).toBe(false);
  });

  it("does not cross a known water gap to reach land on the far side within radius", () => {
    // Mirrors the server's land-gating (packages/shared/src/reach/reach.ts):
    // a town's disk must not flood across water it has actually seen to
    // reach land beyond it, even within TOWN_REACH_RADIUS. The whole
    // radius-3 box around the town is populated as known tiles (a full sea
    // band at y=11..12 across every x in range) -- an unloaded tile defaults
    // to "assume land" (see computeLocalReachSet's isLand), so leaving gaps
    // in this synthetic map would let the BFS route around the water
    // through unexplored ground instead of actually being blocked by it.
    const tiles = new Map<string, Tile>([
      [
        keyFor(10, 10),
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT" }
        } as unknown as Tile
      ]
    ]);
    for (let x = 7; x <= 13; x += 1) {
      for (const y of [11, 12]) tiles.set(keyFor(x, y), { x, y, terrain: "SEA" } as unknown as Tile);
    }
    tiles.set(keyFor(10, 13), { x: 10, y: 13, terrain: "LAND" } as unknown as Tile);
    const reach = computeLocalReachSet(tiles, "me");
    // Coastal edge: the water tile directly touching the town is still included.
    expect(reach.has(keyFor(10, 11))).toBe(true);
    // The water band must not be a stepping-stone onto land beyond it.
    expect(reach.has(keyFor(10, 12))).toBe(false);
    expect(reach.has(keyFor(10, 13))).toBe(false);
  });
});

describe("filterReachToLand", () => {
  const makeTerrainTile = (x: number, y: number, terrain: "LAND" | "SEA" | "COASTAL_SEA"): Tile =>
    ({ x, y, terrain }) as unknown as Tile;

  it("drops SEA and COASTAL_SEA tiles from the reach set", () => {
    const coords = rect(0, 0, 4, 4);
    const tiles = new Map<string, Tile>();
    for (const { x, y } of coords) {
      const terrain = x === 4 ? "SEA" : y === 4 ? "COASTAL_SEA" : "LAND";
      tiles.set(keyFor(x, y), makeTerrainTile(x, y, terrain));
    }
    const reach = toReach(coords);
    const filtered = filterReachToLand(reach, tiles, keyFor);
    for (const { x, y } of coords) {
      const isWater = x === 4 || y === 4;
      expect(filtered.has(keyFor(x, y))).toBe(!isWater);
    }
  });

  it("keeps a tile that was never a water tile", () => {
    const coords = rect(0, 0, 2, 2);
    const tiles = new Map<string, Tile>();
    for (const { x, y } of coords) tiles.set(keyFor(x, y), makeTerrainTile(x, y, "LAND"));
    const reach = toReach(coords);
    const filtered = filterReachToLand(reach, tiles, keyFor);
    expect(filtered.size).toBe(coords.length);
  });

  it("keeps a reach tile the client hasn't visually revealed yet (absent from the local tile map)", () => {
    // Regression: a Relay Beacon's authoritative server-granted reach disk
    // can extend past the player's current fog-of-war vision. Iterating
    // `tiles.values()` (the client's local, fog-limited cache) instead of
    // the `reach` set itself silently excluded every such unseen tile from
    // the overlay entirely -- not just from land-filtering, but from ever
    // being considered at all.
    const coords = rect(0, 0, 4, 4);
    const tiles = new Map<string, Tile>();
    // Only the tiles the player has actually seen exist in the local cache.
    for (const { x, y } of rect(0, 0, 2, 4)) tiles.set(keyFor(x, y), makeTerrainTile(x, y, "LAND"));
    const reach = toReach(coords);
    const filtered = filterReachToLand(reach, tiles, keyFor);
    expect(filtered.size).toBe(coords.length);
  });

  it("a coastal reach square's traced boundary hugs the shoreline instead of the raw disk edge", () => {
    // A 0..6 square where the entire southern half (y >= 4) is open sea --
    // simulates a coastal town whose reach radius geometrically extends
    // past the shore. Without filtering, the traced loop would run along
    // grid line y=7 (the raw edge of the reach disk, out over open water);
    // filtered, it should hug the y=4 grid line (the actual coastline)
    // instead -- the corner sitting exactly on the land/sea edge, not out
    // over the water tiles themselves.
    const coords = rect(0, 0, 6, 6);
    const tiles = new Map<string, Tile>();
    for (const { x, y } of coords) tiles.set(keyFor(x, y), makeTerrainTile(x, y, y >= 4 ? "SEA" : "LAND"));
    const reach = toReach(coords);
    const filtered = filterReachToLand(reach, tiles, keyFor);
    const deps: ReachBoundaryDeps = { tiles, keyFor, wrapX: wrap, wrapY: wrap };
    const loops = traceReachBoundaryEdgeLoops(filtered, deps);
    const allY = loops.flat().map((c) => c.y);
    expect(Math.max(...allY)).toBeLessThanOrEqual(4);
  });
});
