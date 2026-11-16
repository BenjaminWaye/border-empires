// Split out of worker.ts to keep it under the repo's 500-line file cap.
//
// Runs the real production cluster placement (server-worldgen-clusters.ts /
// server-worldgen-terrain.ts) against the world state setWorldSeed() just
// established, rather than re-deriving a biome-eligibility heatmap here —
// so cluster sizes, counts, and the hills-sparse UMBRITE/GEMS pass all show up
// exactly as they would in a real game. Most of ServerWorldgenTerrainDeps
// is unrelated to cluster placement (frontier claims, dock/fort/observatory
// economy) and is stubbed out the same way apps/simulation's
// season-seed-world.ts stubs it for its own test/lab worlds.
import { WORLD_WIDTH, WORLD_HEIGHT, isHillsTileAt, terrainAt, type TileKey } from "@border-empires/shared";
import {
  createServerWorldgenClusters,
  ensureStrategicClustersInReach,
  key as tileKeyOf,
  parseKey,
  type ClusterDefinition,
  type StrategicReachResult
} from "@border-empires/game-domain";
import { buildLabTerrainRuntime } from "./worker-terrain-runtime.js";

export type ResourceCounts = { fish: number; titanium: number; gems: number; farm: number; umbrite: number; layer: Uint8Array };

export type LabClusters = {
  clusterByTile: Map<TileKey, string>;
  clustersById: Map<string, ClusterDefinition>;
  terrainRuntime: ReturnType<typeof buildLabTerrainRuntime>;
};

export const placeResourceClusters = (seed: number, clusterByTile: Map<TileKey, string>): LabClusters => {
  const clustersById = new Map<string, ClusterDefinition>();
  const terrainRuntime = buildLabTerrainRuntime(seed, clusterByTile, clustersById);

  const clustersRuntime = createServerWorldgenClusters({
    clusterByTile,
    clustersById,
    clusterTypeDefs: terrainRuntime.clusterTypeDefs,
    seeded01: terrainRuntime.seeded01,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    clusterRuleMatch: (x, y, resource) => terrainRuntime.resourcePlacementAllowed(x, y, resource, false),
    clusterRuleMatchRelaxed: (x, y, resource) => terrainRuntime.resourcePlacementAllowed(x, y, resource, true),
    clusterTileCountForResource: terrainRuntime.clusterTileCountForResource,
    collectClusterTiles: terrainRuntime.collectClusterTiles,
    collectClusterTilesRelaxed: terrainRuntime.collectClusterTilesRelaxed,
    clusterRadiusForResource: terrainRuntime.clusterRadiusForResource,
    key: tileKeyOf,
    clusterResourceType: terrainRuntime.clusterResourceType
  });
  clustersRuntime.generateClusters(seed);
  return { clusterByTile, clustersById, terrainRuntime };
};

const indicesToTileMap = (indices: Uint32Array): Map<TileKey, true> => {
  const out = new Map<TileKey, true>();
  for (const flatIdx of indices) out.set(tileKeyOf(flatIdx % WORLD_WIDTH, Math.floor(flatIdx / WORLD_WIDTH)), true);
  return out;
};

// Mirrors the production refinery-reach pass (season-seed-world-strategic-
// reach.ts -> server-worldgen-strategic-reach.ts). The lab measures from its
// estimated towns (estimateTownCount: passes 1-2 only, no cluster/dock
// exclusion), so moved counts are approximate, but the placement rules are
// the real ones.
export const applyLabStrategicReach = (
  seed: number,
  clusters: LabClusters,
  townIndices: Uint32Array,
  dockSiteIndices: Uint32Array
): StrategicReachResult =>
  ensureStrategicClustersInReach(seed, {
    WORLD_WIDTH,
    WORLD_HEIGHT,
    terrainAt,
    key: tileKeyOf,
    parseKey,
    isHillsTileAt,
    clusterByTile: clusters.clusterByTile,
    clustersById: clusters.clustersById,
    townsByTile: indicesToTileMap(townIndices),
    docksByTile: indicesToTileMap(dockSiteIndices),
    habitat: clusters.terrainRuntime
  });

export const countResources = (clusters: LabClusters): ResourceCounts => {
  let fish = 0, titanium = 0, gems = 0, farm = 0, umbrite = 0;
  const layer = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  for (const [tileKey, clusterId] of clusters.clusterByTile) {
    const resourceType = clusters.clustersById.get(clusterId)?.resourceType;
    if (!resourceType) continue;
    const [x, y] = parseKey(tileKey);
    // Display priority: FISH > TITANIUM > GEMS > FARM > UMBRITE
    const code = resourceType === "FISH" ? 5 : resourceType === "TITANIUM" ? 4 : resourceType === "GEMS" ? 3 : resourceType === "FARM" ? 2 : resourceType === "UMBRITE" ? 1 : 0;
    layer[y * WORLD_WIDTH + x] = code;
    if (resourceType === "FISH") fish++;
    else if (resourceType === "TITANIUM") titanium++;
    else if (resourceType === "GEMS") gems++;
    else if (resourceType === "FARM") farm++;
    else if (resourceType === "UMBRITE") umbrite++;
  }
  return { fish, titanium, gems, farm, umbrite, layer };
};
