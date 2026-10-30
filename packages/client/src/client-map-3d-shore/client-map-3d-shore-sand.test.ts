import { describe, expect, it } from "vitest";
import type { HeightfieldCornerAttributes } from "../client-map-3d-heightfield/client-map-3d-heightfield-corners.js";
import { appendShoreSand, LAND_EDGE_TUCK, type ShoreSandBuffers, type ShoreSandTileInputs } from "./client-map-3d-shore-sand.js";
import { createShoreWaterline, SHORE_SAND_MAX_REACH } from "./client-map-3d-shore-waterline.js";

const WATER_Y = -0.06;
const LAND_EDGE_Y = -0.04;

const emptyBuffers = (): ShoreSandBuffers => ({ positions: [], colors: [], uvs: [], tundra: [], seaward: [], indices: [], polygons: [], polygonVertices: [] });
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
    // Covers the land edge along the whole tile (tucked just under it).
    const edgeXs = vs.filter((v) => v.z === -LAND_EDGE_TUCK).map((v) => v.x);
    for (const x of [0, 0.25, 0.5, 0.75, 1]) expect(edgeXs).toContain(x);
  });

  it("starts at the land's own edge height and settles just above the water", () => {
    const b = emptyBuffers();
    appendShoreSand(b, inputs(0, 0, straightCoast));
    const vs = vertices(b);
    const edge = vs.filter((v) => v.z === -LAND_EDGE_TUCK);
    expect(edge.length).toBeGreaterThan(0);
    for (const v of edge) expect(v.y).toBeCloseTo(LAND_EDGE_Y + 0.002, 6);
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

  it("curves smoothly past the steps of a steep stepped coast", () => {
    // Land east of a staircase one tile across per three down. The blurred
    // curve fills the notch under each step past the reach cap; a hard cap
    // cut that fill off square, a shelf whose corner showed (and carried
    // territory colour) as a notch in the beach.
    const steep = (x: number, z: number): boolean => x >= Math.floor(z / 3);
    const waterline = createShoreWaterline(steep, 100, 100, []);
    const waterlineX = (z: number): number => {
      let x = Math.floor(z / 3);
      while (waterline(x - 1 / 64, z) > 0) x -= 1 / 64;
      return x;
    };
    // A corner is a sudden change of direction: the largest second
    // difference of the waterline's position between neighbouring rows.
    const h = 1 / 16;
    let worst = 0;
    for (let z = 0.03; z < 9; z += h) {
      // Skip the rows beside each step's own land corner (z = 3, 6), which
      // the waterline has to turn round either way.
      const toCorner = Math.abs(z - Math.round(z / 3) * 3);
      if (toCorner < 0.25) continue;
      worst = Math.max(worst, Math.abs(waterlineX(z + h) - 2 * waterlineX(z) + waterlineX(z - h)));
    }
    // ~0.3 with the hard cap; ~0.11 eased.
    expect(worst).toBeLessThan(0.2);
  });

  it("runs a diagonal coast straight past its land corners, without teeth", () => {
    // Land below a 45-degree staircase. Each step's outer corner used to jut
    // into the sea as a tooth: the waterline ran right through the corners,
    // the warp dragged it inside them, a 0.48 reach cap dented it between
    // them and a 0.12 band pushed it out round them.
    const diagonal = (x: number, z: number): boolean => x + z < 0;
    const waterline = createShoreWaterline(diagonal, 100, 100, []);
    const n = Math.SQRT1_2;
    // How far out the waterline sits along the coast's normal, from a line
    // inland; through a corner at t = k + 0.5, between corners at t = k.
    const out = (t: number): number => {
      let s = 0;
      while (waterline(t - 2 * n + s * n, -t - 2 * n + s * n) > 0 && s < 6) s += 0.005;
      return s;
    };
    let tooth = 0;
    for (let k = 0; k < 12; k++) tooth += (out(k + 0.5) - (out(k) + out(k + 1)) / 2) / 12;
    // ~0.31 before; ~0.11 now, the blurred field's own wobble along a staircase.
    expect(tooth).toBeLessThan(0.15);
  });

  it("keeps open water in the middle of a one-tile lake", () => {
    const lake = (x: number, z: number): boolean => !(x === 0 && z === 0);
    expect(createShoreWaterline(lake, 100, 100, [])(0.5, 0.5)).toBeLessThan(0);
  });

  it("tucks every land-edge vertex the same way, whichever sea tile or owner it belongs to", () => {
    // The land tile meets the fringe with vertices only at its corners, so
    // their shared edge cracked (T-junctions) and water showed through as
    // dashed lines; the fringe now tucks under the land. A shared point must
    // move identically in both neighbouring sea tiles or a new crack opens.
    const elbow = (x: number, z: number): boolean => x < 0 || z < 0;
    const a = emptyBuffers();
    const b = emptyBuffers();
    appendShoreSand(a, inputs(0, 0, elbow));
    appendShoreSand(b, inputs(1, 0, elbow));
    const atX1 = (buf: ShoreSandBuffers): Set<string> =>
      new Set(vertices(buf).filter((v) => Math.abs(v.x - 1) < 1e-9 && v.z <= 0).map((v) => v.z.toFixed(9)));
    // The point on the land edge at x = 1 is tucked straight in (z < 0, x unchanged) in both tiles.
    expect([...atX1(a)]).toEqual([(-LAND_EDGE_TUCK).toFixed(9)]);
    expect([...atX1(b)]).toEqual([(-LAND_EDGE_TUCK).toFixed(9)]);
    for (const v of vertices(a)) expect(Math.min(v.x, v.z)).toBeGreaterThanOrEqual(-LAND_EDGE_TUCK - 1e-9);
  });

  it("starts the territory fade from nothing at the land edge, even on a beach narrower than the fade band", () => {
    // Beside a river mouth the beach pinches thinner than SHORE_SEAWARD_BAND;
    // the fade used to start part-way there, so the tile's own full-strength
    // tint ended on its square edge against an already-faded beach.
    const b = emptyBuffers();
    appendShoreSand(b, inputs(0, 0, straightCoast, [{ x: 0.5, z: 0 }]));
    let edge = 0;
    for (let v = 0; v < b.positions.length / 3; v++) {
      if (b.positions[v * 3 + 2] !== -LAND_EDGE_TUCK) continue;
      edge++;
      expect(b.seaward[v]).toBe(0);
    }
    expect(edge).toBeGreaterThan(0);
  });

  it("gives each piece of fringe to exactly one land tile, split cleanly between neighbours", () => {
    // Sea tile (0, 0) sits in the elbow of land to the west and north: its
    // beach must split along the diagonal between them, not in a sawtooth.
    const elbow = (x: number, z: number): boolean => x < 0 || z < 0;
    const b = emptyBuffers();
    appendShoreSand(b, inputs(0, 0, elbow));
    const owners = new Set(b.polygons.map((p) => `${p.landGc},${p.landGr}`));
    expect(owners.has("-1,0")).toBe(true);
    expect(owners.has("0,-1")).toBe(true);
    for (const polygon of b.polygons) {
      for (let v = 0; v < polygon.count; v++) {
        const i = b.polygonVertices[polygon.first + v]! * 3;
        const x = b.positions[i]!;
        const z = b.positions[i + 2]!;
        // Within the tile, distance to the west tile is x and to the north
        // tile z: every vertex lies on its own tile's side of x = z.
        if (polygon.landGc === -1) expect(x).toBeLessThanOrEqual(z + 1e-9);
        else if (polygon.landGr === -1) expect(z).toBeLessThanOrEqual(x + 1e-9);
      }
    }
  });
});
