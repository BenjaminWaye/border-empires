// Mountain ranges in the true-3D map, in a chunky low-poly style: touching
// mountain tiles are drawn as one continuous surface -- the union of a
// terraced, slightly irregular rock cone per tile -- instead of a separate
// peak per tile (whose overlapping cones read as a buggy jumble) or a strip
// extruded from the tile squares (which read as boxes). Summit tiles are
// tall, the rest lower shoulders, so a range reads as distinct mountains
// merging at their feet. The cones spill a little past the mountain tiles,
// so footprints are organic rather than square.
//
// Heights are a pure function of world position, sampled on a quarter-tile
// lattice shared by neighbouring tiles, so the surface has no seams. It sinks
// just under the ground where no cone reaches, so it rises out of the terrain.
// Quads split along the diagonal joining their higher corners (crisp ridges);
// each facet has one flat colour (client-map-3d-mountain-palette.ts).
//
// Lone mountains (no orthogonal mountain neighbour) keep their single
// instanced peak (client-map-3d-mountain-massif.ts).
import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial, Scene } from "three";
import {
  mountainHash01,
  mountainNeighbourhoodAt,
  mountainVariationAt,
  type MountainNeighbourhoodLookup
} from "./client-map-mountain-variation/client-map-mountain-variation.js";
import { MOUNTAIN_HEIGHT } from "./client-map-3d-mountain-shape.js";
import { mountainFacetColor, terraceHeight } from "./client-map-3d-mountain-palette.js";

export type MountainRangeDeps = MountainNeighbourhoodLookup & {
  /** Rendered terrain height at a world corner; ranges rise from it. Defaults to 0. */
  readonly cornerYAt?: (cornerX: number, cornerZ: number) => number;
  /** River mountains (client-map-river-mountains.ts): direction of the gully cut toward the river. */
  readonly riverFaceAt?: (wx: number, wy: number) => { readonly dirX: number; readonly dirY: number } | null;
};

/** Quads per tile edge. */
const Q = 4;
// Where no cone reaches, the surface sits this far under the ground.
const SINK = 0.06;
// Each tile's cone reaches the ground this far (tile units) from its centre.
// Summits are wide, so each mountain spans its neighbours and dominates
// them; shoulders are low fill between summits, reaching a little past
// their own tile edge (0.5) so footprints aren't square.
const SUMMIT_REACH = 1.2;
const SHOULDER_REACH = 0.75;
// Summits are the tiles whose hash beats every orthogonal mountain
// neighbour's; the rest are shoulders this fraction of a summit's height.
const SHOULDER = 0.55;
// Some summits are flat-topped mesas (cut at this fraction of their height),
// whose tops come out as grass.
const MESA_CHANCE = 0.35;
const MESA_TOP = 0.72;
const SUMMIT_SALT = 21;
// A gentle grassy apron round each mountain's foot (instead of the cone's
// steep edge hanging straight into the ground): this high, reaching this
// much further out than the cone.
const APRON_HEIGHT = 0.22;
const APRON_EXTRA_REACH = 0.4;
// Irregular cones: the reach varies with direction (ridges and hollows).
const LOBES = 5;
const LOBE_DEPTH = 0.18;
// Ledge height of the terracing (stratified rock, grass on the ledges).
const TERRACE_STEP = 0.2;
// Ground already raised under a range (the heightfield ridges shared
// mountain corners up toward HEIGHTFIELD_MOUNTAIN_ELEVATION) eats into the
// added height, so deep range interiors don't tower twice as high.
const GRASS_Y = 0.18;
const PLATEAU_SPAN = 0.97;
const PLATEAU_DAMP = 0.25;
// How far the gully on a river mountain cuts down, as a fraction of its peak.
const GULLY_CUT = 0.32;

