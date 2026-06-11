import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

  // Uint32BufferAttribute's constructor wraps its input in `new Uint32Array(input)`,
  // which silently copies our index buffer — every `indices[i] = vi` write then lands
  // on a dead array while Three.js renders an internal zero-init copy and the road is
  // invisible. Plain BufferAttribute keeps the reference.
  it("uses plain BufferAttribute for the index buffer (Uint32BufferAttribute copies its input)", () => {
    const source = clientSource("./client-map-3d-road-overlay.ts");
    expect(source).not.toContain("Uint32BufferAttribute");
    expect(source).toMatch(/setIndex\(new BufferAttribute\(indices,\s*1\)/);
  });
});
