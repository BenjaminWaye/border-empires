import { describe, expect, it } from "vitest";
import type { Texture, WebGLProgramParametersWithUniforms } from "three";
import { applyHeightfieldMaterialShaderPatch } from "./client-map-3d-heightfield-shader.js";

const SPLICE_POINTS = [
  "#include <common>",
  "#include <uv_vertex>",
  "#include <begin_vertex>",
  "#include <map_fragment>",
  "#include <roughnessmap_fragment>",
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

describe("beach shading", () => {
  it("splices the feathered edge and the damp waterline band into the material", () => {
    const { vertexShader, fragmentShader } = patchedShader();
    expect(vertexShader).toContain("vTerrainWorldY = (modelMatrix * vec4(transformed, 1.0)).y;");
    expect(fragmentShader).toContain("float grassMask = smoothstep(0.07, 0.13, greenBias + beachEdgeOffset);");
    expect(fragmentShader).toContain("beachWetMask = smoothstep(");
    expect(fragmentShader).toContain("roughnessFactor = mix(roughnessFactor, 0.6, beachWetMask);");
    // Declared ahead of #ifdef USE_MAP so the roughness splice, which sits
    // outside it, always compiles.
    expect(fragmentShader.indexOf("float beachWetMask = 0.0;")).toBeLessThan(fragmentShader.indexOf("#ifdef USE_MAP"));
  });

  it("keys the beach edge on continuous world coords, not the tile grid", () => {
    const { fragmentShader } = patchedShader();
    expect(fragmentShader).toContain("texture2D(map, vTerrainWorldUv * 0.125)");
  });
});
