// Shared stub-configuration factory for createServerWorldgenTerrain(), used
// by both worker.ts's cluster placement and worker-docks.ts's dock
// placement. Most of ServerWorldgenTerrainDeps is unrelated to either
// caller (frontier claims, town/fort/observatory economy) and is stubbed out
// the same way apps/simulation's season-seed-world.ts stubs it for its own
// test/lab worlds — factored out once here instead of duplicated per caller.
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  terrainAt,
  landBiomeAt,
  regionTypeAt,
  grassShadeAt,
  wrapX,
  wrapY,
  type TileKey
} from "@border-empires/shared";
import { createServerWorldgenTerrain, key as tileKeyOf, parseKey, type ClusterDefinition } from "@border-empires/game-domain";

export const buildLabTerrainRuntime = (
  seed: number,
  clusterByTile: Map<TileKey, string>,
  clustersById: Map<string, ClusterDefinition> = new Map()
): ReturnType<typeof createServerWorldgenTerrain> =>
  createServerWorldgenTerrain({
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
    // Unused by cluster/dock placement — stubbed only to satisfy the shared deps type.
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
    clustersById,
    ownership: new Map(),
    getOrInitResourceCounts: () => ({} as never),
    rebuildEconomyIndexForPlayer: () => {},
    sendPlayerUpdate: () => {},
    sendVisibleTileDeltaAt: () => {}
  });
