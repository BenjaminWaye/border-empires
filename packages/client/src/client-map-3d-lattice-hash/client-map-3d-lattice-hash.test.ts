import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BEACH_NOISE_GLSL } from "../client-map-3d-beach-shading-glsl.js";
import { BRICK_FRAGMENT, DIRT_FRAGMENT } from "../client-map-3d-road-overlay/client-map-3d-road-fragments.js";
import { STORM_FIELD_GLSL } from "../client-map-3d-unexplored-storm/client-map-3d-unexplored-storm-field-glsl.js";
import { LATTICE_HASH_GLSL } from "./client-map-3d-lattice-hash-glsl.js";

// Hashes that amplify float rounding: some mobile GPU compilers round a
// shared lattice corner differently in the two cells that use it, so value
// noise built on them jumps at every cell edge (blocky rectangles).
const ROUNDING_AMPLIFYING_HASH = /fract\(\s*sin\(|456\.21/;
// A value-noise corner lookup: the hash of i + (1, 0[, 0]) next to the hash of i.
const LATTICE_CORNER = /\(\s*i\s*\+\s*vec[23]\(\s*1(\.0)?\s*,\s*0/;

const srcRoot = new URL("..", import.meta.url).pathname;
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });

describe("exact integer lattice hash (3D shaders)", () => {
  it("hashes with highp unsigned-integer bit mixing, not float tricks", () => {
    expect(LATTICE_HASH_GLSL).toContain("float latticeHash2(vec2 p)");
    expect(LATTICE_HASH_GLSL).toContain("float latticeHash3(vec3 p)");
    expect(LATTICE_HASH_GLSL).toContain("highp uvec2 q = uvec2(ivec2(p));");
    expect(LATTICE_HASH_GLSL).toContain("highp uvec3 q = uvec3(ivec3(p));");
    expect(LATTICE_HASH_GLSL).not.toMatch(/sin\(|fract\(/);
    // Guarded, so two snippets carrying it can share one shader.
    expect(LATTICE_HASH_GLSL).toContain("#ifndef BE_LATTICE_HASH");
  });

  it("is what the storm, road and beach value noise hash their corners with", () => {
    for (const glsl of [STORM_FIELD_GLSL, BRICK_FRAGMENT, DIRT_FRAGMENT, BEACH_NOISE_GLSL]) {
      expect(glsl).toContain(LATTICE_HASH_GLSL);
      expect(glsl).toMatch(/[hH]ash\(vec2 p\) \{ return latticeHash2\(p\); \}/);
      expect(glsl).not.toMatch(ROUNDING_AMPLIFYING_HASH);
    }
  });

  it("salts the road's per-cell hashes with integer offsets", () => {
    // latticeHash2 truncates to ints: a fractional salt like cell + (0.7, 0.3)
    // would hash the cell itself and make every "independent" value equal.
    for (const glsl of [BRICK_FRAGMENT, DIRT_FRAGMENT]) {
      const salts = [...glsl.matchAll(/\bhash\(\w+ \+ vec2\(([^)]*)\)\)/g)].map((m) => m[1] ?? "");
      expect(salts.length).toBeGreaterThan(0);
      for (const salt of salts) expect(salt).toMatch(/^\d+\.0, \d+\.0$/);
    }
  });

  it("no shader runs value noise over a rounding-amplifying hash", () => {
    // Regression: the fog (sin hash), roads (sin hash), beach band and wonder
    // grounds (x456 fract cascade), marble and relic wear (3D sin hash) all
    // hashed lattice corners with float maths and could draw cell-edge blocks
    // on some phones.
    const offenders: string[] = [];
    let latticeShaders = 0;
    for (const path of sourceFiles(srcRoot)) {
      const source = readFileSync(path, "utf8");
      if (!LATTICE_CORNER.test(source)) continue;
      latticeShaders += 1;
      if (ROUNDING_AMPLIFYING_HASH.test(source) || !source.includes("LATTICE_HASH_GLSL")) {
        offenders.push(path.slice(srcRoot.length));
      }
    }
    expect(latticeShaders).toBeGreaterThanOrEqual(10);
    expect(offenders).toEqual([]);
  });
});
