import type { ResourceType, TileKey } from "@border-empires/shared";

import type { ClusterDefinition } from "./server-shared-types.js";
import type {
  ClusterTypeDefinition,
  ServerWorldgenTerrainDeps,
  ServerWorldgenTerrainRuntime
} from "./server-world-runtime-types.js";

export const createServerWorldgenTerrain = (deps: ServerWorldgenTerrainDeps): ServerWorldgenTerrainRuntime => {
  const {
    wrapX,
    wrapY,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    terrainShapesByTile,
    key,
    terrainAt,
    PLAYER_MOUNTAIN_DENSITY_RADIUS,
    PLAYER_MOUNTAIN_DENSITY_LIMIT,
    players,
    parseKey,
    chebyshevDistance,
    regionTypeAt,
    clusterByTile,
    townsByTile,
    docksByTile,
    fortsByTile,
    siegeOutpostsByTile,
    observatoriesByTile,
    economicStructuresByTile,
    playerTile,
    AIRPORT_BOMBARD_MIN_FIELD_TILES,
    AIRPORT_BOMBARD_MAX_FIELD_TILES,
    activeSeason,
    clustersById,
    ownership,
    getOrInitResourceCounts,
    rebuildEconomyIndexForPlayer,
    sendPlayerUpdate,
    sendVisibleTileDeltaAt,
    landBiomeAt,
    grassShadeAt,
    FRONTIER_CLAIM_MS
  } = deps;

  const seeded01 = (x: number, y: number, seed: number): number => {
    const n = Math.sin((x * 12.9898 + y * 78.233 + seed * 43758.5453) % 100000) * 43758.5453123;
    return n - Math.floor(n);
  };

  const terrainAtRuntime = (x: number, y: number): "LAND" | "SEA" | "MOUNTAIN" => {
    const wx = wrapX(x, WORLD_WIDTH);
    const wy = wrapY(y, WORLD_HEIGHT);
    return terrainShapesByTile.get(key(wx, wy))?.terrain ?? terrainAt(wx, wy);
  };

  const terrainShapeWithinPlayerDensity = (x: number, y: number): boolean => {
    let count = 0;
    for (let dy = -PLAYER_MOUNTAIN_DENSITY_RADIUS; dy <= PLAYER_MOUNTAIN_DENSITY_RADIUS; dy += 1) {
      for (let dx = -PLAYER_MOUNTAIN_DENSITY_RADIUS; dx <= PLAYER_MOUNTAIN_DENSITY_RADIUS; dx += 1) {
        const tk = key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
        const shape = terrainShapesByTile.get(tk);
        if (shape?.terrain === "MOUNTAIN" && shape.createdByPlayer) count += 1;
        if (count >= PLAYER_MOUNTAIN_DENSITY_LIMIT) return false;
      }
    }
    return true;
  };

  const hasOwnedLandWithinRange = (playerId: string, x: number, y: number, range: number): boolean => {
    for (const tk of players.get(playerId)?.territoryTiles ?? []) {
      const [tx, ty] = parseKey(tk);
      if (terrainAtRuntime(tx, ty) !== "LAND") continue;
      if (chebyshevDistance(tx, ty, x, y) <= range) return true;
    }
    return false;
  };

  const regionTypeAtLocal = (x: number, y: number) => (terrainAt(x, y) === "LAND" ? regionTypeAt(x, y) : undefined);

  const isAdjacentTile = (ax: number, ay: number, bx: number, by: number): boolean => {
    const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
    const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
    return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
  };

  const isCoastalLand = (x: number, y: number): boolean => {
    if (terrainAt(x, y) !== "LAND") return false;
    const neighbors = [
      terrainAt(wrapX(x, WORLD_WIDTH), wrapY(y - 1, WORLD_HEIGHT)),
      terrainAt(wrapX(x + 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)),
      terrainAt(wrapX(x, WORLD_WIDTH), wrapY(y + 1, WORLD_HEIGHT)),
      terrainAt(wrapX(x - 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT))
    ];
    return neighbors.includes("SEA");
  };

  const worldIndex = (x: number, y: number): number => y * WORLD_WIDTH + x;

  const largestSeaComponentMask = (): Uint8Array => {
    const total = WORLD_WIDTH * WORLD_HEIGHT;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let largest: number[] = [];

    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        const startIdx = worldIndex(x, y);
        if (visited[startIdx] || terrainAt(x, y) !== "SEA") continue;
        let head = 0;
        let tail = 0;
        const component: number[] = [];
        visited[startIdx] = 1;
        queue[tail++] = startIdx;

        while (head < tail) {
          const idx = queue[head++]!;
          component.push(idx);
          const cx = idx % WORLD_WIDTH;
          const cy = Math.floor(idx / WORLD_WIDTH);
          const neighbors: Array<[number, number]> = [
            [wrapX(cx, WORLD_WIDTH), wrapY(cy - 1, WORLD_HEIGHT)],
            [wrapX(cx + 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)],
            [wrapX(cx, WORLD_WIDTH), wrapY(cy + 1, WORLD_HEIGHT)],
            [wrapX(cx - 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)]
          ];
          for (const [nx, ny] of neighbors) {
            const nIdx = worldIndex(nx, ny);
            if (visited[nIdx] || terrainAt(nx, ny) !== "SEA") continue;
            visited[nIdx] = 1;
            queue[tail++] = nIdx;
          }
        }

        if (component.length > largest.length) largest = component;
      }
    }

    const ocean = new Uint8Array(total);
    for (const idx of largest) ocean[idx] = 1;
    return ocean;
  };

  const adjacentOceanSea = (x: number, y: number, oceanMask: Uint8Array): { x: number; y: number } | undefined => {
    const neighbors: Array<[number, number]> = [
      [wrapX(x, WORLD_WIDTH), wrapY(y - 1, WORLD_HEIGHT)],
      [wrapX(x + 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)],
      [wrapX(x, WORLD_WIDTH), wrapY(y + 1, WORLD_HEIGHT)],
      [wrapX(x - 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)]
    ];
    for (const [nx, ny] of neighbors) {
      if (terrainAt(nx, ny) !== "SEA") continue;
      if (!oceanMask[worldIndex(nx, ny)]) continue;
      return { x: nx, y: ny };
    }
    return undefined;
  };

  const clusterTypeDefs: ClusterTypeDefinition[] = [
    { type: "FERTILE_PLAINS", resourceType: "FARM", threshold: 3 },
    { type: "IRON_HILLS", resourceType: "IRON", threshold: 3 },
    { type: "CRYSTAL_BASIN", resourceType: "GEMS", threshold: 3 },
    { type: "HORSE_STEPPES", resourceType: "FUR", threshold: 3 },
    { type: "COASTAL_SHOALS", resourceType: "FISH", threshold: 3 }
  ];

  const clusterResourceType = (cluster: ClusterDefinition): ResourceType => {
    if (cluster.resourceType) return cluster.resourceType;
    if (cluster.clusterType === "FERTILE_PLAINS") return "FARM";
    if (cluster.clusterType === "IRON_HILLS") return "IRON";
    if (cluster.clusterType === "CRYSTAL_BASIN") return "GEMS";
    if (cluster.clusterType === "HORSE_STEPPES") return "FUR";
    if (cluster.clusterType === "COASTAL_SHOALS") return "FISH";
    if (cluster.clusterType === "OIL_FIELD") return "OIL";
    return "GEMS";
  };

  const discoverOilFieldNearAirport = (ownerId: string, airportTileKey: TileKey): TileKey[] => {
    const [ax, ay] = parseKey(airportTileKey);
    const candidateKeys: TileKey[] = [];
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const x = wrapX(ax + dx, WORLD_WIDTH);
        const y = wrapY(ay + dy, WORLD_HEIGHT);
        const tk = key(x, y);
        if (terrainAtRuntime(x, y) !== "LAND") continue;
        if (clusterByTile.has(tk) || townsByTile.has(tk) || docksByTile.has(tk)) continue;
        if (fortsByTile.has(tk) || siegeOutpostsByTile.has(tk) || observatoriesByTile.has(tk) || economicStructuresByTile.has(tk)) continue;
        candidateKeys.push(tk);
      }
    }
    candidateKeys.sort((left, right) => {
      const leftTile = playerTile(...parseKey(left));
      const rightTile = playerTile(...parseKey(right));
      const leftScore = leftTile.ownerId === ownerId && leftTile.ownershipState === "SETTLED" ? 0 : leftTile.ownerId === ownerId ? 1 : 2;
      const rightScore = rightTile.ownerId === ownerId && rightTile.ownershipState === "SETTLED" ? 0 : rightTile.ownerId === ownerId ? 1 : 2;
      return leftScore - rightScore;
    });

    const desiredCount =
      AIRPORT_BOMBARD_MIN_FIELD_TILES +
      Math.floor(seeded01(ax, ay, activeSeason.worldSeed + 811) * (AIRPORT_BOMBARD_MAX_FIELD_TILES - AIRPORT_BOMBARD_MIN_FIELD_TILES + 1));
    const candidateSet = new Set(candidateKeys);
    const selected: TileKey[] = [];

    for (const start of candidateKeys) {
      if (selected.length >= desiredCount) break;
      if (selected.includes(start)) continue;
      const queue = [start];
      const visited = new Set<string>([start]);
      while (queue.length > 0 && selected.length < desiredCount) {
        const current = queue.shift()!;
        if (!selected.includes(current)) selected.push(current);
        const [cx, cy] = parseKey(current);
        for (let ny = cy - 1; ny <= cy + 1; ny += 1) {
          for (let nx = cx - 1; nx <= cx + 1; nx += 1) {
            const neighborKey = key(wrapX(nx, WORLD_WIDTH), wrapY(ny, WORLD_HEIGHT));
            if (!candidateSet.has(neighborKey) || visited.has(neighborKey)) continue;
            visited.add(neighborKey);
            queue.push(neighborKey);
          }
        }
      }
      if (selected.length >= AIRPORT_BOMBARD_MIN_FIELD_TILES) break;
    }

    if (selected.length < AIRPORT_BOMBARD_MIN_FIELD_TILES) return [];
    const clusterId = `oil-${crypto.randomUUID()}`;
    clustersById.set(clusterId, {
      clusterId,
      clusterType: "OIL_FIELD",
      resourceType: "OIL",
      centerX: ax,
      centerY: ay,
      radius: 1,
      controlThreshold: 2
    });
    const affectedOwners = new Set<string>();
    for (const tk of selected) {
      clusterByTile.set(tk, clusterId);
      const owner = ownership.get(tk);
      if (!owner) continue;
      getOrInitResourceCounts(owner).OIL = (getOrInitResourceCounts(owner).OIL ?? 0) + 1;
      affectedOwners.add(owner);
    }
    for (const affectedOwner of affectedOwners) {
      rebuildEconomyIndexForPlayer(affectedOwner);
      const player = players.get(affectedOwner);
      if (player) sendPlayerUpdate(player, 0);
    }
    for (const tk of selected) {
      const [x, y] = parseKey(tk);
      sendVisibleTileDeltaAt(x, y);
    }
    return selected;
  };

  const isNearMountain = (x: number, y: number, r = 4): boolean => {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > r) continue;
        const wx = wrapX(x + dx, WORLD_WIDTH);
        const wy = wrapY(y + dy, WORLD_HEIGHT);
        if (terrainAt(wx, wy) === "MOUNTAIN") return true;
      }
    }
    return false;
  };

  const isGrassIronTile = (x: number, y: number, relaxed = false): boolean =>
    terrainAt(x, y) === "LAND" && landBiomeAt(x, y) === "GRASS" && isNearMountain(x, y, relaxed ? 2 : 1);

  const clusterRuleMatch = (x: number, y: number, resource: ResourceType): boolean => {
    if (terrainAt(x, y) !== "LAND") return false;
    const biome = landBiomeAt(x, y);
    const shade = grassShadeAt(x, y);
    const region = regionTypeAtLocal(x, y);
    if (resource === "FISH") return biome === "COASTAL_SAND";
    if (resource === "IRON") return (biome === "SAND" && isNearMountain(x, y, 4)) || isGrassIronTile(x, y);
    if (resource === "GEMS") return biome === "SAND";
    if (resource === "FARM") return biome === "GRASS" && shade === "LIGHT";
    if (resource === "FUR") return !isCoastalLand(x, y) && ((biome === "GRASS" && shade === "DARK" && region === "DEEP_FOREST") || biome === "SAND");
    return false;
  };

  const clusterRuleMatchRelaxed = (x: number, y: number, resource: ResourceType): boolean => {
    if (terrainAt(x, y) !== "LAND") return false;
    const biome = landBiomeAt(x, y);
    const shade = grassShadeAt(x, y);
    if (resource === "FISH") return biome === "COASTAL_SAND";
    if (resource === "IRON") return (biome === "SAND" && isNearMountain(x, y, 5)) || isGrassIronTile(x, y, true);
    if (resource === "GEMS") return biome === "SAND";
    if (resource === "FARM") return biome === "GRASS";
    if (resource === "FUR") return biome === "SAND" || (biome === "GRASS" && shade === "DARK");
    return false;
  };

  const resourcePlacementAllowed = (x: number, y: number, resource: ResourceType, relaxed = false): boolean =>
    relaxed ? clusterRuleMatchRelaxed(x, y, resource) : clusterRuleMatch(x, y, resource);

  const isForestFrontierTile = (x: number, y: number): boolean =>
    terrainAt(x, y) === "LAND" && landBiomeAt(x, y) === "GRASS" && grassShadeAt(x, y) === "DARK";

  const FOREST_FRONTIER_CLAIM_MULT = 4;
  const FOREST_SETTLEMENT_MULT = 2;

  const frontierClaimDurationMsAt = (x: number, y: number): number =>
    isForestFrontierTile(x, y) ? FRONTIER_CLAIM_MS * FOREST_FRONTIER_CLAIM_MULT : FRONTIER_CLAIM_MS;

  const nearestLandTiles = (
    originX: number,
    originY: number,
    candidates: Array<{ x: number; y: number }>,
    limit: number,
    predicate?: (tile: { x: number; y: number }) => boolean
  ): TileKey[] =>
    candidates
      .filter((tile) => (predicate ? predicate(tile) : true))
      .sort((a, b) => {
        const adx = Math.min(Math.abs(a.x - originX), WORLD_WIDTH - Math.abs(a.x - originX));
        const ady = Math.min(Math.abs(a.y - originY), WORLD_HEIGHT - Math.abs(a.y - originY));
        const bdx = Math.min(Math.abs(b.x - originX), WORLD_WIDTH - Math.abs(b.x - originX));
        const bdy = Math.min(Math.abs(b.y - originY), WORLD_HEIGHT - Math.abs(b.y - originY));
        return adx + ady - (bdx + bdy);
      })
      .slice(0, limit)
      .map((tile) => key(tile.x, tile.y));

  const collectClusterTiles = (cx: number, cy: number, resource: ResourceType, count: number): TileKey[] => {
    const out: TileKey[] = [];
    const queue: Array<{ x: number; y: number; d: number }> = [{ x: cx, y: cy, d: 0 }];
    const seen = new Set<string>([key(cx, cy)]);
    const maxDist = resource === "IRON" && landBiomeAt(cx, cy) === "GRASS" ? 3 : 5;
    while (queue.length > 0 && out.length < count) {
      const current = queue.shift()!;
      if (current.d > maxDist) continue;
      const wx = wrapX(current.x, WORLD_WIDTH);
      const wy = wrapY(current.y, WORLD_HEIGHT);
      const tk = key(wx, wy);
      if (!clusterByTile.has(tk) && clusterRuleMatch(wx, wy, resource)) out.push(tk);
      for (const [nx, ny] of [[current.x, current.y - 1], [current.x + 1, current.y], [current.x, current.y + 1], [current.x - 1, current.y]] as const) {
        const nwx = wrapX(nx, WORLD_WIDTH);
        const nwy = wrapY(ny, WORLD_HEIGHT);
        const nk = key(nwx, nwy);
        if (seen.has(nk)) continue;
        seen.add(nk);
        queue.push({ x: nwx, y: nwy, d: current.d + 1 });
      }
    }
    return out.length >= count ? out.slice(0, count) : [];
  };

  const collectClusterTilesRelaxed = (cx: number, cy: number, resource: ResourceType, count: number): TileKey[] => {
    const out: TileKey[] = [];
    const queue: Array<{ x: number; y: number; d: number }> = [{ x: cx, y: cy, d: 0 }];
    const seen = new Set<string>([key(cx, cy)]);
    const maxDist = resource === "IRON" && landBiomeAt(cx, cy) === "GRASS" ? 4 : 6;
    while (queue.length > 0 && out.length < count) {
      const current = queue.shift()!;
      if (current.d > maxDist) continue;
      const wx = wrapX(current.x, WORLD_WIDTH);
      const wy = wrapY(current.y, WORLD_HEIGHT);
      const tk = key(wx, wy);
      if (!clusterByTile.has(tk) && clusterRuleMatchRelaxed(wx, wy, resource)) out.push(tk);
      for (const [nx, ny] of [[current.x, current.y - 1], [current.x + 1, current.y], [current.x, current.y + 1], [current.x - 1, current.y]] as const) {
        const nwx = wrapX(nx, WORLD_WIDTH);
        const nwy = wrapY(ny, WORLD_HEIGHT);
        const nk = key(nwx, nwy);
        if (seen.has(nk)) continue;
        seen.add(nk);
        queue.push({ x: nwx, y: nwy, d: current.d + 1 });
      }
    }
    return out.length >= count ? out.slice(0, count) : [];
  };

  const clusterTileCountForResource = (resource: ResourceType, x: number, y: number): number => {
    if (resource === "FUR" && landBiomeAt(x, y) === "SAND") return 4;
    if (resource === "IRON" && landBiomeAt(x, y) === "GRASS") return 4;
    return 8;
  };

  const clusterRadiusForResource = (resource: ResourceType, x: number, y: number): number => {
    if (resource === "FUR" && landBiomeAt(x, y) === "SAND") return 2;
    if (resource === "IRON" && landBiomeAt(x, y) === "GRASS") return 2;
    return 3;
  };

  return {
    seeded01,
    terrainAtRuntime,
    terrainShapeWithinPlayerDensity,
    hasOwnedLandWithinRange,
    regionTypeAtLocal,
    isAdjacentTile,
    isCoastalLand,
    largestSeaComponentMask,
    adjacentOceanSea,
    clusterTypeDefs,
    clusterResourceType,
    discoverOilFieldNearAirport,
    isNearMountain,
    resourcePlacementAllowed,
    isForestFrontierTile,
    FOREST_SETTLEMENT_MULT,
    frontierClaimDurationMsAt,
    nearestLandTiles,
    collectClusterTiles,
    collectClusterTilesRelaxed,
    clusterTileCountForResource,
    clusterRadiusForResource
  };
};