type TileInfo = {
  readonly mountain: boolean;
  readonly peak: number;
  readonly heightScale: number;
  readonly snowLine: number;
  readonly tint: number;
  readonly warmth: number;
  readonly lobePhase: number;
  readonly reach: number;
  /** Flat top height (mesas), or Infinity for a pointed peak. */
  readonly cap: number;
  /** Direction (-1/+1 each axis) from the tile centre toward the river gully's exit corner. */
  readonly gully: { readonly sx: number; readonly sy: number } | null;
};

const NOT_MOUNTAIN: TileInfo = { mountain: false, peak: 0, heightScale: 0, snowLine: 0, tint: 0, warmth: 0, lobePhase: 0, reach: 0, cap: Infinity, gully: null };

/** True when (wx, wy) is a mountain with at least one orthogonal mountain neighbour: drawn as part of a range. */
export const isRangeTile = (wx: number, wy: number, lookup: MountainNeighbourhoodLookup): boolean => {
  if (!lookup.isMountainAt(wx, wy)) return false;
  const n = mountainNeighbourhoodAt(wx, wy, lookup);
  return n.north || n.east || n.south || n.west;
};

type RangeSampler = {
  /** Per-pass cache of lattice points (null: uncached, for one-off surface queries). */
  readonly points: Map<number, LatticePoint> | null;
  readonly tileInfo: (wx: number, wy: number) => TileInfo;
  /** Height above the ground of lattice point (gx, gy) (quarter-tile world lattice), and which tile's cone made it. */
  readonly pointHeight: (gx: number, gy: number) => { readonly h: number; readonly owner: TileInfo };
  /** Rendered ground at a world point (bilinear over the tile's corners). */
  readonly groundAt: (x: number, z: number) => number;
};

// Numeric keys for the per-pass caches (string keys dominated the rebuild cost).
const tileKey = (wx: number, wy: number): number => wy * 1_000_003 + wx;

