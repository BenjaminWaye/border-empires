// Soft shoreline: a fringe of beach that reaches a short way into every sea
// tile touching land, so the waterline follows a rounded curve instead of
// the square edge of each sea tile.
//
// The ocean is a sheet of whole sea-tile squares (client-map-3d-water-surface.ts)
// and land meets it at a pinned coast edge just above the water with a
// vertical skirt beneath, so without this every coastline was a staircase
// of tile edges. The fringe is purely visual: which tiles are land or sea is
// untouched, and nothing gameplay-facing reads its height.
//
// Shape: the waterline is where a smoothly blurred map of which tiles are
// land (a quadratic B-spline over tile centres) crosses SHORE_FIELD_THRESHOLD,
// sampled at a position warped by world noise at two scales. Blurring
// straightens a staircase coast into a diagonal shore, fills notches and
// keeps points gently rounded, and the warp adds irregularity that isn't
// keyed to the tile grid. (An earlier offset-curve shape -- an arc round
// every convex corner, a fillet in every notch -- turned a stepped coast
// into a regular row of scallops.) Two clamps: sand never reaches past
// SHORE_SAND_MAX_REACH from real land, so every sea tile keeps open water at
// its centre and a one-tile inlet never silts up; and a SHORE_SAND_MIN_BAND
// of sand always rings land, so a land tip never shows its square corner.
// The reach pinches to nothing at river mouths so the fringe never dams a
// river. Everything is a function of world position, so adjacent sea tiles
// meet seamlessly; the shore foam reads the same waterline.
//
// Surface: drawn with the heightfield's own material, coloured from the
// land's rendered coast corners (cornerAt) and starting at the land's exact
// edge height, then easing down to just above the calm water at the
// waterline -- so the beach texture, the wet band and the lighting carry
// straight on from the land tile with no seam, and the land's coast skirt
// is covered from above.
import { BufferAttribute, BufferGeometry, Mesh, type Material, type Scene } from "three";
import type { HeightfieldCornerAttributes } from "../client-map-3d-heightfield/client-map-3d-heightfield-corners.js";
import { COAST_EDGE_Y } from "../client-map-3d-heightfield-terrain.js";
import { foamMouthFade } from "./client-map-3d-shore.js";

// Blurred land field (1 deep inland, 0.5 on a straight coast's tile edge)
// threshold: 0.22 puts a straight coast's waterline ~0.34 tiles out.
const SHORE_FIELD_THRESHOLD = 0.22;
// d(field)/d(distance) near that waterline, to read the field as tiles.
const SHORE_FIELD_SLOPE = 0.66;
/** Furthest (tiles) the beach ever reaches into the sea from real land. */
export const SHORE_SAND_MAX_REACH = 0.42;
const SHORE_SAND_MIN_BAND = 0.07;
// Domain warp of the field sample: broad bays/headlands plus fine wiggle.
const SHORE_WARP_BROAD = 0.22;
const SHORE_WARP_BROAD_SCALE = 0.9;
const SHORE_WARP_FINE = 0.07;
const SHORE_WARP_FINE_SCALE = 2.6;
const SHORE_SAND_SUBDIV = 8;
// Above the calm water at the waterline -- and clear of the shore foam
// (FOAM_LIFT_Y, 0.004), which otherwise z-fought through the fringe as a
// square patch in concave corners; above the land's own edge at the coast
// so the fringe covers the land's coast skirt instead of z-fighting it.
const WATERLINE_LIFT = 0.008;
const LAND_EDGE_LIFT = 0.002;

const hash = (x: number, z: number): number => {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
};
const valueNoise = (x: number, z: number): number => {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
};

const bspline = (t: number): number => {
  const a = Math.abs(t);
  if (a < 0.5) return 0.75 - a * a;
  if (a < 1.5) return 0.5 * (1.5 - a) * (1.5 - a);
  return 0;
};

const distanceToLandNear = (x: number, z: number, isLandTile: (gc: number, gr: number) => boolean): number => {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  let best = Infinity;
  for (let j = cz - 1; j <= cz + 1; j++) {
    for (let i = cx - 1; i <= cx + 1; i++) {
      if (!isLandTile(i, j)) continue;
      const d = Math.hypot(x - Math.min(Math.max(x, i), i + 1), z - Math.min(Math.max(z, j), j + 1));
      if (d < best) best = d;
    }
  }
  return best;
};

/** Signed shoreline at scene point (x, z), in tiles: > 0 inside the sand, < 0 out over the water. */
export type ShoreWaterline = (x: number, z: number) => number;

/**
 * The soft waterline for one water commit (scene grid coords). The sand
 * fringe draws where it is > 0 and the shore foam fades out from its zero
 * line, so the two always agree.
 */
