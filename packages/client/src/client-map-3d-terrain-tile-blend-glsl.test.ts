import { describe, expect, it } from "vitest";
import type { Texture, WebGLProgramParametersWithUniforms } from "three";
import { applyHeightfieldMaterialShaderPatch } from "./client-map-3d-heightfield-shader.js";
import { TERRAIN_TILE_SAMPLES_GLSL, TERRAIN_TILE_SEAM_BLEND, terrainTileSeamWeights } from "./client-map-3d-terrain-tile-blend-glsl.js";

const SPLICE_POINTS = ["#include <common>", "#include <uv_vertex>", "#include <begin_vertex>", "#include <map_fragment>", "#include <roughnessmap_fragment>", "#include <output_fragment>"];

const patchedFragment = (): string => {
  const shader = { uniforms: {}, vertexShader: SPLICE_POINTS.join("\n"), fragmentShader: SPLICE_POINTS.join("\n") } as unknown as WebGLProgramParametersWithUniforms;
  applyHeightfieldMaterialShaderPatch({} as Texture, {} as Texture)(shader);
  return shader.fragmentShader;
};

const sameWeights = (a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): void => {
  expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
  for (const [key, weight] of a) expect(b.get(key)).toBeCloseTo(weight, 5);
};

describe("terrain per-tile texture variation (3D)", () => {
  it("samples the terrain textures seam-blended, never through one hard per-tile mapping", () => {
    // Regression: each tile sampled only its own rotated texture region, a hard seam on every tile edge -- straight lines
    // along beaches and sandy hill rows, and a broken corner where sand met tundra.
    const fragment = patchedFragment();
    expect(fragment).toContain(TERRAIN_TILE_SAMPLES_GLSL.trim());
    expect(fragment).toContain("vec2 terrainTileSampleUv(vec2 tileId, vec2 worldUv)");
    expect(fragment).not.toContain("texture2D( map, sampleUv )");
    // The neighbour samples sit in branches, so they must not rely on implicit derivatives.
    expect(fragment).toContain("textureGrad(sandColorMap, sampleUv, gx, gy)");
  });

  it("weights are continuous across tile edges and corners", () => {
    const eps = 1e-6;
    // Vertical edge at u = 5, horizontal edge at v = 8, and their corner.
    sameWeights(terrainTileSeamWeights(5 - eps, 7.5), terrainTileSeamWeights(5 + eps, 7.5));
    sameWeights(terrainTileSeamWeights(4.6, 8 - eps), terrainTileSeamWeights(4.6, 8 + eps));
    sameWeights(terrainTileSeamWeights(5 - eps, 8 - eps), terrainTileSeamWeights(5 + eps, 8 + eps));
    // An even split on the edge itself, four ways at a corner.
    expect(terrainTileSeamWeights(5 + eps, 7.5).get("4,7")).toBeCloseTo(0.5, 4);
    expect(terrainTileSeamWeights(5 + eps, 8 + eps).get("4,7")).toBeCloseTo(0.25, 4);
  });

  it("keeps each tile's interior on its own mapping, with weights summing to 1", () => {
    const inner = terrainTileSeamWeights(3 + TERRAIN_TILE_SEAM_BLEND + 0.01, 9.5);
    expect([...inner.entries()]).toEqual([["3,9", 1]]);
    for (const [u, v] of [[2.1, 6.05], [2.5, 6.5], [2.95, 6.2], [2.02, 6.97]] as const) {
      const total = [...terrainTileSeamWeights(u, v).values()].reduce((sum, w) => sum + w, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });
});