const createSampler = (deps: MountainRangeDeps, cache: Map<number, TileInfo> | null): RangeSampler => {
  const { wrapX, wrapY } = deps;
  const tileInfo = (rawX: number, rawY: number): TileInfo => {
    const wx = wrapX(rawX);
    const wy = wrapY(rawY);
    const key = tileKey(wx, wy);
    const hit = cache?.get(key);
    if (hit) return hit;
    let info = NOT_MOUNTAIN;
    // Only range tiles raise cones: a lone mountain is drawn by its own instanced peak.
    if (isRangeTile(wx, wy, deps)) {
      const v = mountainVariationAt(wx, wy, mountainNeighbourhoodAt(wx, wy, deps));
      const own = mountainHash01(wx, wy, SUMMIT_SALT);
      const summit = [[0, -1], [1, 0], [0, 1], [-1, 0]].every(([dx, dy]) => {
        const nx = wrapX(wx + dx!);
        const ny = wrapY(wy + dy!);
        return !deps.isMountainAt(nx, ny) || mountainHash01(nx, ny, SUMMIT_SALT) < own;
      });
      const face = deps.riverFaceAt?.(wx, wy) ?? null;
      const peak = MOUNTAIN_HEIGHT * v.heightScale * (summit ? 1 : SHOULDER);
      // River mountains stay pointed: their gully runs down from the summit.
      const mesa = summit && !face && mountainHash01(wx, wy, 25) < MESA_CHANCE;
      info = {
        mountain: true,
        peak,
        reach: summit ? SUMMIT_REACH : SHOULDER_REACH,
        cap: mesa ? peak * MESA_TOP : Infinity,
        heightScale: v.heightScale,
        snowLine: summit && !mesa ? v.snowLine : 0,
        tint: v.tint,
        warmth: v.warmth,
        lobePhase: mountainHash01(wx, wy, 23) * Math.PI * 2,
        gully: face ? { sx: Math.sign(face.dirX) || 1, sy: Math.sign(face.dirY) || 1 } : null
      };
    }
    cache?.set(key, info);
    return info;
  };
  const cornerY = (cx: number, cz: number): number => deps.cornerYAt?.(wrapX(cx), wrapY(cz)) ?? 0;
  const groundAt = (x: number, z: number): number => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const top = cornerY(ix, iz) * (1 - fx) + cornerY(ix + 1, iz) * fx;
    const bottom = cornerY(ix, iz + 1) * (1 - fx) + cornerY(ix + 1, iz + 1) * fx;
    return top * (1 - fz) + bottom * fz;
  };
  const pointHeight = (gx: number, gy: number): { h: number; owner: TileInfo } => {
    const px = gx / Q;
    const pz = gy / Q;
    const cx = Math.floor(px);
    const cz = Math.floor(pz);
    let crest = 0;
    let owner = NOT_MOUNTAIN;
    let gullyCut = 0;
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const t = tileInfo(cx + dx, cz + dz);
        if (!t.mountain) continue;
        const ox = px - (cx + dx + 0.5);
        const oz = pz - (cz + dz + 0.5);
        const d = Math.hypot(ox, oz);
        // Out of this tile's cone and apron (and gully) entirely: skip the trig.
        if (d >= t.reach + APRON_EXTRA_REACH) continue;
        const reach = t.reach * (1 - LOBE_DEPTH * 0.5 * (1 + Math.sin(LOBES * Math.atan2(ox, oz) + t.lobePhase)));
        const cone = Math.min(t.cap, t.peak * Math.max(0, 1 - d / reach));
        const apron = APRON_HEIGHT * Math.max(0, 1 - d / (reach + APRON_EXTRA_REACH)) ** 1.5;
        const h = Math.max(cone, apron);
        if (h > crest) {
          crest = h;
          owner = t;
        }
        if (t.gully && Math.abs(ox) < 0.6 && Math.abs(oz) < 0.6) {
          // A V cut along the line from the tile centre to its exit corner.
          const along = (ox * t.gully.sx + oz * t.gully.sy) / Math.SQRT2;
          const across = Math.abs(ox * t.gully.sy - oz * t.gully.sx) / Math.SQRT2;
          if (along > 0.08) gullyCut = Math.max(gullyCut, GULLY_CUT * t.peak * Math.max(0, 1 - across / 0.18) * Math.min(1, along / 0.25));
        }
      }
    }
    if (crest <= 0) return { h: -SINK, owner };
    const jitter = (mountainHash01(gx, gy, 31) - 0.5) * 0.08;
    return { h: terraceHeight(crest * (1 + jitter), TERRACE_STEP) - gullyCut - SINK, owner };
  };
  return { points: cache ? new Map<number, LatticePoint>() : null, tileInfo, pointHeight, groundAt };
};

type LatticePoint = { readonly x: number; readonly y: number; readonly z: number; readonly h: number; readonly owner: TileInfo };

/** Absolute position of lattice point (gx, gy): ground plus its height, damped where the ground is already raised. */
const latticePoint = (s: RangeSampler, gx: number, gy: number): LatticePoint => {
  const key = tileKey(gx, gy);
  const hit = s.points?.get(key);
  if (hit) return hit;
  const point = computeLatticePoint(s, gx, gy);
  s.points?.set(key, point);
  return point;
};

const computeLatticePoint = (s: RangeSampler, gx: number, gy: number): LatticePoint => {
  const { h, owner } = s.pointHeight(gx, gy);
  // Raised points jitter sideways (breaks up the lattice); ones at or under the ground never do.
  const spread = h > 0 ? 0.08 : 0;
  const x = gx / Q + (mountainHash01(gx, gy, 41) - 0.5) * spread;
  const z = gy / Q + (mountainHash01(gx, gy, 43) - 0.5) * spread;
  const ground = s.groundAt(x, z);
  if (h <= 0) return { x, z, y: ground + h, h, owner };
  const plateau = Math.min(1, Math.max(0, (ground - GRASS_Y) / PLATEAU_SPAN));
  return { x, z, y: ground + h * (1 - PLATEAU_DAMP * plateau), h, owner };
};

type Facet = readonly [LatticePoint, LatticePoint, LatticePoint];

