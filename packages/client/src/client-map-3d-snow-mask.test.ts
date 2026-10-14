// Regression: SNOW tiles drew identical to TUNDRA in 3D because the shader
// only used the vertex colour as a luminance-normalized hue tint, discarding
// SNOW's near-white brightness. The mask must fire on SNOW's tile colour and
// stay off for every other land palette colour that shares the tundra path
// or sits beside it.
import { describe, expect, test } from "vitest";
import type { WebGLProgramParametersWithUniforms } from "three";
import { Texture } from "three";
import { heightfieldTileColor, type HeightfieldTerrainKind } from "./client-map-3d-heightfield-terrain.js";
import { applyHeightfieldMaterialShaderPatch } from "./client-map-3d-heightfield-shader.js";
import { heightfieldSnowMask } from "./client-map-3d-snow-mask.js";

const maskOf = ([r, g, b]: readonly [number, number, number]): number => heightfieldSnowMask(r / 255, g / 255, b / 255);
const mix = (a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number] =>
  [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
// client-map-3d-heightfield-corners.ts's coast-corner beach colour.
const BEACH: readonly [number, number, number] = [244, 232, 198];

describe("3D snow mask", () => {
  test("SNOW's tile colour is fully snow", () => {
    expect(maskOf(heightfieldTileColor("SNOW", 0))).toBe(1);
  });

  test("no other land kind or variant reads as snow", () => {
    const kinds: HeightfieldTerrainKind[] = ["GRASS", "SAND", "TUNDRA", "MOUNTAIN", "PLAINS", "PLAINS_BRIGHT", "JUNGLE", "MARSH"];
    for (const kind of kinds) {
      for (const variant of [0, 1, 2] as const) expect(maskOf(heightfieldTileColor(kind, variant))).toBe(0);
    }
  });

  test("tundra coast corners blended toward the beach never read as snow", () => {
    for (const t of [0.25, 0.5, 0.75, 1]) expect(maskOf(mix(heightfieldTileColor("TUNDRA", 1), BEACH, t))).toBe(0);
  });

  test("a snow/tundra border corner fades partway rather than snapping", () => {
    const edge = maskOf(mix(heightfieldTileColor("SNOW", 0), heightfieldTileColor("TUNDRA", 1), 0.25));
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
  });

  test("the terrain shader patch applies the snow blend", () => {
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <uv_vertex>",
      fragmentShader: "#include <common>\n#include <map_fragment>\n#include <output_fragment>"
    } as unknown as WebGLProgramParametersWithUniforms;
    applyHeightfieldMaterialShaderPatch(new Texture(), new Texture())(shader);
    expect(shader.fragmentShader).toContain("biomeColor = mix(biomeColor, snowColor, snowMask);");
    // vertLum must be declared once, before the snow mask uses it.
    expect(shader.fragmentShader.match(/float vertLum/g)).toHaveLength(1);
    expect(shader.fragmentShader.indexOf("float vertLum")).toBeLessThan(shader.fragmentShader.indexOf("snowMask"));
  });
});
