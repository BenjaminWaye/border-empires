import { landBiomeAt, setWorldSeed, WORLD_HEIGHT, WORLD_WIDTH, type LandBiome } from "@border-empires/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { townTerrainForTile } from "./client-town-tile-terrain.js";

const findTile = (biome: LandBiome): { x: number; y: number } => {
  for (let y = 0; y < WORLD_HEIGHT; y += 7) {
    for (let x = 0; x < WORLD_WIDTH; x += 7) {
      if (landBiomeAt(x, y) === biome) return { x, y };
    }
  }
  throw new Error(`no ${biome} tile found`);
};

describe("townTerrainForTile", () => {
  beforeAll(() => setWorldSeed(1234, "continents", 1));

  it("derives Tundra for a legacy town (no stored profile) on a tundra tile", () => {
    const pos = findTile("TUNDRA");
    expect(townTerrainForTile(pos, {})).toEqual({ terrainProfile: "TUNDRA", coastal: false });
  });

  it("derives Trade Town for a legacy town on a sand tile instead of defaulting to Fertile", () => {
    const pos = findTile("SAND");
    expect(townTerrainForTile(pos, {}).terrainProfile).toBe("DESERT");
  });

  it("keeps a stored profile even when the tile biome disagrees", () => {
    const pos = findTile("TUNDRA");
    expect(townTerrainForTile(pos, { terrainProfile: "GRASS", coastal: true })).toEqual({ terrainProfile: "GRASS", coastal: true });
  });

  it("prefers the tile's own landBiome over recomputing", () => {
    const pos = findTile("SAND");
    expect(townTerrainForTile({ ...pos, landBiome: "TUNDRA" }, {}).terrainProfile).toBe("TUNDRA");
  });
});
