import { describe, expect, it } from "vitest";
import type { TileKey } from "@border-empires/shared";

import { createServerWorldgenClusters } from "./server-worldgen-clusters.js";

describe("resource recasting overrides", () => {
  it("prefers a recast resource over the original cluster resource", () => {
    const clusterByTile = new Map<TileKey, string>([["10,12", "cl-1"]]);
    const clustersById = new Map<string, { clusterId: string; clusterType: "CRYSTAL_BASIN"; resourceType: "GEMS"; centerX: number; centerY: number; radius: number; controlThreshold: number }>([
      ["cl-1", { clusterId: "cl-1", clusterType: "CRYSTAL_BASIN", resourceType: "GEMS", centerX: 10, centerY: 12, radius: 3, controlThreshold: 3 }]
    ]);
    const resourceOverridesByTile = new Map<TileKey, { resource: "WOOD" }>([["10,12", { resource: "WOOD" }]]);

    const { applyClusterResources } = createServerWorldgenClusters({
      clusterByTile,
      clustersById,
      resourceOverridesByTile,
      clusterTypeDefs: [],
      seeded01: () => 0,
      WORLD_WIDTH: 256,
      WORLD_HEIGHT: 256,
      clusterRuleMatch: () => false,
      clusterRuleMatchRelaxed: () => false,
      clusterTileCountForResource: () => 0,
      collectClusterTiles: () => [],
      collectClusterTilesRelaxed: () => [],
      clusterRadiusForResource: () => 0,
      key: (x, y) => `${x},${y}`,
      clusterResourceType: (cluster) => cluster.resourceType ?? "GEMS"
    });

    expect(applyClusterResources(10, 12, undefined)).toBe("WOOD");
  });
});
