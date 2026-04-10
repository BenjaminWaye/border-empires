import type { ResourceType, TileKey } from "@border-empires/shared";

import type { ServerWorldgenTownsDeps, ServerWorldgenTownsRuntime } from "./server-world-runtime-types.js";

export const createServerWorldgenTowns = (deps: ServerWorldgenTownsDeps): ServerWorldgenTownsRuntime => {
  const {
    seeded01,
    regionTypeAtLocal,
    landBiomeAt,
    activeSeason,
    townsByTile,
    firstSpecialSiteCaptureClaimed,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    terrainAt,
    key,
    docksByTile,
    clusterByTile,
    POPULATION_MAX,
    POPULATION_TOWN_MIN,
    now,
    wrapX,
    wrapY,
    parseKey,
    ownership,
    players,
    assignMissingTownNames,
    getIslandMap,
    WORLD_TOWN_POPULATION_MIN,
    WORLD_TOWN_POPULATION_START_SPREAD,
    nearestLandTiles,
    resourcePlacementAllowed,
    clustersById,
    clusterResourceType
  } = deps;

  const initialTownPopulationAt = (x: number, y: number, seed: number): number =>
    WORLD_TOWN_POPULATION_MIN + Math.floor(seeded01(x, y, seed + 9601) * WORLD_TOWN_POPULATION_START_SPREAD);

  const townTypeAt = (x: number, y: number): "MARKET" | "FARMING" => {
    const region = regionTypeAtLocal(x, y);
    if (region === "FERTILE_PLAINS") return seeded01(x, y, activeSeason.worldSeed + 881) > 0.2 ? "FARMING" : "MARKET";
    if (region === "ANCIENT_HEARTLAND" || region === "CRYSTAL_WASTES") return "MARKET";
    if (region === "BROKEN_HIGHLANDS") return seeded01(x, y, activeSeason.worldSeed + 884) > 0.72 ? "FARMING" : "MARKET";
    return landBiomeAt(x, y) === "GRASS" && seeded01(x, y, activeSeason.worldSeed + 882) <= 0.7 ? "FARMING" : "MARKET";
  };

  const generateTowns = (seed: number): void => {
    townsByTile.clear();
    firstSpecialSiteCaptureClaimed.clear();
    const worldScale = (WORLD_WIDTH * WORLD_HEIGHT) / 1_000_000;
    const target = Math.max(70, Math.floor(180 * worldScale));
    const minSpacing = Math.max(5, Math.floor(Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.018));
    const placed: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < 120_000 && placed.length < target; index += 1) {
      const x = Math.floor(seeded01(index * 13, index * 17, seed + 9301) * WORLD_WIDTH);
      const y = Math.floor(seeded01(index * 19, index * 23, seed + 9311) * WORLD_HEIGHT);
      if (terrainAt(x, y) !== "LAND") continue;
      const tileKey = key(x, y);
      if (docksByTile.has(tileKey) || clusterByTile.has(tileKey)) continue;
      const tooClose = placed.some((entry) => {
        const dx = Math.min(Math.abs(entry.x - x), WORLD_WIDTH - Math.abs(entry.x - x));
        const dy = Math.min(Math.abs(entry.y - y), WORLD_HEIGHT - Math.abs(entry.y - y));
        return dx + dy < minSpacing;
      });
      if (tooClose) continue;
      placed.push({ x, y });
      townsByTile.set(tileKey, {
        townId: `town-${townsByTile.size}`,
        tileKey,
        type: townTypeAt(x, y),
        population: initialTownPopulationAt(x, y, seed),
        maxPopulation: POPULATION_MAX,
        connectedTownCount: 0,
        connectedTownBonus: 0,
        lastGrowthTickAt: now()
      });
    }
  };

  const canPlaceTownAt = (x: number, y: number, ignoreTileKey?: TileKey): boolean => {
    const tileKey = key(x, y);
    return terrainAt(x, y) === "LAND" && (tileKey === ignoreTileKey || !townsByTile.has(tileKey)) && !docksByTile.has(tileKey) && !clusterByTile.has(tileKey);
  };

  const findNearestTownPlacement = (originX: number, originY: number, ignoreTileKey?: TileKey): TileKey | undefined => {
    if (canPlaceTownAt(originX, originY, ignoreTileKey)) return key(originX, originY);
    const maxRadius = Math.max(WORLD_WIDTH, WORLD_HEIGHT);
    for (let radius = 1; radius <= maxRadius; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = wrapX(originX + dx, WORLD_WIDTH);
          const y = wrapX(originY + dy, WORLD_HEIGHT);
          if (canPlaceTownAt(x, y, ignoreTileKey)) return key(x, y);
        }
      }
    }
    return undefined;
  };

  const townPlacementsNeedNormalization = (): boolean => {
    const seen = new Set<string>();
    for (const town of townsByTile.values()) {
      if (seen.has(town.tileKey)) return true;
      seen.add(town.tileKey);
      const [x, y] = parseKey(town.tileKey);
      if (!canPlaceTownAt(x, y, town.tileKey)) return true;
    }
    return false;
  };

  const normalizeTownPlacements = (): void => {
    const existing = [...townsByTile.values()];
    townsByTile.clear();
    for (const town of existing) {
      const [x, y] = parseKey(town.tileKey);
      const destinationKey = findNearestTownPlacement(x, y, town.tileKey);
      if (!destinationKey) continue;
      const [destX, destY] = parseKey(destinationKey);
      townsByTile.set(destinationKey, { ...town, tileKey: destinationKey, type: townTypeAt(destX, destY) });
    }
  };

  const normalizeLegacySettlementTowns = (): void => {
    for (const town of townsByTile.values()) {
      if (town.isSettlement !== undefined) continue;
      if (town.population >= POPULATION_TOWN_MIN) continue;
      const ownerId = ownership.get(town.tileKey);
      const owner = ownerId ? players.get(ownerId) : undefined;
      if (owner && owner.capitalTileKey === town.tileKey) {
        town.isSettlement = true;
      } else {
        const [x, y] = parseKey(town.tileKey);
        town.population = initialTownPopulationAt(x, y, activeSeason.worldSeed);
      }
    }
  };

  const assignMissingTownNamesForWorld = (): void => assignMissingTownNames(townsByTile.values(), getIslandMap().islandIdByTile, activeSeason.worldSeed);

  const ensureBaselineEconomyCoverage = (seed: number): void => {
    for (let by = 0; by < WORLD_HEIGHT; by += 30) {
      for (let bx = 0; bx < WORLD_WIDTH; bx += 30) {
        const land: Array<{ x: number; y: number }> = [];
        let hasTown = false;
        let hasFood = false;
        for (let dy = 0; dy < 30; dy += 1) {
          for (let dx = 0; dx < 30; dx += 1) {
            const x = wrapX(bx + dx, WORLD_WIDTH);
            const y = wrapY(by + dy, WORLD_HEIGHT);
            if (terrainAt(x, y) !== "LAND") continue;
            const tileKey = key(x, y);
            land.push({ x, y });
            if (townsByTile.has(tileKey)) hasTown = true;
            const clusterId = clusterByTile.get(tileKey);
            const cluster = clusterId ? clustersById.get(clusterId) : undefined;
            if (cluster && ["FARM", "FISH"].includes(clusterResourceType(cluster))) hasFood = true;
          }
        }
        if (land.length === 0) continue;
        if (!hasTown) {
          const picked = land.find((tile) => !docksByTile.has(key(tile.x, tile.y)) && !clusterByTile.has(key(tile.x, tile.y)) && !townsByTile.has(key(tile.x, tile.y)));
          if (picked) {
            townsByTile.set(key(picked.x, picked.y), { townId: `town-${townsByTile.size}`, tileKey: key(picked.x, picked.y), type: townTypeAt(picked.x, picked.y), population: initialTownPopulationAt(picked.x, picked.y, seed), maxPopulation: POPULATION_MAX, connectedTownCount: 0, connectedTownBonus: 0, lastGrowthTickAt: now() });
          }
        }
        if (hasFood) continue;
        const center = land[Math.floor(seeded01(bx + 3, by + 7, seed + 9501) * land.length)]!;
        const pickFoodTiles = (resource: ResourceType, relaxed: boolean): TileKey[] =>
          nearestLandTiles(center.x, center.y, land, 8, (tile: { x: number; y: number }) => {
            const tileKey = key(tile.x, tile.y);
            if (clusterByTile.has(tileKey) || docksByTile.has(tileKey) || townsByTile.has(tileKey)) return false;
            return resourcePlacementAllowed(tile.x, tile.y, resource, relaxed);
          });
        let resourceType: ResourceType | undefined;
        let foodTiles = pickFoodTiles("FARM", false);
        if (foodTiles.length >= 6) resourceType = "FARM";
        else {
          foodTiles = pickFoodTiles("FISH", false);
          if (foodTiles.length >= 6) resourceType = "FISH";
        }
        if (!resourceType) {
          foodTiles = pickFoodTiles("FARM", true);
          if (foodTiles.length >= 6) resourceType = "FARM";
          else {
            foodTiles = pickFoodTiles("FISH", true);
            if (foodTiles.length >= 6) resourceType = "FISH";
          }
        }
        if (foodTiles.length >= 6) {
          const clusterId = `cl-${clustersById.size}`;
          clustersById.set(clusterId, { clusterId, clusterType: resourceType === "FISH" ? "COASTAL_SHOALS" : "FERTILE_PLAINS", resourceType: resourceType ?? "FARM", centerX: center.x, centerY: center.y, radius: 3, controlThreshold: 3 });
          for (const tileKey of foodTiles) clusterByTile.set(tileKey, clusterId);
        }
      }
    }
  };

  const ensureInterestCoverage = (seed: number): void => {
    for (let by = 0; by < WORLD_HEIGHT; by += 15) {
      for (let bx = 0; bx < WORLD_WIDTH; bx += 15) {
        const land: Array<{ x: number; y: number }> = [];
        let interesting = false;
        for (let dy = 0; dy < 15; dy += 1) {
          for (let dx = 0; dx < 15; dx += 1) {
            const x = wrapX(bx + dx, WORLD_WIDTH);
            const y = wrapY(by + dy, WORLD_HEIGHT);
            if (terrainAt(x, y) !== "LAND") continue;
            const tileKey = key(x, y);
            land.push({ x, y });
            if (clusterByTile.has(tileKey) || docksByTile.has(tileKey) || townsByTile.has(tileKey)) interesting = true;
          }
        }
        if (interesting || land.length === 0) continue;
        let picked = land[Math.floor(seeded01(bx, by, seed + 9401) * land.length)]!;
        for (const candidate of land) {
          if (clusterByTile.has(key(candidate.x, candidate.y)) || docksByTile.has(key(candidate.x, candidate.y))) continue;
          picked = candidate;
          break;
        }
        const tileKey = key(picked.x, picked.y);
        if (!townsByTile.has(tileKey) && !docksByTile.has(tileKey) && !clusterByTile.has(tileKey)) {
          townsByTile.set(tileKey, { townId: `town-${townsByTile.size}`, tileKey, type: townTypeAt(picked.x, picked.y), population: initialTownPopulationAt(picked.x, picked.y, seed), maxPopulation: POPULATION_MAX, connectedTownCount: 0, connectedTownBonus: 0, lastGrowthTickAt: now() });
        }
      }
    }
  };

  return {
    townTypeAt,
    generateTowns,
    canPlaceTownAt,
    findNearestTownPlacement,
    townPlacementsNeedNormalization,
    normalizeTownPlacements,
    normalizeLegacySettlementTowns,
    assignMissingTownNamesForWorld,
    ensureBaselineEconomyCoverage,
    ensureInterestCoverage,
    initialTownPopulationAt
  };
};
