import { describe, expect, it } from "vitest";
import type { ResourceType, TileKey } from "@border-empires/shared";

import { key } from "./server-game-constants/server-game-constants.js";
import { createServerWorldgenClusters } from "./server-worldgen-clusters.js";
import type { ClusterDefinition, ClusterTypeDefinition } from "./server-shared-types.js";

/**
 * All-GRASS-LIGHT/all-COASTAL synthetic world (every tile matches both the
 * FARM and FISH cluster rules) at production world scale (see WORLD_WIDTH/
 * WORLD_HEIGHT in packages/shared/src/config.ts) so the sparse full-cluster
 * placement doesn't saturate the map the way it would on a small test grid.
 * This isolates the stepping-stone/satellite placement logic under test
 * from terrain/biome gating, which is covered separately in
 * server-worldgen-terrain.test.ts.
 */
const WORLD_WIDTH = 450;
const WORLD_HEIGHT = 450;

const clusterTypeDefs: ClusterTypeDefinition[] = [
  { type: "FERTILE_PLAINS", resourceType: "FARM", threshold: 3 },
  { type: "TITANIUM_HILLS", resourceType: "TITANIUM", threshold: 3 },
  { type: "CRYSTAL_BASIN", resourceType: "GEMS", threshold: 3 },
  { type: "HORSE_STEPPES", resourceType: "UMBRITE", threshold: 3 },
  { type: "COASTAL_SHOALS", resourceType: "FISH", threshold: 3 }
];

const buildDeps = () => {
  const clusterByTile = new Map<TileKey, string>();
  const clustersById = new Map<string, ClusterDefinition>();
  return {
    clusterByTile,
    clustersById,
    clusterTypeDefs,
    // Mirrors the production seeded01 in server-worldgen-terrain.ts: the
    // `% 100000` keeps sin()'s argument small so precision doesn't
    // degrade for the large attemptSeed values worldgen accumulates
    // across ~240 cluster placements.
    seeded01: (a: number, b: number, seed: number): number => {
      const n = Math.sin((a * 12.9898 + b * 78.233 + seed * 43758.5453) % 100000) * 43758.5453123;
      return n - Math.floor(n);
    },
    WORLD_WIDTH,
    WORLD_HEIGHT,
    // Every tile matches FARM and FISH; GEMS/TITANIUM/UMBRITE never match,
    // so this world exercises the FARM stepping-stone pass and the FISH
    // satellite pass without full clusters of other resources crowding it.
    clusterRuleMatch: (_x: number, _y: number, resource: ResourceType): boolean => resource === "FARM" || resource === "FISH",
    clusterRuleMatchRelaxed: (_x: number, _y: number, resource: ResourceType): boolean => resource === "FARM" || resource === "FISH",
    clusterTileCountForResource: (): number => 8,
    collectClusterTiles: (cx: number, cy: number, resource: ResourceType, count: number): TileKey[] => {
      if (resource !== "FARM" && resource !== "FISH") return [];
      const out: TileKey[] = [];
      for (let i = 0; i < count; i += 1) {
        const tk = key(cx + i, cy);
        if (clusterByTile.has(tk)) return [];
        out.push(tk);
      }
      return out;
    },
    collectClusterTilesRelaxed: (cx: number, cy: number, resource: ResourceType, count: number): TileKey[] => {
      if (resource !== "FARM" && resource !== "FISH") return [];
      const out: TileKey[] = [];
      for (let i = 0; i < count; i += 1) {
        const tk = key(cx + i, cy);
        if (clusterByTile.has(tk)) return [];
        out.push(tk);
      }
      return out;
    },
    clusterRadiusForResource: (): number => 2,
    key,
    clusterResourceType: (cluster: ClusterDefinition): ResourceType => cluster.resourceType ?? "GEMS"
  };
};

describe("createServerWorldgenClusters — food findability", () => {
  it("scatters extra small single-tile FARM deposits beyond the full FARM clusters", () => {
    const deps = buildDeps();
    createServerWorldgenClusters(deps).generateClusters(7);

    const farmSteppingStones = [...deps.clustersById.values()].filter(
      (cluster) => cluster.resourceType === "FARM" && cluster.radius === 1
    );
    expect(farmSteppingStones.length).toBeGreaterThan(0);
  });

  it("places FISH satellite deposits near existing FISH clusters, not scattered map-wide", () => {
    const deps = buildDeps();
    createServerWorldgenClusters(deps).generateClusters(7);

    const fishClusters = [...deps.clustersById.values()].filter((cluster) => cluster.resourceType === "FISH");
    const fullFishClusters = fishClusters.filter((cluster) => cluster.radius > 1);
    const satellites = fishClusters.filter((cluster) => cluster.radius === 1);
    expect(satellites.length).toBeGreaterThan(0);

    for (const satellite of satellites) {
      const nearestFullClusterDistance = Math.min(
        ...fullFishClusters.map((full) => {
          const dx = Math.min(Math.abs(full.centerX - satellite.centerX), WORLD_WIDTH - Math.abs(full.centerX - satellite.centerX));
          const dy = Math.min(Math.abs(full.centerY - satellite.centerY), WORLD_HEIGHT - Math.abs(full.centerY - satellite.centerY));
          return dx + dy;
        })
      );
      // Satellites target ~10 tiles from their parent cluster's center;
      // allow slack for the angle/radius jitter and Chebyshev-vs-Manhattan
      // distance skew, while still proving they aren't scattered map-wide.
      expect(nearestFullClusterDistance).toBeLessThan(20);
    }
  });

  it("keeps every deposit's own center tile pointing back at its own cluster id", () => {
    const deps = buildDeps();
    createServerWorldgenClusters(deps).generateClusters(7);

    for (const cluster of deps.clustersById.values()) {
      expect(deps.clusterByTile.get(key(cluster.centerX, cluster.centerY))).toBe(cluster.clusterId);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const depsA = buildDeps();
    createServerWorldgenClusters(depsA).generateClusters(99);
    const depsB = buildDeps();
    createServerWorldgenClusters(depsB).generateClusters(99);

    expect([...depsA.clusterByTile.entries()]).toEqual([...depsB.clusterByTile.entries()]);
  });
});
