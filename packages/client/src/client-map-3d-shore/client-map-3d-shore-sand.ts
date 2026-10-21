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
// Shape: the sand covers sea within `reach` of any land square (an offset
// curve: straight coasts get an even strip, convex land corners a round
// arc), plus a fillet of radius SHORE_SAND_FILLET in each concave sea
// corner (land on two orthogonal sides). The reach wobbles with world noise
// so the strip isn't a ruler-straight band, and fades to nothing at river
// mouths so it never dams a river. Everything is a function of world
// position and the 8 neighbours, so adjacent sea tiles meet seamlessly.
//
// Surface: drawn with the heightfield's own material, coloured from the
// land's rendered coast corners (cornerAt) and starting at the land's exact
// edge height, then easing down to just above the calm water at the
// waterline -- so the beach texture, the wet band and the lighting carry
// straight on from the land tile with no seam, and the land's coast skirt
// is covered from above.
import { BufferAttribute, BufferGeometry, Mesh, type Material, type Scene } from "three";
import type { HeightfieldCornerAttributes } from "../client-map-3d-heightfield/client-map-3d-heightfield-corners.js";
import { foamMouthFade } from "./client-map-3d-shore.js";

/** How far (tiles) the beach reaches into the sea along a straight coast. */
export const SHORE_SAND_REACH = 0.27;
const SHORE_SAND_REACH_WOBBLE = 0.4; // +- fraction of the reach
const SHORE_SAND_NOISE_SCALE = 1.3; // world tiles^-1
const SHORE_SAND_FILLET = 0.55;
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

/**
 * The fringe's reach (tiles) at scene point (x, z): world noise for the
 * wobble, faded out around river mouths (scene coords). The shore foam
 * starts its band here too, so it sits on the new waterline.
 */
export const shoreSandReachAt = (
  x: number,
  z: number,
  worldOffsetX: number,
  worldOffsetZ: number,
  mouths: ReadonlyArray<{ readonly x: number; readonly z: number }>
): number => {
  const noise = valueNoise((x + worldOffsetX) * SHORE_SAND_NOISE_SCALE, (z + worldOffsetZ) * SHORE_SAND_NOISE_SCALE);
  const reach = SHORE_SAND_REACH * (1 + SHORE_SAND_REACH_WOBBLE * (noise * 2 - 1));
  if (mouths.length === 0) return reach;
  // Squared: the foam's own fade still left a sand lip across the river
  // just off the mouth; this pinches the strip to nothing there.
  const fade = foamMouthFade(x, z, mouths);
  return reach * fade * fade;
};

type LandSquare = { readonly x: number; readonly z: number };
type ConcaveCorner = { readonly edgeX: number; readonly edgeZ: number };

export type ShoreSandTileInputs = {
  /** Scene grid coords of the sea tile. */
  readonly gc: number;
  readonly gr: number;
  readonly isLandTile: (gc: number, gr: number) => boolean;
  /** Scene grid -> absolute world grid. */
  readonly worldOffsetX: number;
  readonly worldOffsetZ: number;
  readonly waterY: number;
  readonly mouths: ReadonlyArray<{ readonly x: number; readonly z: number }>;
  /** Rendered land corner at scene corner (x, z); false if the heightfield didn't draw it. */
  readonly cornerAt: (sceneCornerX: number, sceneCornerZ: number, out: HeightfieldCornerAttributes) => boolean;
};

export type ShoreSandBuffers = { positions: number[]; colors: number[]; uvs: number[]; tundra: number[]; indices: number[] };

type Sample = { s: number; x: number; z: number };

const newCorner = (): HeightfieldCornerAttributes => ({ y: 0, r: 0, g: 0, b: 0, forestZone: 0, tundraZone: 0 });
const cornerScratch = [newCorner(), newCorner(), newCorner(), newCorner()];

/** Appends the fringe for one sea tile. Open sea (no land among its 8 neighbours) adds nothing. */
export const appendShoreSand = (buffers: ShoreSandBuffers, inputs: ShoreSandTileInputs): void => {
  const { gc, gr, isLandTile, worldOffsetX, worldOffsetZ, waterY, mouths, cornerAt } = inputs;
  const land: LandSquare[] = [];
  for (let k = 0; k < 9; k++) {
    if (k === 4) continue;
    const x = gc + (k % 3) - 1;
    const z = gr + Math.floor(k / 3) - 1;
    if (isLandTile(x, z)) land.push({ x, z });
  }
  if (land.length === 0) return;
  const north = isLandTile(gc, gr - 1);
  const south = isLandTile(gc, gr + 1);
  const west = isLandTile(gc - 1, gr);
  const east = isLandTile(gc + 1, gr);
  const concave: ConcaveCorner[] = [];
  if (north && east) concave.push({ edgeX: gc + 1, edgeZ: gr });
  if (north && west) concave.push({ edgeX: gc, edgeZ: gr });
  if (south && east) concave.push({ edgeX: gc + 1, edgeZ: gr + 1 });
  if (south && west) concave.push({ edgeX: gc, edgeZ: gr + 1 });

  const reachAt = (x: number, z: number): number => shoreSandReachAt(x, z, worldOffsetX, worldOffsetZ, mouths);

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

  // > 0 inside the sand.
  const insideAt = (x: number, z: number): number => {
    const r = reachAt(x, z);
    let s = r - distanceToLand(x, z);
    for (const c of concave) {
      const u = Math.max(0, r + SHORE_SAND_FILLET - Math.abs(x - c.edgeX));
      const w = Math.max(0, r + SHORE_SAND_FILLET - Math.abs(z - c.edgeZ));
      s = Math.max(s, Math.hypot(u, w) - SHORE_SAND_FILLET);
    }
    return s;
  };

  const emitVertex = (x: number, z: number): number => {
    const r = Math.max(reachAt(x, z), 1e-6);
    // How far inside the sand this point is (0 on the waterline). Its
    // distanceToLand call also leaves `nearest`/`qx`/`qz` set for this point,
    // which the corner lerp below reads.
    const depth = insideAt(x, z);
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
    const edgeY = ok ? lerp("y") + LAND_EDGE_LIFT : waterY + WATERLINE_LIFT;
    // Rises from the waterline to the land's edge with depth, so a concave
    // fillet (land on two sides) slopes up into its corner too.
    const t = 1 - Math.min(1, Math.max(0, depth) / r);
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
      samples.push({ s: insideAt(x, z), x, z });
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
