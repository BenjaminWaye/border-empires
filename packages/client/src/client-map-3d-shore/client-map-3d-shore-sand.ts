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
// Shape: see client-map-3d-shore-waterline.ts. The fringe fills the sand
// side of that waterline, cut along it on a per-tile sample grid.
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
import type { ShoreWaterline } from "./client-map-3d-shore-waterline.js";

// Sample grid per sea tile, per side. Cost grows with its square, and the
// fringe is rebuilt on the main thread on every terrain rebuild: 8 cost
// seconds for a zoomed-out coast; 4 is ~0.09 ms per coastal tile (~200 ms
// for a 140x100 view that is nearly all coastline, on a desktop) and looks
// the same up close. Far out, where a tile is a few pixels,
// SHORE_SAND_SUBDIV_FAR (~0.04 ms) is plenty; client-map-3d-shore-layers.ts picks.
export const SHORE_SAND_SUBDIV = 4;
export const SHORE_SAND_SUBDIV_FAR = 2;
// Width (tiles) of the band inside the waterline that ShoreSandBuffers.seaward
// ramps across. The fringe is cut along its inner edge, so the ramp follows
// the waterline; kept under the narrowest beach (~0.11, at a diagonal
// coast's outer corners) so territory reaches full strength on the sand
// before its square tile edge.
const SHORE_SEAWARD_BAND = 0.1;
// Above the calm water at the waterline -- and clear of the shore foam
// (FOAM_LIFT_Y, 0.004), which otherwise z-fought through the fringe as a
// square patch in concave corners; above the land's own edge at the coast
// so the fringe covers the land's coast skirt instead of z-fighting it.
const WATERLINE_LIFT = 0.008;
const LAND_EDGE_LIFT = 0.002;
// How far (tiles) fringe vertices on a land tile's edge are tucked in under
// that tile. The land tile meets the fringe with vertices only at its
// corners while the fringe has many along the same edge, so the shared edge
// rasterised with pinhole cracks (T-junctions) and the water below showed
// through as faint dashed lines along the old square coastline. Both are
// opaque and coloured alike, so the sub-pixel overlap doesn't show.
export const LAND_EDGE_TUCK = 0.004;


// `corners` caches the square's four rendered corners (or null when one
// wasn't drawn), read once per sea tile rather than per fringe vertex.
type LandSquare = { readonly x: number; readonly z: number; corners?: HeightfieldCornerAttributes[] | null };
// A fringe outline point and its waterline value (> 0 inside the sand).
type FringePoint = readonly [x: number, z: number, s: number];

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
  /** Sample grid per side (default SHORE_SAND_SUBDIV). */
  readonly subdiv?: number;
};

/**
 * One clipped piece of fringe: a convex fan of `count` vertices, whose
 * indices are polygonVertices[first .. first + count), and the land tile
 * (scene grid) nearest its middle -- the tile whose overlays (ownership,
 * fog) carry on over it, see client-map-3d-ownership-shore.ts.
 */
export type ShoreFringePolygon = { readonly first: number; readonly count: number; readonly landGc: number; readonly landGr: number };

export type ShoreSandBuffers = {
  positions: number[];
  colors: number[];
  uvs: number[];
  tundra: number[];
  /**
   * Per vertex: 0 from SHORE_SEAWARD_BAND inside the waterline inward,
   * easing to 1 on the waterline. Measured from the curved waterline rather
   * than the land's square edge, so anything faded with it (the ownership
   * tint) keeps the waterline's shape.
   */
  seaward: number[];
  indices: number[];
  polygons: ShoreFringePolygon[];
  /** Vertex indices of every polygon, see ShoreFringePolygon. */
  polygonVertices: number[];
};

// Vertices already emitted for the current sea tile, by quantised position
// (1/4096 tile; the first point emitted there supplies its waterline value,
// so two points that close share it): pieces of fringe share their corners,
// and building a vertex is the costly part (one per piece per corner was ~3x the vertices, and most of
// a coast-heavy rebuild's time). Cleared per tile; bounded by one tile's
// vertex count.
const tileVertexIndex = new Map<number, number>();
const VERTEX_KEY_SCALE = 4096;
const vertexKey = (x: number, z: number): number =>
  (Math.round(x * VERTEX_KEY_SCALE) + 2 ** 20) * 2 ** 21 + (Math.round(z * VERTEX_KEY_SCALE) + 2 ** 20);

