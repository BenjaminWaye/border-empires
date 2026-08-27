// Split out of worker.ts to keep it under the repo's 500-line file cap.
//
// Calls the real production dock generator (server-worldgen-docks.ts) — no
// longer a "lab approximation" that fabricated one marker per significant
// island (see the removed dockCount/dockSiteIndices fields that used to live
// on countIslands() in worker.ts). This runs the actual island/mainland dock
// placement, including small islands and multi-dock large islands, exactly
// as season-seed-world.ts does, so the lab's dock markers reflect real
// generation for every land component that touches sea, regardless of size.
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  terrainAt,
  landBiomeAt,
  regionTypeAt,
  grassShadeAt,
  wrapX,
  wrapY,
  type Dock,
  type TileKey
} from "@border-empires/shared";
import {
  createServerWorldgenDocks,
  createServerWorldgenTerrain,
  key as tileKeyOf,
  parseKey
} from "@border-empires/game-domain";

const LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD = 250;

export const placeDocks = (seed: number, clusterByTile: Map<TileKey, string>): { dockCount: number; dockSiteIndices: Uint32Array } => {
  const terrainRuntime = createServerWorldgenTerrain({
    wrapX,
    wrapY,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    terrainShapesByTile: new Map(),
    key: tileKeyOf,
    terrainAt,
    PLAYER_MOUNTAIN_DENSITY_RADIUS: 1,
    PLAYER_MOUNTAIN_DENSITY_LIMIT: 1,
    players: new Map(),
    parseKey,
    chebyshevDistance: () => 0,
    regionTypeAt,
    clusterByTile,
    landBiomeAt,
    grassShadeAt,
    FRONTIER_CLAIM_MS: 0,
    townsByTile: new Map(),
    docksByTile: new Map(),
    fortsByTile: new Map(),
    siegeOutpostsByTile: new Map(),
    observatoriesByTile: new Map(),
    economicStructuresByTile: new Map(),
    playerTile: () => ({ x: 0, y: 0, terrain: "SEA", lastChangedAt: 0 }),
    AIRPORT_BOMBARD_MIN_FIELD_TILES: 2,
    AIRPORT_BOMBARD_MAX_FIELD_TILES: 4,
    activeSeason: { worldSeed: seed },
    clustersById: new Map(),
    ownership: new Map(),
    getOrInitResourceCounts: () => ({} as never),
    rebuildEconomyIndexForPlayer: () => {},
    sendPlayerUpdate: () => {},
    sendVisibleTileDeltaAt: () => {}
  });

  const docksByTile = new Map<TileKey, Dock>();
  const dockById = new Map<string, Dock>();
  const docksRuntime = createServerWorldgenDocks({
    seeded01: terrainRuntime.seeded01,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    key: tileKeyOf,
    wrapX,
    wrapY,
    worldIndex: (x, y) => y * WORLD_WIDTH + x,
    terrainAt,
    adjacentOceanSea: terrainRuntime.adjacentOceanSea,
    largestSeaComponentMask: terrainRuntime.largestSeaComponentMask,
    clusterByTile,
    LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD,
    docksByTile,
    dockById,
    getDockLinkedTileKeysByDockTileKey: () => new Map()
  });
  docksRuntime.generateDocks(seed);

  const dockSiteIndices = Uint32Array.from(
    [...docksByTile.keys()].map((tileKey) => {
      const [x, y] = parseKey(tileKey);
      return y * WORLD_WIDTH + x;
    })
  );
  return { dockCount: dockById.size, dockSiteIndices };
};