/** One tile's facets (world coords) that rise above the ground. */
const tileFacets = (s: RangeSampler, wx: number, wy: number): Facet[] => {
  const grid: LatticePoint[][] = [];
  for (let j = 0; j <= Q; j += 1) {
    const row: LatticePoint[] = [];
    for (let i = 0; i <= Q; i += 1) row.push(latticePoint(s, wx * Q + i, wy * Q + j));
    grid.push(row);
  }
  const facets: Facet[] = [];
  const keep = (f: Facet): void => {
    if (f.some((p) => p.h > 0)) facets.push(f);
  };
  for (let j = 0; j < Q; j += 1) {
    for (let i = 0; i < Q; i += 1) {
      const a = grid[j]![i]!;
      const b = grid[j]![i + 1]!;
      const c = grid[j + 1]![i]!;
      const d = grid[j + 1]![i + 1]!;
      // Winding: counter-clockwise seen from above (normals up).
      if (a.h + d.h >= b.h + c.h) {
        keep([a, c, d]);
        keep([a, d, b]);
      } else {
        keep([a, c, b]);
        keep([b, c, d]);
      }
    }
  }
  return facets;
};

/**
 * Height of the range surface at a world point, or -Infinity where no range
 * rises above the ground -- the river cascade lies on this.
 */
export const mountainRangeSurfaceY = (x: number, z: number, deps: MountainRangeDeps): number => {
  let best = -Infinity;
  const sampler = createSampler(deps, null);
  // Raised lattice points jitter sideways, so a point near a tile border can
  // lie in a neighbouring tile's facets.
  const facets: Facet[] = [];
  for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) facets.push(...tileFacets(sampler, Math.floor(x) + dx, Math.floor(z) + dz));
  for (const [a, b, c] of facets) {
    const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (Math.abs(d) < 1e-12) continue;
    const wa = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
    const wb = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
    const wc = 1 - wa - wb;
    if (wa < -1e-9 || wb < -1e-9 || wc < -1e-9) continue;
    best = Math.max(best, wa * a.y + wb * b.y + wc * c.y);
  }
  return best;
};

// Most range tiles (and their surroundings) kept between passes.
const TILE_CACHE_LIMIT = 20_000;
const TINT_LIGHTNESS = 0.07;
const TINT_WARMTH = 0.025;

