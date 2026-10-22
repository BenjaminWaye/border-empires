import { describe, expect, it } from "vitest";
import type { HeightfieldCornerAttributes } from "../client-map-3d-heightfield/client-map-3d-heightfield-corners.js";
import {
  appendShoreSand,
  createShoreWaterline,
  SHORE_SAND_MAX_REACH,
  type ShoreSandBuffers,
  type ShoreSandTileInputs
} from "./client-map-3d-shore-sand.js";

const WATER_Y = -0.06;
const LAND_EDGE_Y = -0.04;

const emptyBuffers = (): ShoreSandBuffers => ({ positions: [], colors: [], uvs: [], tundra: [], indices: [] });
const cornerAt = (_x: number, _z: number, out: HeightfieldCornerAttributes): boolean => {
  out.y = LAND_EDGE_Y;
  out.r = 0.9;
  out.g = 0.85;
  out.b = 0.7;
  out.forestZone = 0;
  out.tundraZone = 0;
  return true;
};
type Mouths = ReadonlyArray<{ readonly x: number; readonly z: number }>;
const inputs = (gc: number, gr: number, isLandTile: (x: number, z: number) => boolean, mouths: Mouths = []): ShoreSandTileInputs => ({
  gc,
  gr,
  isLandTile,
  worldOffsetX: 100,
  worldOffsetZ: 100,
  waterY: WATER_Y,
  waterline: createShoreWaterline(isLandTile, 100, 100, mouths),
  cornerAt
});
const vertices = (b: ShoreSandBuffers): { x: number; y: number; z: number }[] => {
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < b.positions.length; i += 3) out.push({ x: b.positions[i]!, y: b.positions[i + 1]!, z: b.positions[i + 2]! });
  return out;
};

// Land is every tile with z < 0; the sea starts at z = 0.
const straightCoast = (_x: number, z: number): boolean => z < 0;

describe("shore sand fringe", () => {
  it("adds nothing to open sea", () => {
    const b = emptyBuffers();
    appendShoreSand(b, inputs(0, 5, straightCoast));
    expect(b.indices).toHaveLength(0);
  });

  it("reaches a short, bounded way into the sea along a straight coast", () => {
    const b = emptyBuffers();
    appendShoreSand(b, inputs(0, 0, straightCoast));
    const vs = vertices(b);
    expect(vs.length).toBeGreaterThan(0);
    for (const v of vs) expect(v.z).toBeLessThanOrEqual(SHORE_SAND_MAX_REACH + 1e-6);
    // Covers the land edge along the whole tile.
    expect(vs.filter((v) => v.z === 0).length).toBeGreaterThan(5);
  });

  it("starts at the land's own edge height and settles just above the water", () => {
    const b = emptyBuffers();
    appendShoreSand(b, inputs(0, 0, straightCoast));
    const vs = vertices(b);
    for (const v of vs.filter((v) => v.z === 0)) expect(v.y).toBeCloseTo(LAND_EDGE_Y + 0.002, 6);
    const outermost = vs.reduce((a, v) => (v.z > a.z ? v : a));
    expect(outermost.y).toBeGreaterThan(WATER_Y);
    expect(outermost.y).toBeLessThan(LAND_EDGE_Y);
  });

  it("matches along the edge two neighbouring sea tiles share", () => {
    const left = emptyBuffers();
    const right = emptyBuffers();
    appendShoreSand(left, inputs(0, 0, straightCoast));
    appendShoreSand(right, inputs(1, 0, straightCoast));
    const onSeam = (b: ShoreSandBuffers): Map<string, number> =>
      new Map(vertices(b).filter((v) => v.x === 1).map((v) => [v.z.toFixed(6), v.y]));
    const a = onSeam(left);
    const c = onSeam(right);
    expect(a.size).toBeGreaterThan(0);
    for (const [z, y] of a) if (c.has(z)) expect(c.get(z)).toBeCloseTo(y, 9);
  });

  it("fills the inner corner of a stepped coast instead of following the step", () => {
    // A staircase: land wherever x + z < 0. Sea tile (0, 0) has land to the
    // north and west, so its north-west corner is a notch in the coast.
    const staircase = (x: number, z: number): boolean => x + z < 0;
    const waterline = createShoreWaterline(staircase, 100, 100, []);
    expect(waterline(0.15, 0.15)).toBeGreaterThan(0);
  });

  it("keeps open water at the centre of every sea tile, even a one-tile inlet", () => {
    const inlet = (x: number, _z: number): boolean => x !== 0;
    const waterline = createShoreWaterline(inlet, 100, 100, []);
    for (let z = -3; z <= 3; z++) expect(waterline(0.5, z + 0.5)).toBeLessThan(0);
  });

  it("is finite everywhere, open sea included", () => {
    // Infinity * 0 in the river-mouth term once came out NaN and drew the
    // shore foam as solid white bars over open water.
    const island = (x: number, z: number): boolean => Math.abs(x) <= 1 && Math.abs(z) <= 1;
    for (const mouths of [[], [{ x: 2, z: 0.5 }]] as Mouths[]) {
      const waterline = createShoreWaterline(island, 100, 100, mouths);
      for (let z = -6; z <= 6; z += 0.37) for (let x = -6; x <= 6; x += 0.37) expect(Number.isFinite(waterline(x, z))).toBe(true);
    }
  });

  it("stands clear of a river mouth", () => {
    const b = emptyBuffers();
    appendShoreSand(b, inputs(0, 0, straightCoast, [{ x: 0.5, z: 0 }]));
    // Right at the mouth the strip pinches to nothing: whatever is left there
    // hugs the land edge instead of reaching out over the river's water.
    for (const v of vertices(b)) if (Math.hypot(v.x - 0.5, v.z) < 0.15) expect(v.z).toBeLessThan(0.02);
  });
});
