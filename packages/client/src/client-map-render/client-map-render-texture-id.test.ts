import { describe, expect, it } from "vitest";
import { CURRENT_WORLDGEN_VERSION, setWorldSeed } from "@border-empires/shared";
import { terrainTextureIdAt } from "./client-map-render-texture-id.js";

describe("terrainTextureIdAt", () => {
  it("maps sea/mountain terrain straight through, ignoring biome", () => {
    expect(terrainTextureIdAt(0, 0, "SEA", (v) => v, (v) => v)).toBe("SEA_DEEP");
    expect(terrainTextureIdAt(0, 0, "COASTAL_SEA", (v) => v, (v) => v)).toBe("SEA_COAST");
    expect(terrainTextureIdAt(0, 0, "MOUNTAIN", (v) => v, (v) => v)).toBe("MOUNTAIN");
  });

  it("returns a v8 biome texture id for at least one LAND tile of each new promotion, plus legacy ids elsewhere", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    const seen = new Set<string>();
    for (let x = 0; x < 450; x += 3) {
      for (let y = 0; y < 450; y += 3) {
        seen.add(terrainTextureIdAt(x, y, "LAND", (v) => v, (v) => v));
      }
    }
    const validIds = new Set([
      "SAND",
      "TUNDRA",
      "PLAINS",
      "JUNGLE",
      "MARSH",
      "SNOW",
      "GRASS_LIGHT",
      "GRASS_LIGHTER",
      "GRASS_DARK"
    ]);
    for (const id of seen) expect(validIds.has(id)).toBe(true);
    expect(seen.has("PLAINS")).toBe(true);
    expect(seen.has("JUNGLE")).toBe(true);
    expect(seen.has("MARSH")).toBe(true);
    expect(seen.has("SNOW")).toBe(true);
  });
});