export const createShoreWaterline = (
  isLandTile: (gc: number, gr: number) => boolean,
  worldOffsetX: number,
  worldOffsetZ: number,
  mouths: ReadonlyArray<{ readonly x: number; readonly z: number }>
): ShoreWaterline => (x, z) => {
  const wx = x + worldOffsetX;
  const wz = z + worldOffsetZ;
  const b = SHORE_WARP_BROAD_SCALE;
  const f = SHORE_WARP_FINE_SCALE;
  const px =
    x + (valueNoise(wx * b, wz * b) - 0.5) * 2 * SHORE_WARP_BROAD + (valueNoise(wx * f + 17, wz * f + 3) - 0.5) * 2 * SHORE_WARP_FINE;
  const pz =
    z + (valueNoise(wx * b + 31, wz * b + 7) - 0.5) * 2 * SHORE_WARP_BROAD + (valueNoise(wx * f + 5, wz * f + 29) - 0.5) * 2 * SHORE_WARP_FINE;
  let field = 0;
  for (let j = Math.floor(pz - 1.5); j <= Math.floor(pz + 1.5); j++) {
    const wzj = bspline(pz - (j + 0.5));
    if (wzj === 0) continue;
    for (let i = Math.floor(px - 1.5); i <= Math.floor(px + 1.5); i++) {
      if (isLandTile(i, j)) field += bspline(px - (i + 0.5)) * wzj;
    }
  }
  const d = distanceToLandNear(x, z, isLandTile);
  // No land within a tile: open water (and keeps Infinity out of the maths
  // below -- 0 * Infinity there came out NaN, which drew foam as solid bars).
  if (d === Infinity) return -1;
  const shaped = Math.max(
    Math.min((field - SHORE_FIELD_THRESHOLD) / SHORE_FIELD_SLOPE, SHORE_SAND_MAX_REACH - d),
    SHORE_SAND_MIN_BAND - d
  );
  if (mouths.length === 0) return shaped;
  // Squared: the foam's own fade still left a sand lip across the river
  // just off the mouth; this pinches the strip to nothing there.
  const fade = foamMouthFade(x, z, mouths) ** 2;
  return shaped * fade - (1 - fade) * d;
};

type LandSquare = { readonly x: number; readonly z: number };

export type ShoreSandTileInputs = {
  /** Scene grid coords of the sea tile. */
  readonly gc: number;
  readonly gr: number;
  readonly isLandTile: (gc: number, gr: number) => boolean;
  /** Scene grid -> absolute world grid. */
  readonly worldOffsetX: number;
  readonly worldOffsetZ: number;
  readonly waterY: number;
  readonly waterline: ShoreWaterline;
  /** Rendered land corner at scene corner (x, z); false if the heightfield didn't draw it. */
  readonly cornerAt: (sceneCornerX: number, sceneCornerZ: number, out: HeightfieldCornerAttributes) => boolean;
};

export type ShoreSandBuffers = { positions: number[]; colors: number[]; uvs: number[]; tundra: number[]; indices: number[] };

type Sample = { s: number; x: number; z: number };

const newCorner = (): HeightfieldCornerAttributes => ({ y: 0, r: 0, g: 0, b: 0, forestZone: 0, tundraZone: 0 });
const cornerScratch = [newCorner(), newCorner(), newCorner(), newCorner()];

