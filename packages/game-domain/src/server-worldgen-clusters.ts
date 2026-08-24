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
    // FARM is drawn 10 short of the other resources (42 vs. 52): those 10
    // clusters' worth of tiles (10 * 8 = 80) offset most of the tiles added
    // by the 4-direction satellite pass below (up to 4 * 42 = 168 in the
    // worst case), so the net FARM tile increase stays small (worst case
    // ~88 tiles) instead of stacking a full new tile budget on top.
    const clusterPlan: ResourceType[] = [
      ...Array.from({ length: 42 }, (): ResourceType => "FARM"),
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

    // Satellite deposits — for every full FARM/FISH cluster, try to drop a
    // small single-tile deposit at each configured attempt offset (a
    // direction, for FARM; a coastal side, for FISH) so a player who finds
    // a cluster also finds a handful of easier "next stops" nearby rather
    // than the surrounding land/coast going dark until the next full
    // cluster. Shared between FARM and FISH below so the placement
    // mechanics (collision check, tries budget, clusterId assignment, seed
    // threading) can't drift out of sync between the two.
    const placeSatelliteDeposits = (
      resource: "FARM" | "FISH",
      attemptOffsets: Array<(center: { x: number; y: number }, attemptSeed: number, tries: number) => { x: number; y: number }>,
      triesPerAttempt: number,
      startSeed: number
    ): number => {
      const def = defByResource.get(resource);
      if (!def) return startSeed;
      const clusterCenters = [...clustersById.values()]
        .filter((cluster) => cluster.resourceType === resource)
        .map((cluster) => ({ x: cluster.centerX, y: cluster.centerY }));
      let satelliteSeed = startSeed;
      for (const center of clusterCenters) {
        for (const nextOffset of attemptOffsets) {
          let placed = false;
          for (let tries = 0; tries < triesPerAttempt && !placed; tries += 1) {
            const { x: cx, y: cy } = nextOffset(center, satelliteSeed, tries);
            const wx = ((cx % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
            const wy = ((cy % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
            const tk = key(wx, wy);
            if (clusterByTile.has(tk)) continue;
            if (!clusterRuleMatch(wx, wy, resource)) continue;
            const clusterId = `cl-${clustersById.size}`;
            clustersById.set(clusterId, {
              clusterId,
              clusterType: def.type,
              resourceType: def.resourceType,
              centerX: wx,
              centerY: wy,
              radius: 1,
              controlThreshold: def.threshold
            });
            clusterByTile.set(tk, clusterId);
            placed = true;
          }
          satelliteSeed += 251;
        }
      }
      return satelliteSeed;
    };

    // FARM: one attempt per cardinal direction, 7-11 tiles out (matches the
    // game design ask of "one in each direction") — land isn't as
    // constrained to a thin strip as coastline is, so all 4 directions are
    // worth trying independently.
    const farmDirections: Array<{ dx: number; dy: number }> = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }
    ];
    attemptSeed = placeSatelliteDeposits(
      "FARM",
      farmDirections.map(
        (direction) =>
          (center: { x: number; y: number }, satelliteSeed: number, tries: number) => {
            const dist = 7 + Math.floor(seeded01(satelliteSeed + tries * 11, satelliteSeed + tries * 13, seed + 5651) * 5);
            const jitter = Math.floor(seeded01(satelliteSeed + tries * 17, satelliteSeed + tries * 19, seed + 5661) * 3) - 1;
            return {
              x: center.x + direction.dx * dist + direction.dy * jitter,
              y: center.y + direction.dy * dist + direction.dx * jitter
            };
          }
      ),
      150,
      attemptSeed
    );

    // FISH: since FISH only spawns on thin coastal strips, fixed cardinal
    // directions (like FARM's above) would rarely land — instead, try one
    // random-angle attempt on each side of the cluster, ~10 tiles out along
    // whichever direction the coast actually runs. Up to 2 satellites * 52
    // FISH clusters = 104 tiles, which is exactly what trimming
    // clusterTileCountForResource's FISH case (8 -> 6 tiles/cluster) freed
    // up, so total FISH tile count doesn't change — it's redistributed.
    const FISH_SATELLITE_DISTANCE = 10;
    attemptSeed = placeSatelliteDeposits(
      "FISH",
      [1, -1].map(
        (side) =>
          (center: { x: number; y: number }, satelliteSeed: number, tries: number) => {
            const angle = seeded01(satelliteSeed + tries * 3, satelliteSeed + tries * 7, seed + 6101) * Math.PI;
            const dist = FISH_SATELLITE_DISTANCE + Math.floor(seeded01(satelliteSeed + tries * 11, satelliteSeed + tries * 13, seed + 6151) * 3) - 1;
            return {
              x: Math.round(center.x + side * Math.cos(angle) * dist),
              y: Math.round(center.y + side * Math.sin(angle) * dist)
            };
          }
      ),
      200,
      attemptSeed
    );

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
