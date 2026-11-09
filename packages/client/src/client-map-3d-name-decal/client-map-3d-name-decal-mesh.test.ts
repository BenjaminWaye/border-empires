import { describe, expect, it } from "vitest";
import { buildDecalMeshArrays, CORNER_RISE, FLAT_SUBDIVISIONS, HILL_SUBDIVISIONS, type DecalMeshWindow } from "./client-map-3d-name-decal-mesh.js";

const wrap = (x: number): number => ((x % 100) + 100) % 100;
const window1: DecalMeshWindow = { firstTileX: 10, firstTileY: 10, tilesX: 2, tilesZ: 1, originDx: 0, originDy: 0, areaOffsetX: 0, areaOffsetY: 0, areaWidthTiles: 2, areaHeightTiles: 1 };

describe("buildDecalMeshArrays", () => {
  const source = { cornerYAt: () => 0, tileCenterY: () => 0.02, wrapX: wrap, wrapY: wrap };

  it("keeps flat tiles on the coarse grid", () => {
    const { positions } = buildDecalMeshArrays(source, window1);
    expect(positions.length / 3).toBe(2 * (FLAT_SUBDIVISIONS + 1) ** 2);
  });

  it("lifts every vertex of a hill tile onto the dome, so the lettering is never inside the hill", () => {
    // A bump away from the centre/edges: the old 3x3 tent sampled none of it.
    const dome = (u: number, v: number): number => 0.5 * Math.max(0, 1 - Math.hypot(u - 0.2, v + 0.2) / 0.25);
    const { positions } = buildDecalMeshArrays({ ...source, hillDomeAt: (x) => (x === 10 ? dome : undefined) }, window1);
    const hillVerts = (HILL_SUBDIVISIONS + 1) ** 2;
    let peak = 0;
    for (let i = 0; i < hillVerts; i += 1) {
      const u = positions[i * 3]! - 0.5;
      const v = positions[i * 3 + 2]! - 0.5;
      expect(positions[i * 3 + 1]).toBeCloseTo(dome(u, v) + CORNER_RISE, 5);
      peak = Math.max(peak, positions[i * 3 + 1]!);
    }
    expect(peak).toBeGreaterThan(0.4);
    expect(positions.length / 3).toBe(hillVerts + (FLAT_SUBDIVISIONS + 1) ** 2);
  });

  it("indexes only vertices that exist", () => {
    const { positions, indices } = buildDecalMeshArrays({ ...source, hillDomeAt: () => () => 0.1 }, window1);
    expect(Math.max(...indices)).toBe(positions.length / 3 - 1);
  });

  it("skips excluded tiles without sampling their hill dome", () => {
    let domeCalls = 0;
    const hillDomeAt = (x: number) => (x === 10 ? undefined : () => { domeCalls += 1; return 0.1; });
    const { positions, indices } = buildDecalMeshArrays({ ...source, hillDomeAt }, { ...window1, includeTile: (tx) => tx === 0 });
    expect(positions.length / 3).toBe((FLAT_SUBDIVISIONS + 1) ** 2);
    expect(indices.length).toBe(FLAT_SUBDIVISIONS ** 2 * 6);
    expect(domeCalls).toBe(0);
  });

  it("keeps each tile's own dome when later tiles are hills", () => {
    // Regression: a duplicated hillDomes.push shifted every later tile onto
    // its neighbour's dome, and Float32Array silently dropped the overflow.
    const dome = (): number => 0.3;
    const wide: DecalMeshWindow = { ...window1, tilesX: 3, areaWidthTiles: 3 };
    const { positions } = buildDecalMeshArrays({ ...source, hillDomeAt: (x) => (x === 11 ? dome : undefined) }, wide);
    const flatVerts = (FLAT_SUBDIVISIONS + 1) ** 2;
    const hillVerts = (HILL_SUBDIVISIONS + 1) ** 2;
    expect(positions.length / 3).toBe(2 * flatVerts + hillVerts);
    for (let i = flatVerts; i < flatVerts + hillVerts; i += 1) expect(positions[i * 3 + 1]).toBeCloseTo(0.3 + CORNER_RISE, 5);
    for (let i = flatVerts + hillVerts; i < 2 * flatVerts + hillVerts; i += 1) expect(positions[i * 3]).toBeGreaterThanOrEqual(2);
  });
});
