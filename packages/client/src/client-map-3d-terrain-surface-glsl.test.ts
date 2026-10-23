import { describe, expect, it } from "vitest";
import type { Texture, WebGLProgramParametersWithUniforms } from "three";
import { applyHeightfieldMaterialShaderPatch } from "./client-map-3d-heightfield-shader.js";

const SPLICE_POINTS = [
  "#include <common>",
  "#include <uv_vertex>",
  "#include <begin_vertex>",
  "#include <map_fragment>",
  "#include <roughnessmap_fragment>",
  "#include <normal_fragment_maps>",
  "#include <output_fragment>"
];

const patchedShader = (): WebGLProgramParametersWithUniforms => {
  const shader = {
    uniforms: {},
    vertexShader: SPLICE_POINTS.join("\n"),
    fragmentShader: SPLICE_POINTS.join("\n")
  } as unknown as WebGLProgramParametersWithUniforms;
  const texture = {} as Texture;
  applyHeightfieldMaterialShaderPatch(texture, texture)(shader);
  return shader;
};

describe("terrain surface shader", () => {
  it("never keys texture sampling on the tile grid (the per-tile checkerboard)", () => {
    const { fragmentShader } = patchedShader();
    expect(fragmentShader).not.toContain("floor(vTerrainWorldUv)");
    expect(fragmentShader).toContain("terrainSampleBiome( map, vTerrainWorldUv");
  });

  it("splices every surface layer into the material", () => {
    const { vertexShader, fragmentShader } = patchedShader();
    expect(vertexShader).toContain("vTerrainWorldY = (modelMatrix * vec4(transformed, 1.0)).y;");
    expect(fragmentShader).toContain("terrainWetMask = smoothstep(");
    expect(fragmentShader).toContain("roughnessFactor = mix(roughnessFactor");
    expect(fragmentShader).toContain("terrainPerturbNormal(-vViewPosition, normal, terrainBumpHeight, faceDirection)");
    // Declared ahead of #ifdef USE_MAP so the roughness/normal splices,
    // which sit outside it, always compile.
    expect(fragmentShader.indexOf("float terrainWetMask = 0.0;")).toBeLessThan(fragmentShader.indexOf("#ifdef USE_MAP"));
    expect(fragmentShader.indexOf("float terrainBumpHeight = 0.0;")).toBeLessThan(fragmentShader.indexOf("#ifdef USE_MAP"));
    expect(fragmentShader.indexOf("float terrainBumpStrength = 1.0;")).toBeLessThan(fragmentShader.indexOf("#ifdef USE_MAP"));
  });
});