// `owner`: index (in the tile's land list) of the land square nearest it.
type Sample = { s: number; x: number; z: number; owner: number };

const newCorner = (): HeightfieldCornerAttributes => ({ y: 0, r: 0, g: 0, b: 0, forestZone: 0, tundraZone: 0 });

/** Appends the fringe for one sea tile. Open sea (no land among its 8 neighbours) adds nothing. */
export const appendShoreSand = (buffers: ShoreSandBuffers, inputs: ShoreSandTileInputs): void => {
  const { gc, gr, isLandTile, worldOffsetX, worldOffsetZ, waterY, waterline, cornerAt } = inputs;
  // Edge neighbours before diagonal ones: distanceToLand keeps the first
  // of equally near squares, and where a diagonal square only touches the
  // tile's corner it must not win the tie there over the edge neighbours,
  // or splitByLand can't separate them cleanly.
  const land: LandSquare[] = [];
  for (const [dx, dz] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    if (isLandTile(gc + dx, gr + dz)) land.push({ x: gc + dx, z: gr + dz });
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
      const d = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
      if (d < best) {
        best = d;
        nearest = sq;
        qx = cx;
        qz = cz;
      }
    }
    return best;
  };

  const cornersOf = (sq: LandSquare): HeightfieldCornerAttributes[] | null => {
    if (sq.corners !== undefined) return sq.corners;
    const c = [newCorner(), newCorner(), newCorner(), newCorner()];
    const ok = cornerAt(sq.x, sq.z, c[0]!) && cornerAt(sq.x + 1, sq.z, c[1]!) && cornerAt(sq.x, sq.z + 1, c[2]!) && cornerAt(sq.x + 1, sq.z + 1, c[3]!);
    sq.corners = ok ? c : null;
    return sq.corners;
  };

  const distanceToSquare = (sq: LandSquare, x: number, z: number): number => {
    const dx = x - Math.min(Math.max(x, sq.x), sq.x + 1);
    const dz = z - Math.min(Math.max(z, sq.z), sq.z + 1);
    return Math.sqrt(dx * dx + dz * dz);
  };
  tileVertexIndex.clear();
  const emitVertex = (x: number, z: number, s: number): number => {
    const key = vertexKey(x, z);
    const existing = tileVertexIndex.get(key);
    if (existing !== undefined) return existing;
    // How far inside the sand this point is (0 on the waterline); the
    // distanceToLand call leaves `nearest`/`qx`/`qz` set for the corner lerp.
    const depth = Math.max(0, s);
    const toLand = distanceToLand(x, z);
    const sq = nearest;
    const fx = qx - sq.x;
    const fz = qz - sq.z;
    const corners = cornersOf(sq);
    const ok = corners !== null;
    const w00 = (1 - fx) * (1 - fz);
    const w10 = fx * (1 - fz);
    const w01 = (1 - fx) * fz;
    const w11 = fx * fz;
    const lerp = (k: keyof HeightfieldCornerAttributes): number =>
      corners![0]![k] * w00 + corners![1]![k] * w10 + corners![2]![k] * w01 + corners![3]![k] * w11;
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
    let px = x;
    let pz = z;
    if (toLand < 1e-9) {
      // Straight into every land square touching this point (diagonally only
      // at a square's corner), summed, so the nudge depends only on position
      // and neighbouring fringe pieces (in this sea tile or the next) move a
      // shared point the same way.
      let tx = 0;
      let tz = 0;
      for (const l of land) {
        if (distanceToSquare(l, x, z) > 1e-9) continue;
        tx += x > l.x + 1e-9 && x < l.x + 1 - 1e-9 ? 0 : Math.sign(l.x + 0.5 - x);
        tz += z > l.z + 1e-9 && z < l.z + 1 - 1e-9 ? 0 : Math.sign(l.z + 0.5 - z);
      }
      const len = Math.sqrt(tx * tx + tz * tz);
      if (len > 0) {
        px += (tx / len) * LAND_EDGE_TUCK;
        pz += (tz / len) * LAND_EDGE_TUCK;
      }
    }
    buffers.positions.push(px, y, pz);
    if (ok) buffers.colors.push(lerp("r"), lerp("g"), lerp("b"));
    else buffers.colors.push(244 / 255, 232 / 255, 198 / 255);
    buffers.tundra.push(ok ? lerp("tundraZone") : 0);
    // Ramps with s, and the fringe is cut along the s = SHORE_SEAWARD_BAND
    // contour (clipTriangle), so the fade runs between two lines that both
    // follow the waterline. Times `t` (0 at the land's edge, ~1 within the
    // band on any beach wider than it): on a beach narrower than the band
    // the fade must still start from nothing at the land tile, or the tile's
    // own full-strength tint ends on its square edge against an
    // already-faded beach.
    buffers.seaward.push((1 - Math.min(1, depth / SHORE_SEAWARD_BAND)) * t);
    buffers.uvs.push(px + worldOffsetX, pz + worldOffsetZ);
    tileVertexIndex.set(key, index);
    return index;
  };

  const n = inputs.subdiv ?? SHORE_SAND_SUBDIV;
  const samples: Sample[] = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = gc + i / n;
      const z = gr + j / n;
      const s = waterline(x, z);
      distanceToLand(x, z);
      samples.push({ s, x, z, owner: land.indexOf(nearest) });
    }
  }
  const crossing = (a: Sample, b: Sample): FringePoint => {
    const k = a.s / (a.s - b.s);
    return [a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k, 0];
  };
  const nearestSquare = (x: number, z: number): LandSquare => {
    distanceToLand(x, z);
    return nearest;
  };
  const emitPolygon = (poly: ReadonlyArray<FringePoint>, sq: LandSquare): void => {
    const first = buffers.polygonVertices.length;
    for (const [x, z, ws] of poly) {
      // Consecutive points that land on one vertex (a cut through a corner
      // already on the split line) would only add zero-area triangles.
      const v = emitVertex(x, z, ws);
      const last = buffers.polygonVertices.length > first ? buffers.polygonVertices[buffers.polygonVertices.length - 1] : -1;
      if (v !== last) buffers.polygonVertices.push(v);
    }
    if (buffers.polygonVertices.length - first > 1 && buffers.polygonVertices[buffers.polygonVertices.length - 1] === buffers.polygonVertices[first]) buffers.polygonVertices.pop();
    const count = buffers.polygonVertices.length - first;
    // Collapsed to a line or a point: nothing to draw, for the sand or the overlays.
    if (count < 3) {
      buffers.polygonVertices.length = first;
      return;
    }
    buffers.polygons.push({ first, count, landGc: sq.x, landGr: sq.z });
    const v0 = buffers.polygonVertices[first]!;
    for (let k = 1; k + 1 < count; k++) buffers.indices.push(v0, buffers.polygonVertices[first + k]!, buffers.polygonVertices[first + k + 1]!);
  };
  // Splits a piece of fringe along the line halfway between the land
  // squares nearest its corners, so each piece belongs to exactly one land
  // tile. Overlays carried onto the fringe (client-map-3d-ownership-shore.ts)
  // then meet where two owners' tiles meet on the coast in a clean line,
  // instead of a sawtooth of whole triangles given to one or the other.
  // Convex in, convex out; depth is bounded by the 8 neighbouring squares.
  const splitByLand = (poly: ReadonlyArray<FringePoint>, depth: number): void => {
    // Squares are compared by identity (nearestSquare returns `land`'s own
    // objects); most pieces have a single owner and stop here unallocated.
    const first = nearestSquare(poly[0]![0], poly[0]![1]);
    let other: LandSquare | null = null;
    for (let k = 1; k < poly.length && !other; k++) {
      const sq = nearestSquare(poly[k]![0], poly[k]![1]);
      if (sq !== first) other = sq;
    }
    if (!other || depth >= 8) {
      emitPolygon(poly, other ? nearestSquare(poly.reduce((t, [x]) => t + x, 0) / poly.length, poly.reduce((t, [, z]) => t + z, 0) / poly.length) : first);
      return;
    }
    const split = other;
    const f = poly.map(([x, z]) => distanceToSquare(first, x, z) - distanceToSquare(split, x, z));
    const near: FringePoint[] = [];
    const far: FringePoint[] = [];
    for (let e = 0; e < poly.length; e++) {
      const k = (e + 1) % poly.length;
      const p = poly[e]!;
      const q = poly[k]!;
      const fp = f[e]!;
      const fq = f[k]!;
      (fp <= 0 ? near : far).push(p);
      if (fp <= 0 !== fq <= 0) {
        const t = fp / (fp - fq);
        const cx = p[0] + (q[0] - p[0]) * t;
        const cz = p[1] + (q[1] - p[1]) * t;
        // Interpolated, like every other point clipTriangle places: reading
        // the true waterline here put a cut on the polygon's waterline chord
        // (where s is 0 by construction) off zero, which showed as a bright
        // notch in the territory fade wherever two owners met at the water.
        const cut: FringePoint = [cx, cz, p[2] + (q[2] - p[2]) * t];
        near.push(cut);
        far.push(cut);
      }
    }
    if (near.length >= 3) splitByLand(near, depth + 1);
    if (far.length >= 3) splitByLand(far, depth + 1);
  };
  // Keeps the inside (s > 0) part of triangle abc as a fan.
  const clipTriangle = (a: Sample, b: Sample, c: Sample): void => {
    // Corners all beside one land square (most triangles, at a quarter of a
    // tile): no owner boundary to split along, so skip splitByLand's search.
    const owner = a.owner === b.owner && b.owner === c.owner ? land[a.owner]! : null;
    const place = (piece: ReadonlyArray<FringePoint>): void => {
      if (owner) emitPolygon(piece, owner);
      else splitByLand(piece, 0);
    };
    const tri = [a, b, c];
    const poly: FringePoint[] = [];
    for (let e = 0; e < 3; e++) {
      const p = tri[e]!;
      const q = tri[(e + 1) % 3]!;
      if (p.s > 0) poly.push([p.x, p.z, p.s]);
      if (p.s > 0 !== q.s > 0) poly.push(crossing(p, q));
    }
    if (poly.length < 3) return;
    // Cut along the inner edge of the seaward fade too: interpolated across
    // the sample grid's triangles, the fade otherwise stepped along their
    // diagonals into a zigzag down the faded territory edge.
    const inner: FringePoint[] = [];
    const outer: FringePoint[] = [];
    for (let e = 0; e < poly.length; e++) {
      const p = poly[e]!;
      const q = poly[(e + 1) % poly.length]!;
      const pIn = p[2] >= SHORE_SEAWARD_BAND;
      (pIn ? inner : outer).push(p);
      if (pIn !== q[2] >= SHORE_SEAWARD_BAND) {
        const t = (SHORE_SEAWARD_BAND - p[2]) / (q[2] - p[2]);
        const cut: FringePoint = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, SHORE_SEAWARD_BAND];
        inner.push(cut);
        outer.push(cut);
      }
    }
    if (inner.length >= 3) place(inner);
    if (outer.length >= 3) place(outer);
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

