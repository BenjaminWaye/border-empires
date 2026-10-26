import { describe, expect, it } from "vitest";
import type { Texture, WebGLProgramParametersWithUniforms } from "three";
import { applyHeightfieldMaterialShaderPatch } from "./client-map-3d-heightfield-shader.js";
import { beachGrassMask } from "./client-map-3d-beach-shading-glsl.js";
import { heightfieldTileColor, type HeightfieldTerrainKind } from "./client-map-3d-heightfield-terrain.js";

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
    expect(fragmentShader).toContain("float grassMask = smoothstep(0.07 - beachHalf, 0.07 + beachHalf, greenBias + beachWander);");
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

  it("leaves every biome's own ground on develop's grass/sand cut, whatever the edge noise", () => {
    // A wider 0.07-0.13 cut, applied everywhere, turned marsh (greenBias
    // ~0.09), legacy plains (~0.12) and mountain-foot ground (~0.07) to sand.
    const greenBias = ([r, g, b]: [number, number, number]): number => g / 255 - 0.5 * (r / 255 + b / 255);
    const developMask = (gb: number): number => {
      const t = Math.min(1, Math.max(0, (gb - 0.055) / 0.03));
      return t * t * (3 - 2 * t);
    };
    const kinds: HeightfieldTerrainKind[] = ["GRASS", "SAND", "MOUNTAIN", "PLAINS", "PLAINS_BRIGHT", "JUNGLE", "MARSH"];
    for (const kind of kinds) {
      for (const variant of [0, 1] as const) {
        const gb = greenBias(heightfieldTileColor(kind, variant));
        // Inside a biome the colour is even: no gradient.
        for (const offset of [-0.035, 0, 0.035]) expect(beachGrassMask(gb, 0, offset)).toBeCloseTo(developMask(gb), 6);
      }
    }
  });

  it("feathers a grass/sand transition but never pulls marsh-green ground to sand", () => {
    // Across a grass->sand tile greenBias runs ~0.038 -> ~0.19: the edge
    // wanders with the noise there...
    expect(beachGrassMask(0.07, 0.156, 0.035)).toBeGreaterThan(beachGrassMask(0.07, 0.156, -0.035) + 0.5);
    // ...pure sand stays sand and pure grass grass...
    for (const offset of [-0.035, 0.035]) {
      expect(beachGrassMask(0.038, 0.156, offset)).toBeLessThan(0.01);
      expect(beachGrassMask(0.19, 0.156, offset)).toBeGreaterThan(0.99);
    }
    // ...and on a grass/marsh boundary (greenBias >= ~0.09 throughout) the
    // marsh side keeps its grass texture.
    expect(beachGrassMask(0.09, 0.1, -0.035)).toBeGreaterThan(0.99);
  });
});
