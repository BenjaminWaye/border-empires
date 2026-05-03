import { describe, expect, it } from "vitest";

import { inferRuntimeLandContext } from "./server-runtime-land-context.js";

type Terrain = "LAND" | "MOUNTAIN" | "SEA" | "COASTAL_SEA";
type LandBiome = "GRASS" | "SAND" | "COASTAL_SAND";
type RegionType = "FERTILE_PLAINS" | "BROKEN_HIGHLANDS" | "DEEP_FOREST" | "ANCIENT_HEARTLAND" | "CRYSTAL_WASTES";

const createGridLookup = <T>(grid: T[][]) => (x: number, y: number): T => grid[y]![x]!;
const wrap = (value: number, size: number): number => ((value % size) + size) % size;

describe("runtime land context", () => {
  it("returns the base biome and region for normal land tiles", () => {
    const terrainAt = createGridLookup<Terrain>([["LAND"]]);
    const landBiomeAt = createGridLookup<LandBiome>([["SAND"]]);
    const regionTypeAt = createGridLookup<RegionType>([["CRYSTAL_WASTES"]]);

    expect(
      inferRuntimeLandContext({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        wrapX: wrap,
        wrapY: wrap,
        baseTerrainAt: terrainAt,
        runtimeTerrainAt: terrainAt,
        baseLandBiomeAt: landBiomeAt,
        baseRegionTypeAt: regionTypeAt
      })
    ).toEqual({ landBiome: "SAND", regionType: "CRYSTAL_WASTES" });
  });

  it("inherits biome and region from nearby base land when a mountain is removed", () => {
    const baseTerrain = [
      ["LAND", "LAND", "LAND"],
      ["LAND", "MOUNTAIN", "LAND"],
      ["LAND", "LAND", "LAND"]
    ] as const satisfies Terrain[][];
    const runtimeTerrain = [
      ["LAND", "LAND", "LAND"],
      ["LAND", "LAND", "LAND"],
      ["LAND", "LAND", "LAND"]
    ] as const satisfies Terrain[][];
    const baseBiome = [
      ["SAND", "SAND", "SAND"],
      ["SAND", "GRASS", "SAND"],
      ["SAND", "SAND", "SAND"]
    ] as const satisfies LandBiome[][];
    const baseRegion = [
      ["CRYSTAL_WASTES", "CRYSTAL_WASTES", "CRYSTAL_WASTES"],
      ["CRYSTAL_WASTES", "BROKEN_HIGHLANDS", "CRYSTAL_WASTES"],
      ["CRYSTAL_WASTES", "CRYSTAL_WASTES", "CRYSTAL_WASTES"]
    ] as const satisfies RegionType[][];

    expect(
      inferRuntimeLandContext({
        x: 1,
        y: 1,
        width: 3,
        height: 3,
        wrapX: wrap,
        wrapY: wrap,
        baseTerrainAt: createGridLookup(baseTerrain),
        runtimeTerrainAt: createGridLookup(runtimeTerrain),
        baseLandBiomeAt: createGridLookup(baseBiome),
        baseRegionTypeAt: createGridLookup(baseRegion)
      })
    ).toEqual({ landBiome: "SAND", regionType: "CRYSTAL_WASTES" });
  });

  it("falls back to grass when no nearby base land exists", () => {
    const baseTerrain = [
      ["SEA", "SEA", "SEA"],
      ["SEA", "MOUNTAIN", "SEA"],
      ["SEA", "SEA", "SEA"]
    ] as const satisfies Terrain[][];
    const runtimeTerrain = [
      ["SEA", "SEA", "SEA"],
      ["SEA", "LAND", "SEA"],
      ["SEA", "SEA", "SEA"]
    ] as const satisfies Terrain[][];

    expect(
      inferRuntimeLandContext({
        x: 1,
        y: 1,
        width: 3,
        height: 3,
        wrapX: wrap,
        wrapY: wrap,
        baseTerrainAt: createGridLookup(baseTerrain),
        runtimeTerrainAt: createGridLookup(runtimeTerrain),
        baseLandBiomeAt: () => undefined,
        baseRegionTypeAt: () => undefined,
        searchRadius: 2
      })
    ).toEqual({ landBiome: "GRASS" });
  });
});
