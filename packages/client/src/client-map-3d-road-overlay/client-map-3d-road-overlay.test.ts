import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BRICK_FRAGMENT, buildRoadFragmentShader, DIRT_FRAGMENT } from "./client-map-3d-road-fragments.js";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d road overlay regression guard", () => {
  it("keeps 3d roads as curved eight-direction ribbons with junction hubs", () => {
    const source = clientSource("./client-map-3d-road-overlay.ts");

    expect(source).toContain("const ROAD_DIRS: readonly RoadDir[] = [");
    expect(source).toContain('"northeast"');
    expect(source).toContain('"southwest"');
    expect(source).toContain("const curvedArmPoints =");
    expect(source).toContain("const addHub =");
    expect(source).toContain("getCubicBezierPoint");
    expect(source).toContain("ShaderMaterial");
    expect(source).toContain("side: DoubleSide");
    expect(source).toContain("polygonOffset: true");
  });

  it("defaults to the dirt style and lets storybook select the preserved brick style", () => {
    const source = clientSource("./client-map-3d-road-overlay.ts");
    expect(source).toMatch(/createRoadOverlay = \(scene: Scene, style: RoadOverlayStyle = "dirt"\)/);
    expect(source).toContain("buildRoadFragmentShader(style)");

    expect(buildRoadFragmentShader("dirt")).toBe(DIRT_FRAGMENT);
    expect(buildRoadFragmentShader("brick")).toBe(BRICK_FRAGMENT);
    expect(DIRT_FRAGMENT).not.toBe(BRICK_FRAGMENT);
  });

  // Uint32BufferAttribute's constructor wraps its input in `new Uint32Array(input)`,
  // which silently copies our index buffer — every `indices[i] = vi` write then lands
  // on a dead array while Three.js renders an internal zero-init copy and the road is
  // invisible. Plain BufferAttribute keeps the reference.
  it("uses plain BufferAttribute for the index buffer (Uint32BufferAttribute copies its input)", () => {
    const source = clientSource("./client-map-3d-road-overlay.ts");
    expect(source).not.toContain("Uint32BufferAttribute");
    expect(source).toMatch(/setIndex\(new BufferAttribute\(indices,\s*1\)/);
  });

  it("renders roads as packed dirt with pebbles and bump lighting, not cobblestone", () => {
    // Dirt-road surface features.
    expect(DIRT_FRAGMENT).toContain("// === Bump normal from the soil-height field ===");
    expect(DIRT_FRAGMENT).toContain("// === Packed-dirt base, toned by the height field ===");
    expect(DIRT_FRAGMENT).toContain("// === Dense fine gravel: small stones set densely into the soil ===");
    expect(DIRT_FRAGMENT).toContain("// === Wheel ruts: two packed lanes, dusty core with a darker packed edge ===");
    expect(DIRT_FRAGMENT).toContain("// === Pebbles: a few larger, clearly-spaced stones ===");
    expect(DIRT_FRAGMENT).toContain("// === Sunlight shading: lights clods and gravel");
    expect(DIRT_FRAGMENT).toContain("// === Eroded rim:");

    // The old cobblestone look lives on only as the preserved brick style.
    expect(BRICK_FRAGMENT).toContain("Cobblestone grid");
    expect(BRICK_FRAGMENT).toContain("stoneColor");
    expect(BRICK_FRAGMENT).toContain("mortar");
  });

  it("keeps green out of the dirt road so it reads on grass AND sand biomes", () => {
    // The sand biome has no green, so the shipped dirt surface must carry none
    // either: no grass tufts, no grass fringe, and no greenish edge blend.
    expect(DIRT_FRAGMENT).not.toMatch(/tuft|blade/i);
    expect(DIRT_FRAGMENT).not.toContain("grassTone");
    expect(DIRT_FRAGMENT).not.toContain("edgeGrass");
    expect(DIRT_FRAGMENT).not.toMatch(/vec3\(0\.4[0-9],\s*0\.5[0-9],\s*0\.2[0-9]\)/); // old grass fringe tone

    // Every vec3 color literal in the surface must be warm/neutral — green must
    // never be the dominant channel (a greenish literal would tint the road
    // green on the sand biome). Direction/normal vec3s inside normalize() are
    // not colors, so strip those out first.
    const colorLiterals = DIRT_FRAGMENT.replace(/normalize\(vec3\([^)]*\)\)/g, "");
    for (const match of colorLiterals.matchAll(/vec3\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/g)) {
      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);
      expect(g).toBeLessThanOrEqual(Math.max(r, b) + 0.001);
    }
  });

  it("avoids GLSL ES reserved words as shader identifiers (a reserved word fails WebGL compile and blanks the road)", () => {
    // `patch` is a reserved tessellation keyword in GLSL ES; using it as a
    // variable made the whole road invisible (shader link failure). Word-boundary
    // match so renames like `soilPatch` still pass.
    for (const fragment of [DIRT_FRAGMENT, BRICK_FRAGMENT]) {
      expect(fragment).not.toMatch(/\bpatch\b/);
      for (const reserved of ["input", "output", "sample", "filter", "class", "interface", "struct", "uniform"]) {
        expect(fragment).not.toMatch(new RegExp(`\\b${reserved}\\b`));
      }
    }
  });
});
