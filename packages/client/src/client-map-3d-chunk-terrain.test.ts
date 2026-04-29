import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { terrainSurfaceHeightAt } from "./client-map-3d-chunk-terrain.js";

const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("3d chunk terrain", () => {
  it("keeps terrain heights deterministic by tile and terrain type", () => {
    const first = terrainSurfaceHeightAt(120, 77, "LAND");
    const second = terrainSurfaceHeightAt(120, 77, "LAND");
    expect(first).toBe(second);
  });

  it("keeps mountains higher than land and sea lower than land", () => {
    const land = terrainSurfaceHeightAt(80, 80, "LAND");
    const mountain = terrainSurfaceHeightAt(80, 80, "MOUNTAIN");
    const sea = terrainSurfaceHeightAt(80, 80, "SEA");
    expect(mountain).toBeGreaterThan(land);
    expect(sea).toBeLessThan(land);
  });

  it("uses the chunk terrain layer from the 3d renderer instead of per-tile ground boxes", () => {
    const source = clientSource("./client-map-3d.ts");
    expect(source).toContain("createClientThreeChunkTerrainLayer");
    expect(source).not.toContain("const seaMesh = new InstancedMesh(");
    expect(source).not.toContain("const landMeshA = new InstancedMesh(");
    expect(source).not.toContain("const sandMeshA = new InstancedMesh(");
  });
});
