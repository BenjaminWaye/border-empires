import { describe, expect, it } from "vitest";
import type { HeightfieldCornerAttributes } from "../client-map-3d-heightfield/client-map-3d-heightfield-corners.js";
import { appendShoreSand, SHORE_SAND_REACH, type ShoreSandBuffers, type ShoreSandTileInputs } from "./client-map-3d-shore-sand.js";

const WATER_Y = -0.06;
const LAND_EDGE_Y = -0.04;
const MAX_REACH = SHORE_SAND_REACH * 1.4;

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
const inputs = (gc: number, gr: number, isLandTile: (x: number, z: number) => boolean, mouths: ShoreSandTileInputs["mouths"] = []): ShoreSandTileInputs => ({
  gc,
  gr,
  isLandTile,
  worldOffsetX: 100,
  worldOffsetZ: 100,
  waterY: WATER_Y,
  mouths,
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
    for (const v of vs) expect(v.z).toBeLessThanOrEqual(MAX_REACH + 1e-6);
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

  it("fills a concave sea corner well past the plain straight-coast reach", () => {
    // Land to the north and east of sea tile (0, 0).
    const corner = (x: number, z: number): boolean => z < 0 || x > 0;
    const b = emptyBuffers();
    appendShoreSand(b, inputs(0, 0, corner));
    // Some sand sits on the corner's diagonal further out than a straight
    // coast's reach would ever take it.
    const diagonal = vertices(b).filter((v) => Math.abs(1 - v.x - v.z) < 0.05);
    expect(Math.max(...diagonal.map((v) => Math.hypot(1 - v.x, v.z)))).toBeGreaterThan(MAX_REACH * Math.SQRT2);
  });

  it("stands clear of a river mouth", () => {
    const b = emptyBuffers();
    appendShoreSand(b, inputs(0, 0, straightCoast, [{ x: 0.5, z: 0 }]));
    // Right at the mouth the strip pinches to nothing: whatever is left there
    // hugs the land edge instead of reaching out over the river's water.
    for (const v of vertices(b)) if (Math.hypot(v.x - 0.5, v.z) < 0.15) expect(v.z).toBeLessThan(0.02);
  });
});
