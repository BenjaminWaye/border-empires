import type { Tile } from "./client-types.js";

type TownPopulationTier = NonNullable<NonNullable<Tile["town"]>["populationTier"]>;
type ResourceType = NonNullable<Tile["resource"]>;

const hash01 = (x: number, y: number, seed: number): number => {
  const h = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0;
  return h / 4294967295;
};

const nearestClusterDistance = (
  wx: number,
  wy: number,
  cellSize: number,
  seed: number
): { distance: number; clusterId: number; localX: number; localY: number } => {
  const cx = Math.floor(wx / cellSize);
  const cy = Math.floor(wy / cellSize);
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestClusterId = 0;
  let bestLocalX = 0;
  let bestLocalY = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const gx = cx + ox;
      const gy = cy + oy;
      const jitterX = (hash01(gx, gy, seed) - 0.5) * cellSize * 0.75;
      const jitterY = (hash01(gx, gy, seed + 1) - 0.5) * cellSize * 0.75;
      const centerX = (gx + 0.5) * cellSize + jitterX;
      const centerY = (gy + 0.5) * cellSize + jitterY;
      const dx = wx - centerX;
      const dy = wy - centerY;
      const distance = Math.hypot(dx, dy);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      bestClusterId = ((gx * 92821) ^ (gy * 68917) ^ (seed * 137)) >>> 0;
      bestLocalX = gx;
      bestLocalY = gy;
    }
  }
  return { distance: bestDistance, clusterId: bestClusterId, localX: bestLocalX, localY: bestLocalY };
};

const inCluster = (
  wx: number,
  wy: number,
  cellSize: number,
  radius: number,
  seed: number
): { active: boolean; clusterId: number; localX: number; localY: number; distance: number } => {
  const nearest = nearestClusterDistance(wx, wy, cellSize, seed);
  const edgeJitter = (hash01(nearest.localX, nearest.localY, seed + 17) - 0.5) * 0.45;
  return {
    active: nearest.distance <= radius + edgeJitter,
    clusterId: nearest.clusterId,
    localX: nearest.localX,
    localY: nearest.localY,
    distance: nearest.distance
  };
};

export const townTierFor3DPopulation = (
  wx: number,
  wy: number,
  terrain: Tile["terrain"],
  tile: Tile | undefined,
  syntheticEnabled: boolean
): TownPopulationTier | undefined => {
  if (tile?.town) return tile.town.populationTier;
  if (!syntheticEnabled || terrain !== "LAND") return undefined;
  const townCluster = inCluster(wx, wy, 22, 2.0, 41);
  if (!townCluster.active) return undefined;
  const tierRoll = hash01(townCluster.localX, townCluster.localY, 53);
  const metroBoost = hash01(wx, wy, 59);
  if (tierRoll > 0.994 && metroBoost > 0.94) return "METROPOLIS";
  if (tierRoll > 0.975) return "GREAT_CITY";
  if (tierRoll > 0.85) return "CITY";
  if (tierRoll > 0.5) return "TOWN";
  return "SETTLEMENT";
};

const chooseClusterResource = (
  clusterId: number,
  preferred: readonly ResourceType[],
  fallback: readonly ResourceType[]
): ResourceType => {
  const source = preferred.length > 0 ? preferred : fallback;
  return source[clusterId % source.length] ?? fallback[clusterId % fallback.length] ?? "FARM";
};

export const resourceFor3DPopulation = (
  wx: number,
  wy: number,
  terrain: Tile["terrain"],
  tile: Tile | undefined,
  syntheticEnabled: boolean,
  biome: "GRASS" | "SAND" | "COASTAL_SAND" | undefined,
  forestTile: boolean
): Tile["resource"] | undefined => {
  if (tile?.resource) return tile.resource;
  if (!syntheticEnabled) return undefined;
  const roll = hash01(wx, wy, 71);
  if (terrain === "SEA") return roll < 0.02 ? "FISH" : undefined;
  if (terrain !== "LAND") return undefined;
  const resourceCluster = inCluster(wx, wy, 9, 1.75, 71);
  if (!resourceCluster.active) {
    if (biome === "COASTAL_SAND") return roll < 0.03 ? "FISH" : undefined;
    if (forestTile) return roll < 0.03 ? "FUR" : undefined;
    if (biome === "SAND") return roll < 0.025 ? "GEMS" : undefined;
    return roll < 0.02 ? "FARM" : undefined;
  }
  if (biome === "COASTAL_SAND") {
    return chooseClusterResource(resourceCluster.clusterId, ["FISH", "FARM"], ["FISH", "FARM", "IRON"]);
  }
  if (biome === "SAND") {
    return chooseClusterResource(resourceCluster.clusterId, ["GEMS", "IRON", "FUR"], ["GEMS", "IRON"]);
  }
  if (forestTile) {
    return chooseClusterResource(resourceCluster.clusterId, ["FUR", "FARM"], ["FUR", "FARM", "IRON"]);
  }
  const inlandType = chooseClusterResource(resourceCluster.clusterId, ["FARM", "IRON"], ["FARM", "IRON", "FUR"]);
  if (inlandType === "FUR" && !forestTile) return "FARM";
  return inlandType;
};
