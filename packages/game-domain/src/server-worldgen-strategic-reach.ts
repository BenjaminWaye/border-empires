// Worldgen guarantee for refinery reach (docs/territory-development-plan.md,
// Phase 2 rule 9). Strategic clusters (TITANIUM, UMBRITE, GEMS) are placed by
// server-worldgen-clusters.ts BEFORE towns exist, so on its own nothing ties
// a deposit field to a town. This pass runs once every worldgen town is
// placed and checks EVERY strategic cluster:
//   - each of its fields (8-connected groups of its tiles) has a tile within
//     REFINERY_REACH_LAND_TILES 8-way land steps of some town, and
//   - no tile sits on a town tile, a dock tile, or within Chebyshev 2 of a
//     town (either support ring).
// A cluster that fails is cleared and re-placed with the same resource using
// the real habitat rules (resourcePlacementAllowed / collectClusterTiles,
// then the relaxed variants), keeping its cluster id. All randomness comes
// from seeded01 with a dedicated seed offset, so a seed always yields the
// same map. A cluster that cannot be re-placed stays where it was and is
// counted in the result's `failed`.
import { REFINERY_REACH_LAND_TILES, type ResourceType, type TileKey } from "@border-empires/shared";

import type { ClusterDefinition } from "./server-shared-types.js";
import type { ServerWorldgenTerrainRuntime } from "./server-world-runtime-types.js";
import {
  depositPlacementSatisfiesReach,
  forbiddenDepositMask,
  landDistanceFromTowns,
  NOT_IN_REACH,
  type StrategicReachGrid
} from "./server-worldgen-strategic-reach-geometry.js";

export const STRATEGIC_REACH_RESOURCES: ReadonlySet<ResourceType> = new Set<ResourceType>(["TITANIUM", "UMBRITE", "GEMS"]);
/** Both town support rings (Chebyshev 1 and 2) are off limits to deposits. */
export const STRATEGIC_DEPOSIT_TOWN_CLEARANCE = 2;
/** Dedicated seeded01 offset so this pass never shares a stream with another. */
export const STRATEGIC_REACH_SEED_OFFSET = 12_011;
/** Candidate spots tried per placement tier per cluster (4 tiers at most). */
export const STRATEGIC_REACH_TRIES_PER_TIER = 400;
/** Random map draws per tier; most miss the candidate mask and cost O(1). */
export const STRATEGIC_REACH_DRAWS_PER_TIER = 60_000;
/** Same centre spacing generateClusters uses for its strict pass. */
const MIN_CENTER_MANHATTAN = 9;

export type StrategicReachHabitat = Pick<
  ServerWorldgenTerrainRuntime,
  | "seeded01"
  | "resourcePlacementAllowed"
  | "collectClusterTiles"
  | "collectClusterTilesRelaxed"
  | "clusterTileCountForResource"
  | "clusterRadiusForResource"
  | "clusterResourceType"
>;

export interface StrategicReachDeps extends StrategicReachGrid {
  terrainAt: (x: number, y: number) => string;
  key: (x: number, y: number) => TileKey;
  parseKey: (tileKey: TileKey) => [number, number];
  /** Hilltop UMBRITE/GEMS singles (generateClusters' hills pass) move to another hills tile. */
  isHillsTileAt: (x: number, y: number) => boolean;
  clusterByTile: Map<TileKey, string>;
  clustersById: Map<string, ClusterDefinition>;
  townsByTile: ReadonlyMap<TileKey, unknown>;
  docksByTile: ReadonlyMap<TileKey, unknown>;
  habitat: StrategicReachHabitat;
}

export interface StrategicReachResult {
  /** Strategic clusters checked. */
  checked: number;
  /** Clusters cleared and re-placed. */
  moved: number;
  /** Clusters that failed the check and found no valid spot (left in place). */
  failed: number;
}

type Coord = { x: number; y: number };
// Tiers in order: keep the field's size (its tile count follows the biome,
// so this keeps forest Umbrite a forest field, sand Titanium a sand field)
// with generateClusters' centre spacing, then without spacing, then any size,
// then the relaxed habitat rules. Hilltop singles only move to hills tiles.
type PlacementTier = "hills" | "strict-spaced-same-size" | "strict-same-size" | "strict" | "relaxed";