/** This commit's fringe, for the overlays that extend over it; empty when none was built. */
export type ShoreFringe = {
  readonly positions: ArrayLike<number>;
  /** Per vertex, see ShoreSandBuffers.seaward. */
  readonly seaward: ArrayLike<number>;
  readonly polygons: ReadonlyArray<ShoreFringePolygon>;
  readonly polygonVertices: ArrayLike<number>;
};
export const EMPTY_SHORE_FRINGE: ShoreFringe = { positions: [], seaward: [], polygons: [], polygonVertices: [] };

export type ShoreSandLayer = {
  readonly rebuild: (tiles: ReadonlyArray<{ readonly gc: number; readonly gr: number }>, tile: Omit<ShoreSandTileInputs, "gc" | "gr">) => ShoreFringe;
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
    const buffers: ShoreSandBuffers = { positions: [], colors: [], uvs: [], tundra: [], seaward: [], indices: [], polygons: [], polygonVertices: [] };
    for (const { gc, gr } of tiles) appendShoreSand(buffers, { ...tile, gc, gr });
    if (buffers.indices.length === 0) return EMPTY_SHORE_FRINGE;
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
    return {
      positions: buffers.positions,
      seaward: buffers.seaward,
      polygons: buffers.polygons,
      polygonVertices: buffers.polygonVertices
    };
  };
  const dispose = (): void => clear();
  return { rebuild, clear, dispose };
};
