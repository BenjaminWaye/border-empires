import type { ResourceType } from "@border-empires/shared";

import type { ServerWorldgenClustersDeps, ServerWorldgenClustersRuntime } from "./server-world-runtime-types.js";

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
    // Food clusters (FARM / FISH) are no longer scattered randomly here.
    // They are placed by ensureFoodNearTowns (anchored to towns) and then
    // topped up to the map-wide target by fillFoodToTarget.
    const clusterPlan: ResourceType[] = [
      ...Array.from({ length: 52 }, (): ResourceType => "FUR"),
      ...Array.from({ length: 30 }, (): ResourceType => "GEMS"),
      ...Array.from({ length: 52 }, (): ResourceType => "IRON"),
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
  };

  // After ensureFoodNearTowns has anchored food to every town, call this to
  // top up the map-wide food cluster count to `target`. Clusters are placed
  // randomly using the same terrain rules as the main pass (FARM on grass,
  // FISH on coastal sand). Stops early if attempts are exhausted.
  const fillFoodToTarget = (seed: number, target: number): void => {
    const defByResource = new Map<ResourceType, (typeof clusterTypeDefs)[number]>();
    for (const def of clusterTypeDefs) defByResource.set(def.resourceType, def);

    const foodResources: ResourceType[] = ["FARM", "FISH"];
    const countFood = (): number => {
      let n = 0;
      for (const c of clustersById.values()) {
        if (foodResources.includes(clusterResourceType(c) as ResourceType)) n++;
      }
      return n;
    };

    let attempts = 0;
    while (countFood() < target && attempts < 20_000) {
      const resource: ResourceType = attempts % 2 === 0 ? "FARM" : "FISH";
      const def = defByResource.get(resource);
      attempts++;
      if (!def) continue;
      const cx = Math.floor(seeded01(attempts * 31, attempts * 47, seed + 8801) * WORLD_WIDTH);
      const cy = Math.floor(seeded01(attempts * 53, attempts * 67, seed + 8851) * WORLD_HEIGHT);
      if (!clusterRuleMatch(cx, cy, resource)) continue;
      const tileCount = clusterTileCountForResource(resource, cx, cy);
      const tiles = collectClusterTiles(cx, cy, resource, tileCount);
      if (tiles.length < 6) continue;
      const clusterId = `cl-${clustersById.size}`;
      clustersById.set(clusterId, {
        clusterId,
        clusterType: def.type,
        resourceType: resource,
        centerX: cx,
        centerY: cy,
        radius: clusterRadiusForResource(resource, cx, cy),
        controlThreshold: def.threshold
      });
      for (const tileKey of tiles) clusterByTile.set(tileKey, clusterId);
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
    fillFoodToTarget,
    applyClusterResources
  };
};