export const ensureStrategicClustersInReach = (seed: number, deps: StrategicReachDeps): StrategicReachResult => {
  const { WORLD_WIDTH: width, WORLD_HEIGHT: height, key, parseKey, clusterByTile, clustersById, habitat } = deps;
  const toCoord = (tileKey: TileKey): Coord => {
    const [x, y] = parseKey(tileKey);
    return { x, y };
  };
  const towns = [...deps.townsByTile.keys()].map(toCoord);
  const docks = [...deps.docksByTile.keys()].map(toCoord);
  const isLand = (x: number, y: number): boolean => deps.terrainAt(x, y) === "LAND";
  const landDistance = landDistanceFromTowns(deps, towns, isLand, REFINERY_REACH_LAND_TILES);
  const forbidden = forbiddenDepositMask(deps, towns, docks, STRATEGIC_DEPOSIT_TOWN_CLEARANCE);
  const satisfies = (coords: ReadonlyArray<Coord>): boolean =>
    depositPlacementSatisfiesReach(deps, coords, landDistance, forbidden);

  const tilesByCluster = new Map<string, TileKey[]>();
  for (const [tileKey, clusterId] of clusterByTile) {
    const list = tilesByCluster.get(clusterId);
    if (list) list.push(tileKey);
    else tilesByCluster.set(clusterId, [tileKey]);
  }

  // Candidate centres: in-reach, allowed land tiles, as one mask per tier
  // and resource, built on first use. Draws pick random map coordinates and
  // test the mask (rather than indexing into a candidate list) so a small
  // terrain difference only affects draws that land on it instead of
  // shifting every later pick. Local to this call (bounded by the world area)
  // and dropped when it returns.
  const masksByTier = new Map<string, Uint8Array>();
  const candidateMaskFor = (tier: PlacementTier, resource: ResourceType): Uint8Array => {
    const cacheKey = tier === "hills" ? tier : `${tier === "relaxed" ? "relaxed" : "strict"}:${resource}`;
    const cached = masksByTier.get(cacheKey);
    if (cached) return cached;
    const mask = new Uint8Array(width * height);
    for (let index = 0; index < mask.length; index += 1) {
      if (landDistance[index] === NOT_IN_REACH || forbidden[index] === 1) continue;
      const x = index % width;
      const y = (index - x) / width;
      const allowed = tier === "hills" ? deps.isHillsTileAt(x, y) : habitat.resourcePlacementAllowed(x, y, resource, tier === "relaxed");
      if (allowed) mask[index] = 1;
    }
    masksByTier.set(cacheKey, mask);
    return mask;
  };

  const centreTooClose = (clusterId: string, cx: number, cy: number): boolean => {
    for (const other of clustersById.values()) {
      if (other.clusterId === clusterId) continue;
      const dx = Math.min(Math.abs(other.centerX - cx), width - Math.abs(other.centerX - cx));
      const dy = Math.min(Math.abs(other.centerY - cy), height - Math.abs(other.centerY - cy));
      if (dx + dy < MIN_CENTER_MANHATTAN) return true;
    }
    return false;
  };

  const tilesForCandidate = (tier: PlacementTier, resource: ResourceType, centre: Coord): TileKey[] => {
    const { x, y } = centre;
    if (clusterByTile.has(key(x, y))) return [];
    if (tier === "hills") return [key(x, y)];
    const count = habitat.clusterTileCountForResource(resource, x, y, seed);
    const tiles =
      tier === "relaxed"
        ? habitat.collectClusterTilesRelaxed(x, y, resource, count)
        : habitat.collectClusterTiles(x, y, resource, count);
    return tiles.length >= count ? tiles : [];
  };

  const relocate = (cluster: ClusterDefinition, resource: ResourceType, ordinal: number, originalSize: number, hillsSingle: boolean): TileKey[] | undefined => {
    const tiers: PlacementTier[] = hillsSingle ? ["hills"] : ["strict-spaced-same-size", "strict-same-size", "strict", "relaxed"];
    for (const [tierIndex, tier] of tiers.entries()) {
      const mask = candidateMaskFor(tier, resource);
      let hits = 0;
      for (let draw = 0; draw < STRATEGIC_REACH_DRAWS_PER_TIER && hits < STRATEGIC_REACH_TRIES_PER_TIER; draw += 1) {
        const a = ordinal * 97 + tierIndex * 7919 + 1;
        const x = Math.floor(habitat.seeded01(a, draw * 31 + 13, seed + STRATEGIC_REACH_SEED_OFFSET) * width);
        const y = Math.floor(habitat.seeded01(draw * 37 + 7, a, seed + STRATEGIC_REACH_SEED_OFFSET + 1) * height);
        if (mask[y * width + x] !== 1) continue;
        hits += 1;
        if (tier === "strict-spaced-same-size" && centreTooClose(cluster.clusterId, x, y)) continue;
        const tiles = tilesForCandidate(tier, resource, { x, y });
        if (tiles.length === 0 || (tier.endsWith("same-size") && tiles.length !== originalSize)) continue;
        if (!satisfies(tiles.map(toCoord))) continue;
        cluster.centerX = x;
        cluster.centerY = y;
        cluster.radius = hillsSingle ? 1 : habitat.clusterRadiusForResource(resource, x, y);
        return tiles;
      }
    }
    return undefined;
  };

  const result: StrategicReachResult = { checked: 0, moved: 0, failed: 0 };
  let ordinal = 0;
  for (const cluster of clustersById.values()) {
    const resource = habitat.clusterResourceType(cluster);
    if (!STRATEGIC_REACH_RESOURCES.has(resource)) continue;
    const tiles = tilesByCluster.get(cluster.clusterId) ?? [];
    if (tiles.length === 0) continue;
    result.checked += 1;
    ordinal += 1;
    const coords = tiles.map(toCoord);
    if (satisfies(coords)) continue;
    const hillsSingle =
      (resource === "UMBRITE" || resource === "GEMS") && coords.length === 1 && deps.isHillsTileAt(coords[0]!.x, coords[0]!.y);
    for (const tileKey of tiles) clusterByTile.delete(tileKey);
    const placed = relocate(cluster, resource, ordinal, tiles.length, hillsSingle);
    for (const tileKey of placed ?? tiles) clusterByTile.set(tileKey, cluster.clusterId);
    if (placed) result.moved += 1;
    else result.failed += 1;
  }
  return result;
};
