import { isHillsTileAt, type ResourceType } from "@border-empires/shared";

import type { ServerWorldgenClustersDeps, ServerWorldgenClustersRuntime } from "./server-world-runtime-types.js";

// Hills placement for FUR/GEMS is decided purely by isHillsTileAt (which
// already implies LAND — see hills-terrain.ts), so it's kept local to this
// module instead of threading a clusterRuleMatchHills predicate through
// ServerWorldgenTerrainDeps/Runtime and both season-seed-world builders.
const isHillsSparseResource = (x: number, y: number, resource: ResourceType): boolean =>
  (resource === "FUR" || resource === "GEMS") && isHillsTileAt(x, y);

export const createServerWorldgenClusters = (deps: ServerWorldgenClustersDeps): ServerWorldgenClustersRuntime => {
  const {
    clusterByTile,
    clustersById,
    clusterTypeDefs,
    seeded01,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    clusterRuleMatch,
    clusterRuleMatchRelaxed,
    clusterTileCountForResource,
    collectClusterTiles,
    collectClusterTilesRelaxed,
    clusterRadiusForResource,
    key,
    clusterResourceType
  } = deps;

  const generateClusters = (seed: number): void => {
    clusterByTile.clear();
    clustersById.clear();
    const clusterPlan: ResourceType[] = [
      ...Array.from({ length: 52 }, (): ResourceType => "FARM"),
      ...Array.from({ length: 52 }, (): ResourceType => "FUR"),
      ...Array.from({ length: 30 }, (): ResourceType => "GEMS"),
      ...Array.from({ length: 52 }, (): ResourceType => "IRON"),
      ...Array.from({ length: 52 }, (): ResourceType => "FISH")
    ];
    const defByResource = new Map<ResourceType, (typeof clusterTypeDefs)[number]>();
    for (const def of clusterTypeDefs) defByResource.set(def.resourceType, def);

    const centers: Array<{ x: number; y: number }> = [];
    let attemptSeed = 0;
    for (const resource of clusterPlan) {
      const def = defByResource.get(resource);
      if (!def) continue;
      let placed = false;
      for (let tries = 0; tries < 5000; tries += 1) {
        const cx = Math.floor(seeded01((attemptSeed + tries) * 31, (attemptSeed + tries) * 47, seed + 101) * WORLD_WIDTH);
        const cy = Math.floor(seeded01((attemptSeed + tries) * 53, (attemptSeed + tries) * 67, seed + 151) * WORLD_HEIGHT);
        if (!clusterRuleMatch(cx, cy, resource)) continue;
        const tooClose = centers.some((center) => {
          const dx = Math.min(Math.abs(center.x - cx), WORLD_WIDTH - Math.abs(center.x - cx));
          const dy = Math.min(Math.abs(center.y - cy), WORLD_HEIGHT - Math.abs(center.y - cy));
          return dx + dy < 9;
        });
        if (tooClose) continue;
        const tileCount = clusterTileCountForResource(resource, cx, cy);
        const tiles = collectClusterTiles(cx, cy, resource, tileCount);
        if (tiles.length < tileCount) continue;
        const clusterId = `cl-${clustersById.size}`;
        clustersById.set(clusterId, {
          clusterId,
          clusterType: def.type,
          resourceType: def.resourceType,
          centerX: cx,
          centerY: cy,
          radius: clusterRadiusForResource(resource, cx, cy),
          controlThreshold: def.threshold
        });
        for (const tileKey of tiles) clusterByTile.set(tileKey, clusterId);
        centers.push({ x: cx, y: cy });
        placed = true;
        break;
      }
      attemptSeed += 911;
      if (placed) continue;
      for (let tries = 0; tries < 3500; tries += 1) {
        const cx = Math.floor(seeded01((attemptSeed + tries) * 17, (attemptSeed + tries) * 29, seed + 701) * WORLD_WIDTH);
        const cy = Math.floor(seeded01((attemptSeed + tries) * 37, (attemptSeed + tries) * 43, seed + 751) * WORLD_HEIGHT);
        if (!clusterRuleMatchRelaxed(cx, cy, resource)) continue;
        const tileCount = clusterTileCountForResource(resource, cx, cy);
        const tiles = collectClusterTilesRelaxed(cx, cy, resource, tileCount);
        if (tiles.length < tileCount) continue;
        const clusterId = `cl-${clustersById.size}`;
        clustersById.set(clusterId, {
          clusterId,
          clusterType: def.type,
          resourceType: def.resourceType,
          centerX: cx,
          centerY: cy,
          radius: clusterRadiusForResource(resource, cx, cy),
          controlThreshold: def.threshold
        });
        for (const tileKey of tiles) clusterByTile.set(tileKey, clusterId);
        break;
      }
    }

    // A handful of hilltop deposits for FUR and GEMS — 1 or 2 of each,
    // map-wide, never a full cluster. Kept as its own pass (rather than
    // folding hills into clusterRuleMatch above) so it can't accidentally
    // scale up with the main clusterPlan draw counts.
    for (const resource of ["FUR", "GEMS"] as const) {
      const def = defByResource.get(resource);
      if (!def) continue;
      const hillsCount = seeded01(attemptSeed + 41, attemptSeed + 43, seed + 9701) < 0.5 ? 1 : 2;
      let placedCount = 0;
      for (let tries = 0; tries < 6000 && placedCount < hillsCount; tries += 1) {
        const cx = Math.floor(seeded01((attemptSeed + tries) * 19, (attemptSeed + tries) * 23, seed + 9711) * WORLD_WIDTH);
        const cy = Math.floor(seeded01((attemptSeed + tries) * 29, (attemptSeed + tries) * 31, seed + 9721) * WORLD_HEIGHT);
        if (clusterByTile.has(key(cx, cy))) continue;
        if (!isHillsSparseResource(cx, cy, resource)) continue;
        const tooClose = centers.some((center) => {
          const dx = Math.min(Math.abs(center.x - cx), WORLD_WIDTH - Math.abs(center.x - cx));
          const dy = Math.min(Math.abs(center.y - cy), WORLD_HEIGHT - Math.abs(center.y - cy));
          return dx + dy < 9;
        });
        if (tooClose) continue;
        const clusterId = `cl-${clustersById.size}`;
        clustersById.set(clusterId, {
          clusterId,
          clusterType: def.type,
          resourceType: def.resourceType,
          centerX: cx,
          centerY: cy,
          radius: 1,
          controlThreshold: def.threshold
        });
        clusterByTile.set(key(cx, cy), clusterId);
        centers.push({ x: cx, y: cy });
        placedCount += 1;
      }
      attemptSeed += 1301;
    }
  };

  const applyClusterResources = (x: number, y: number, base: ResourceType | undefined): ResourceType | undefined => {
    const clusterId = clusterByTile.get(key(x, y));
    if (!clusterId) return base;
    const cluster = clustersById.get(clusterId);
    if (!cluster) return base;
    return clusterResourceType(cluster);
  };

  return {
    generateClusters,
    applyClusterResources
  };
};
