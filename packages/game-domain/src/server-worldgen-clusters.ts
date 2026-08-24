import { isHillsTileAt, type ResourceType } from "@border-empires/shared";

import type { ServerWorldgenClustersDeps, ServerWorldgenClustersRuntime } from "./server-world-runtime-types.js";

// Hills placement for UMBRITE/GEMS is decided purely by isHillsTileAt (which
// already implies LAND — see hills-terrain.ts), so it's kept local to this
// module instead of threading a clusterRuleMatchHills predicate through
// ServerWorldgenTerrainDeps/Runtime and both season-seed-world builders.
const isHillsSparseResource = (x: number, y: number, resource: ResourceType): boolean =>
  (resource === "UMBRITE" || resource === "GEMS") && isHillsTileAt(x, y);

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
      ...Array.from({ length: 52 }, (): ResourceType => "UMBRITE"),
      ...Array.from({ length: 30 }, (): ResourceType => "GEMS"),
      ...Array.from({ length: 52 }, (): ResourceType => "TITANIUM"),
      ...Array.from({ length: 52 }, (): ResourceType => "FISH")
    ];
    const defByResource = new Map<ResourceType, (typeof clusterTypeDefs)[number]>();
    for (const def of clusterTypeDefs) defByResource.set(def.resourceType, def);

    const centers: Array<{ x: number; y: number }> = [];
    const tooCloseToExistingCenter = (cx: number, cy: number): boolean =>
      centers.some((center) => {
        const dx = Math.min(Math.abs(center.x - cx), WORLD_WIDTH - Math.abs(center.x - cx));
        const dy = Math.min(Math.abs(center.y - cy), WORLD_HEIGHT - Math.abs(center.y - cy));
        return dx + dy < 9;
      });
    let attemptSeed = 0;
    for (const resource of clusterPlan) {
      const def = defByResource.get(resource);
      if (!def) continue;
      let placed = false;
      for (let tries = 0; tries < 5000; tries += 1) {
        const cx = Math.floor(seeded01((attemptSeed + tries) * 31, (attemptSeed + tries) * 47, seed + 101) * WORLD_WIDTH);
        const cy = Math.floor(seeded01((attemptSeed + tries) * 53, (attemptSeed + tries) * 67, seed + 151) * WORLD_HEIGHT);
        if (!clusterRuleMatch(cx, cy, resource)) continue;
        if (tooCloseToExistingCenter(cx, cy)) continue;
        const tileCount = clusterTileCountForResource(resource, cx, cy, seed);
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
        const tileCount = clusterTileCountForResource(resource, cx, cy, seed);
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

    // Stepping-stone FARM deposits — small single-tile finds scattered
    // between the sparse full FARM clusters (52 across the whole map) so
    // players crossing open land run into food along the way instead of
    // only at the rare full clusters. Uses a tighter min-distance
    // (dx+dy < 4 vs. 9 for full clusters) so these can sit closer to each
    // other and to full clusters, and is capped well below the full
    // clusterPlan count so it can't be mistaken for one. FISH doesn't use
    // this pass — coastline is too thin a strip for a free scatter to
    // reliably land on, so it gets a per-cluster satellite pass below
    // instead.
    {
      const def = defByResource.get("FARM");
      if (def) {
        const steppingStoneCount = 24;
        const steppingStones: Array<{ x: number; y: number }> = [];
        const tooCloseToSteppingStone = (cx: number, cy: number): boolean =>
          steppingStones.some((stone) => {
            const dx = Math.min(Math.abs(stone.x - cx), WORLD_WIDTH - Math.abs(stone.x - cx));
            const dy = Math.min(Math.abs(stone.y - cy), WORLD_HEIGHT - Math.abs(stone.y - cy));
            return dx + dy < 4;
          });
        let placedCount = 0;
        for (let tries = 0; tries < 8000 && placedCount < steppingStoneCount; tries += 1) {
          const cx = Math.floor(seeded01((attemptSeed + tries) * 13, (attemptSeed + tries) * 59, seed + 5501) * WORLD_WIDTH);
          const cy = Math.floor(seeded01((attemptSeed + tries) * 61, (attemptSeed + tries) * 71, seed + 5551) * WORLD_HEIGHT);
          const tk = key(cx, cy);
          if (clusterByTile.has(tk)) continue;
          if (!clusterRuleMatch(cx, cy, "FARM")) continue;
          if (tooCloseToExistingCenter(cx, cy)) continue;
          if (tooCloseToSteppingStone(cx, cy)) continue;
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
          clusterByTile.set(tk, clusterId);
          steppingStones.push({ x: cx, y: cy });
          placedCount += 1;
        }
        attemptSeed += 1601;
      }
    }

    // FISH satellite deposits — since FISH only spawns on thin coastal
    // strips, a free-scatter pass (like FARM's above) would rarely land.
    // Instead, for every full FISH cluster, try to drop one small
    // single-tile deposit on each side, roughly SATELLITE_DISTANCE tiles
    // out along the coast, so a player who finds a fish cluster also finds
    // a couple of easier "next stops" nearby rather than the coast going
    // dark until the next full cluster.
    {
      const fishDef = defByResource.get("FISH");
      if (fishDef) {
        const fishClusterCenters = [...clustersById.values()]
          .filter((cluster) => cluster.resourceType === "FISH")
          .map((cluster) => ({ x: cluster.centerX, y: cluster.centerY }));
        const SATELLITE_DISTANCE = 10;
        let satelliteSeed = attemptSeed;
        for (const center of fishClusterCenters) {
          for (const side of [1, -1] as const) {
            let placed = false;
            for (let tries = 0; tries < 200 && !placed; tries += 1) {
              const angle = seeded01(satelliteSeed + tries * 3, satelliteSeed + tries * 7, seed + 6101) * Math.PI;
              const dist = SATELLITE_DISTANCE + Math.floor(seeded01(satelliteSeed + tries * 11, satelliteSeed + tries * 13, seed + 6151) * 3) - 1;
              const cx = Math.round(center.x + side * Math.cos(angle) * dist);
              const cy = Math.round(center.y + side * Math.sin(angle) * dist);
              const wx = ((cx % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
              const wy = ((cy % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
              const tk = key(wx, wy);
              if (clusterByTile.has(tk)) continue;
              if (!clusterRuleMatch(wx, wy, "FISH")) continue;
              const clusterId = `cl-${clustersById.size}`;
              clustersById.set(clusterId, {
                clusterId,
                clusterType: fishDef.type,
                resourceType: fishDef.resourceType,
                centerX: wx,
                centerY: wy,
                radius: 1,
                controlThreshold: fishDef.threshold
              });
              clusterByTile.set(tk, clusterId);
              placed = true;
            }
            satelliteSeed += 251;
          }
        }
        attemptSeed = satelliteSeed;
      }
    }

    // A handful of hilltop deposits for UMBRITE and GEMS — 1 or 2 of each,
    // map-wide, never a full cluster. Kept as its own pass (rather than
    // folding hills into clusterRuleMatch above) so it can't accidentally
    // scale up with the main clusterPlan draw counts.
    for (const resource of ["UMBRITE", "GEMS"] as const) {
      const def = defByResource.get(resource);
      if (!def) continue;
      const hillsCount = seeded01(attemptSeed + 41, attemptSeed + 43, seed + 9701) < 0.5 ? 1 : 2;
      let placedCount = 0;
      for (let tries = 0; tries < 6000 && placedCount < hillsCount; tries += 1) {
        const cx = Math.floor(seeded01((attemptSeed + tries) * 19, (attemptSeed + tries) * 23, seed + 9711) * WORLD_WIDTH);
        const cy = Math.floor(seeded01((attemptSeed + tries) * 29, (attemptSeed + tries) * 31, seed + 9721) * WORLD_HEIGHT);
        if (clusterByTile.has(key(cx, cy))) continue;
        if (!isHillsSparseResource(cx, cy, resource)) continue;
        if (tooCloseToExistingCenter(cx, cy)) continue;
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
