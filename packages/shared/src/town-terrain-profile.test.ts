import { describe, expect, it } from "vitest";
import { ancillaryFactoryCapacityBonus, arsenalMultiplierForFactoryCount, resolvedTownCoastal, resolvedTownTerrainProfileId, terrainAdjustedTownManpower, townTerrainModifiers, townTerrainProfileForBiome } from "./town-terrain-profile.js";

describe("town terrain profiles", () => {
  it("maps mechanical biomes to immutable economic identities", () => {
    expect(townTerrainProfileForBiome("TUNDRA")).toBe("TUNDRA");
    expect(townTerrainProfileForBiome("SAND")).toBe("DESERT");
    expect(townTerrainProfileForBiome("COASTAL_SAND")).toBe("DESERT");
    expect(townTerrainProfileForBiome("GRASS")).toBe("GRASS");
  });
  it("restores coastal separately from terrain for towns created before profiles were persisted", () => {
    expect(resolvedTownTerrainProfileId(undefined, "COASTAL_SAND")).toBe("DESERT");
    expect(resolvedTownCoastal(undefined, "COASTAL_SAND")).toBe(true);
    expect(resolvedTownTerrainProfileId("TUNDRA", "COASTAL_SAND")).toBe("TUNDRA");
    expect(resolvedTownCoastal("COASTAL_DESERT", "SAND")).toBe(true);
    expect(townTerrainModifiers("COASTAL_DESERT")).toMatchObject({ id: "DESERT", coastal: true, goldMultiplier: 1.92 });
  });
  it("applies manpower multipliers at every population tier", () => {
    const expectedGrass = {
      SETTLEMENT: { cap: 150, regenPerMinute: 0.20833333333333334 },
      TOWN: { cap: 300, regenPerMinute: 0.4166666666666667 },
      CITY: { cap: 450, regenPerMinute: 0.625 },
      GREAT_CITY: { cap: 750, regenPerMinute: 1.0416666666666667 },
      METROPOLIS: { cap: 1350, regenPerMinute: 1.875 }
    } as const;
    for (const [tier, grass] of Object.entries(expectedGrass)) {
      expect(terrainAdjustedTownManpower(tier as keyof typeof expectedGrass, "GRASS")).toEqual(grass);
      expect(terrainAdjustedTownManpower(tier as keyof typeof expectedGrass, "DESERT")).toEqual({ cap: grass.cap * 0.6, regenPerMinute: grass.regenPerMinute * 0.6 });
      expect(terrainAdjustedTownManpower(tier as keyof typeof expectedGrass, "TUNDRA")).toEqual({ cap: grass.cap * 0.55, regenPerMinute: grass.regenPerMinute * 0.55 });
      expect(terrainAdjustedTownManpower(tier as keyof typeof expectedGrass, "GRASS", true)).toEqual({ cap: grass.cap * 1.2, regenPerMinute: grass.regenPerMinute * 1.2 });
      expect(terrainAdjustedTownManpower(tier as keyof typeof expectedGrass, "DESERT", true)).toEqual({ cap: grass.cap * 0.72, regenPerMinute: grass.regenPerMinute * 0.72 });
      expect(terrainAdjustedTownManpower(tier as keyof typeof expectedGrass, "TUNDRA", true)).toEqual({ cap: grass.cap * 0.66, regenPerMinute: grass.regenPerMinute * 0.66 });
    }
  });
  it("caps arsenal concentration at 2.25x", () => {
    expect([1, 2, 4, 6, 8, 10].map(arsenalMultiplierForFactoryCount)).toEqual([1, 1.15, 1.45, 1.75, 2.05, 2.25]);
  });
  it("adds Ancillary Factory capacity without changing regeneration", () => {
    expect(ancillaryFactoryCapacityBonus(450, 1, false)).toBe(195);
    expect(ancillaryFactoryCapacityBonus(450, 1, true)).toBe(307.5);
  });
});
