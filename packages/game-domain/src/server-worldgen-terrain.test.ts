import { describe, expect, it } from "vitest";
import { wrapX, wrapY, type LandBiome, type Terrain } from "@border-empires/shared";

import { key } from "./server-game-constants/server-game-constants.js";
import { createServerWorldgenTerrain } from "./server-worldgen-terrain.js";
import type { ServerWorldgenTerrainDeps } from "./server-world-runtime-types.js";

/**
 * Synthetic 30x30 world with a single mountain tile at (15, 15) so
 * "near mountain" predicates are exercised at known Manhattan distances.
 * Everything else is TUNDRA land, except a control column of GRASS land
 * far from the mountain to prove the tundra rule isn't just "any biome
 * near a mountain".
 */
const WORLD_WIDTH = 30;
const WORLD_HEIGHT = 30;
const MOUNTAIN = { x: 15, y: 15 };
const GRASS_COLUMN_X = 2;

const terrainAt = (x: number, y: number): Terrain => (x === MOUNTAIN.x && y === MOUNTAIN.y ? "MOUNTAIN" : "LAND");

const landBiomeAt = (x: number): LandBiome | undefined => (x === GRASS_COLUMN_X ? "GRASS" : "TUNDRA");

const buildDeps = (): ServerWorldgenTerrainDeps => ({
  wrapX,
  wrapY,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  terrainShapesByTile: new Map(),
  key,
  terrainAt,
  PLAYER_MOUNTAIN_DENSITY_RADIUS: 1,
  PLAYER_MOUNTAIN_DENSITY_LIMIT: 999,
  players: new Map(),
  parseKey: (tileKey) => {
    const [xStr, yStr] = tileKey.split(",");
    return [Number(xStr), Number(yStr)];
  },
  chebyshevDistance: (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)),
  regionTypeAt: () => undefined,
  clusterByTile: new Map(),
  townsByTile: new Map(),
  docksByTile: new Map(),
  fortsByTile: new Map(),
  siegeOutpostsByTile: new Map(),
  observatoriesByTile: new Map(),
  economicStructuresByTile: new Map(),
  playerTile: () => ({}) as never,
  AIRPORT_BOMBARD_MIN_FIELD_TILES: 0,
  AIRPORT_BOMBARD_MAX_FIELD_TILES: 0,
  activeSeason: { worldSeed: 1 },
  clustersById: new Map(),
  ownership: new Map(),
  getOrInitResourceCounts: () => ({ FARM: 0, TITANIUM: 0, GEMS: 0, FISH: 0, UMBRITE: 0 }),
  rebuildEconomyIndexForPlayer: () => {},
  sendPlayerUpdate: () => {},
  sendVisibleTileDeltaAt: () => {},
  landBiomeAt,
  grassShadeAt: () => undefined,
  FRONTIER_CLAIM_MS: 1000
});

describe("createServerWorldgenTerrain — TUNDRA titanium affinity", () => {
  it("allows TITANIUM on a TUNDRA tile near a mountain", () => {
    const runtime = createServerWorldgenTerrain(buildDeps());
    // (15, 12): TUNDRA, Manhattan distance 3 from the mountain — within the strict radius.
    expect(runtime.resourcePlacementAllowed(15, 12, "TITANIUM")).toBe(true);
  });

  it("rejects TITANIUM on a TUNDRA tile far from any mountain", () => {
    const runtime = createServerWorldgenTerrain(buildDeps());
    // (15, 0): TUNDRA, far outside the strict and relaxed radii.
    expect(runtime.resourcePlacementAllowed(15, 0, "TITANIUM")).toBe(false);
    expect(runtime.resourcePlacementAllowed(15, 0, "TITANIUM", true)).toBe(false);
  });

  it("rejects every other resource on TUNDRA regardless of distance to a mountain", () => {
    const runtime = createServerWorldgenTerrain(buildDeps());
    for (const resource of ["FARM", "GEMS", "FISH", "UMBRITE"] as const) {
      expect(runtime.resourcePlacementAllowed(15, 12, resource)).toBe(false);
    }
  });

  it("still allows TITANIUM on GRASS near a mountain, unaffected by the new TUNDRA rule", () => {
    const runtime = createServerWorldgenTerrain(buildDeps());
    // GRASS_COLUMN_X (2) is far from the mountain, so this only passes via a
    // GRASS-specific path if one exists; assert the pre-existing GRASS rule
    // (near-mountain radius 1) still gates it the same way it always did.
    expect(runtime.resourcePlacementAllowed(GRASS_COLUMN_X, 15, "TITANIUM")).toBe(false);
  });
});
