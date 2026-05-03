import type { LandBiome, RegionType, Terrain } from "@border-empires/shared";

export type RuntimeLandContext = {
  landBiome: LandBiome;
  regionType?: RegionType;
};

export const inferRuntimeLandContext = (deps: {
  x: number;
  y: number;
  width: number;
  height: number;
  wrapX: (x: number, width: number) => number;
  wrapY: (y: number, height: number) => number;
  baseTerrainAt: (x: number, y: number) => Terrain;
  runtimeTerrainAt: (x: number, y: number) => Terrain;
  baseLandBiomeAt: (x: number, y: number) => LandBiome | undefined;
  baseRegionTypeAt: (x: number, y: number) => RegionType | undefined;
  searchRadius?: number;
}): RuntimeLandContext | undefined => {
  const {
    x,
    y,
    width,
    height,
    wrapX,
    wrapY,
    baseTerrainAt,
    runtimeTerrainAt,
    baseLandBiomeAt,
    baseRegionTypeAt,
    searchRadius = 6
  } = deps;

  const wx = wrapX(x, width);
  const wy = wrapY(y, height);
  if (runtimeTerrainAt(wx, wy) !== "LAND") return undefined;

  if (baseTerrainAt(wx, wy) === "LAND") {
    const baseRegionType = baseRegionTypeAt(wx, wy);
    return {
      landBiome: baseLandBiomeAt(wx, wy) ?? "GRASS",
      ...(baseRegionType ? { regionType: baseRegionType } : {})
    };
  }

  for (let radius = 1; radius <= searchRadius; radius += 1) {
    const counts = new Map<string, { landBiome: LandBiome; regionType?: RegionType; count: number }>();
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) !== radius) continue;
        const nx = wrapX(wx + dx, width);
        const ny = wrapY(wy + dy, height);
        if (runtimeTerrainAt(nx, ny) !== "LAND") continue;
        if (baseTerrainAt(nx, ny) !== "LAND") continue;
        const landBiome = baseLandBiomeAt(nx, ny) ?? "GRASS";
        const regionType = baseRegionTypeAt(nx, ny);
        const key = `${landBiome}|${regionType ?? ""}`;
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
          continue;
        }
        counts.set(key, { landBiome, ...(regionType ? { regionType } : {}), count: 1 });
      }
    }
    if (counts.size === 0) continue;
    const best = [...counts.values()].sort((left, right) => right.count - left.count)[0]!;
    return {
      landBiome: best.landBiome,
      ...(best.regionType ? { regionType: best.regionType } : {})
    };
  }

  return { landBiome: "GRASS" };
};