export type MountainRange = {
  readonly mesh: () => Mesh | null;
  /** Range (mountain) tiles added since the last clear. */
  readonly tileCount: () => number;
  readonly clear: () => void;
  /** A range tile: (x, z) its centre in scene coords, (wx, wy) its world tile. Its neighbours get the cones' feet. */
  readonly addTile: (x: number, z: number, wx: number, wy: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createMountainRange = (scene: Scene, deps: MountainRangeDeps): MountainRange => {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
  const cache = new Map<number, TileInfo>();
  let sampler = createSampler(deps, cache);
  // Tiles to draw this pass (range tiles and the land around them), keyed by world tile.
  const pending = new Map<number, { x: number; z: number; wx: number; wy: number }>();
  let tiles = 0;
  let mesh: Mesh | null = null;
  const color = new Color();

  const clear = (): void => {
    // Tile info depends on live terrain and neighbours: rebuilt per pass, bounded by the visible tiles.
    cache.clear();
    sampler = createSampler(deps, cache);
    pending.clear();
    tiles = 0;
  };

  const addTile = (x: number, z: number, wx: number, wy: number): void => {
    tiles += 1;
    // Wide summit cones can reach into the second ring of tiles round a range tile.
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        pending.set(tileKey(deps.wrapX(wx + dx), deps.wrapY(wy + dz)), { x: x + dx, z: z + dz, wx: wx + dx, wy: wy + dz });
      }
    }
  };

  // Finished facets per world tile (positions relative to the tile's world
  // origin, plus colours), reused across passes while the tile's inputs --
  // which tiles around it are mountains, and its corner heights -- are
  // unchanged: mountains rarely change, but the terrain is rebuilt on every
  // camera pan. Bounded: cleared whenever it outgrows TILE_CACHE_LIMIT.
  const tileCache = new Map<number, { readonly sig: string; readonly positions: Float32Array; readonly colors: Float32Array }>();
  const signature = (wx: number, wy: number): string => {
    let mask = 0;
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) mask = mask * 2 + (deps.isMountainAt(deps.wrapX(wx + dx), deps.wrapY(wy + dz)) ? 1 : 0);
    }
    const c = (x: number, z: number): number => Math.round((deps.cornerYAt?.(deps.wrapX(x), deps.wrapY(z)) ?? 0) * 1000);
    return `${mask}:${c(wx, wy)}:${c(wx + 1, wy)}:${c(wx, wy + 1)}:${c(wx + 1, wy + 1)}`;
  };

  const buildTile = (wx: number, wy: number): { positions: Float32Array; colors: Float32Array } => {
    const positions: number[] = [];
    const colors: number[] = [];
    tileFacets(sampler, wx, wy).forEach(([a, b, c], f) => {
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      const uz = b.z - a.z;
      const vx = c.x - a.x;
      const vy = c.y - a.y;
      const vz = c.z - a.z;
      const ny = uz * vx - ux * vz;
      const flat = Math.abs(ny) / (Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx) || 1);
      const owner = [a, b, c].reduce((best, p) => (p.h > best.h ? p : best)).owner;
      const mid = (a.h + b.h + c.h) / 3;
      mountainFacetColor(color, {
        flat,
        top: Math.max(a.h, b.h, c.h),
        heightFraction: mid / (MOUNTAIN_HEIGHT * owner.heightScale || 1),
        snowLine: owner.snowLine,
        shade: mountainHash01(wx * 64 + f, wy, 51)
      });
      const light = 1 + TINT_LIGHTNESS * owner.tint;
      const warm = TINT_WARMTH * owner.warmth;
      color.setRGB(color.r * (light + warm), color.g * light, color.b * (light - warm));
      for (const p of [a, b, c]) {
        positions.push(p.x - wx, p.y, p.z - wy);
        colors.push(color.r, color.g, color.b);
      }
    });
    return { positions: new Float32Array(positions), colors: new Float32Array(colors) };
  };

  const commit = (): void => {
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh = null;
    }
    if (tileCache.size > TILE_CACHE_LIMIT) tileCache.clear();
    const parts: { readonly x: number; readonly z: number; readonly positions: Float32Array; readonly colors: Float32Array }[] = [];
    let total = 0;
    for (const { x, z, wx, wy } of pending.values()) {
      const key = tileKey(deps.wrapX(wx), deps.wrapY(wy));
      const sig = signature(wx, wy);
      let entry = tileCache.get(key);
      if (!entry || entry.sig !== sig) {
        entry = { sig, ...buildTile(wx, wy) };
        tileCache.set(key, entry);
      }
      if (entry.positions.length === 0) continue;
      parts.push({ x, z, positions: entry.positions, colors: entry.colors });
      total += entry.positions.length;
    }
    if (total === 0) return;
    const positions = new Float32Array(total);
    const colors = new Float32Array(total);
    let at = 0;
    for (const part of parts) {
      // Tile-relative -> scene: the tile's world origin sits at (x - 0.5, z - 0.5).
      const ox = part.x - 0.5;
      const oz = part.z - 0.5;
      for (let i = 0; i < part.positions.length; i += 3) {
        positions[at + i] = part.positions[i]! + ox;
        positions[at + i + 1] = part.positions[i + 1]!;
        positions[at + i + 2] = part.positions[i + 2]! + oz;
      }
      colors.set(part.colors, at);
      at += part.positions.length;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    // No vertex normals: the material is flat-shaded (normals come from the
    // facet itself), and this mesh is rebuilt on every terrain pass.
    mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };

  const dispose = (): void => {
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh = null;
    }
    material.dispose();
    tileCache.clear();
  };

  return { mesh: () => mesh, tileCount: () => tiles, clear, addTile, commit, dispose };
};