/** Appends the fringe for one sea tile. Open sea (no land among its 8 neighbours) adds nothing. */
export const appendShoreSand = (buffers: ShoreSandBuffers, inputs: ShoreSandTileInputs): void => {
  const { gc, gr, isLandTile, worldOffsetX, worldOffsetZ, waterY, waterline, cornerAt } = inputs;
  const land: LandSquare[] = [];
  for (let k = 0; k < 9; k++) {
    if (k === 4) continue;
    const x = gc + (k % 3) - 1;
    const z = gr + Math.floor(k / 3) - 1;
    if (isLandTile(x, z)) land.push({ x, z });
  }
  if (land.length === 0) return;
  // Nearest land square: distance and the closest point on its boundary.
  let nearest: LandSquare = land[0]!;
  let qx = 0;
  let qz = 0;
  const distanceToLand = (x: number, z: number): number => {
    let best = Infinity;
    for (const sq of land) {
      const cx = Math.min(Math.max(x, sq.x), sq.x + 1);
      const cz = Math.min(Math.max(z, sq.z), sq.z + 1);
      const d = Math.hypot(x - cx, z - cz);
      if (d < best) {
        best = d;
        nearest = sq;
        qx = cx;
        qz = cz;
      }
    }
    return best;
  };

  const emitVertex = (x: number, z: number): number => {
    // How far inside the sand this point is (0 on the waterline); the
    // distanceToLand call leaves `nearest`/`qx`/`qz` set for the corner lerp.
    const depth = Math.max(0, waterline(x, z));
    const toLand = distanceToLand(x, z);
    const sq = nearest;
    const fx = qx - sq.x;
    const fz = qz - sq.z;
    const [c00, c10, c01, c11] = cornerScratch as [HeightfieldCornerAttributes, HeightfieldCornerAttributes, HeightfieldCornerAttributes, HeightfieldCornerAttributes];
    const ok =
      cornerAt(sq.x, sq.z, c00) && cornerAt(sq.x + 1, sq.z, c10) && cornerAt(sq.x, sq.z + 1, c01) && cornerAt(sq.x + 1, sq.z + 1, c11);
    const lerp = (k: keyof HeightfieldCornerAttributes): number => {
      const top = c00[k] + (c10[k] - c00[k]) * fx;
      const bottom = c01[k] + (c11[k] - c01[k]) * fx;
      return top + (bottom - top) * fz;
    };
    // Unreadable corner (outside the heightfield's built window): assume
    // the standard coast pin. Falling back to water level instead dropped
    // the fringe below the land edge, exposing the land's coast skirt as a
    // dark line along the old tile-edge coastline.
    const edgeY = (ok ? lerp("y") : COAST_EDGE_Y) + LAND_EDGE_LIFT;
    // Where this point sits between the waterline (0) and the land's edge
    // (1): exactly the land's height at its edge and the water's at the
    // waterline however narrow the noise makes the strip, so the land's coast
    // skirt never peeks out. A filled notch slopes up into its corner too.
    const t = 1 - (depth + toLand > 0 ? depth / (depth + toLand) : 1);
    const ease = t * t * (3 - 2 * t);
    const y = edgeY + (waterY + WATERLINE_LIFT - edgeY) * ease;
    const index = buffers.positions.length / 3;
    buffers.positions.push(x, y, z);
    if (ok) buffers.colors.push(lerp("r"), lerp("g"), lerp("b"));
    else buffers.colors.push(244 / 255, 232 / 255, 198 / 255);
    buffers.tundra.push(ok ? lerp("tundraZone") : 0);
    buffers.uvs.push(x + worldOffsetX, z + worldOffsetZ);
    return index;
  };

  const n = SHORE_SAND_SUBDIV;
  const samples: Sample[] = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = gc + i / n;
      const z = gr + j / n;
      samples.push({ s: waterline(x, z), x, z });
    }
  }
  const crossing = (a: Sample, b: Sample): [number, number] => {
    const k = a.s / (a.s - b.s);
    return [a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k];
  };
  // Keeps the inside (s > 0) part of triangle abc as a fan.
  const clipTriangle = (a: Sample, b: Sample, c: Sample): void => {
    const tri = [a, b, c];
    const poly: [number, number][] = [];
    for (let e = 0; e < 3; e++) {
      const p = tri[e]!;
      const q = tri[(e + 1) % 3]!;
      if (p.s > 0) poly.push([p.x, p.z]);
      if (p.s > 0 !== q.s > 0) poly.push(crossing(p, q));
    }
    if (poly.length < 3) return;
    const ids = poly.map(([x, z]) => emitVertex(x, z));
    for (let k = 1; k + 1 < ids.length; k++) buffers.indices.push(ids[0]!, ids[k]!, ids[k + 1]!);
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = samples[j * (n + 1) + i]!;
      const b = samples[j * (n + 1) + i + 1]!;
      const c = samples[(j + 1) * (n + 1) + i]!;
      const d = samples[(j + 1) * (n + 1) + i + 1]!;
      if (a.s <= 0 && b.s <= 0 && c.s <= 0 && d.s <= 0) continue;
      // Same winding as the water sheet (normal up).
      clipTriangle(a, c, b);
      clipTriangle(b, c, d);
    }
  }
};

export type ShoreSandLayer = {
  readonly rebuild: (tiles: ReadonlyArray<{ readonly gc: number; readonly gr: number }>, tile: Omit<ShoreSandTileInputs, "gc" | "gr">) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

/** `material` must be the heightfield's own (shared) material -- see the module comment. */
export const createShoreSandLayer = (scene: Scene, material: Material): ShoreSandLayer => {
  let mesh: Mesh | null = null;
  const clear = (): void => {
    if (!mesh) return;
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh = null;
  };
  const rebuild: ShoreSandLayer["rebuild"] = (tiles, tile) => {
    clear();
    const buffers: ShoreSandBuffers = { positions: [], colors: [], uvs: [], tundra: [], indices: [] };
    for (const { gc, gr } of tiles) appendShoreSand(buffers, { ...tile, gc, gr });
    if (buffers.indices.length === 0) return;
    const vertCount = buffers.positions.length / 3;
    const normals = new Float32Array(vertCount * 3);
    // The fringe drops ~0.03 over a quarter tile: close enough to flat that
    // an up normal shades it like the beach it continues.
    for (let v = 0; v < vertCount; v++) normals[v * 3 + 1] = 1;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(buffers.positions), 3));
    geometry.setAttribute("normal", new BufferAttribute(normals, 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(buffers.colors), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(buffers.uvs), 2));
    // The heightfield material's shader patch reads these on every mesh it draws.
    geometry.setAttribute("forestZone", new BufferAttribute(new Float32Array(vertCount), 1));
    geometry.setAttribute("tundraZone", new BufferAttribute(new Float32Array(buffers.tundra), 1));
    geometry.setAttribute("rockZone", new BufferAttribute(new Float32Array(vertCount), 1));
    geometry.setIndex(buffers.indices);
    mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  const dispose = (): void => clear();
  return { rebuild, clear, dispose };
};
