import { tileHash } from "./client-map-3d-forest.js";

// Hills render as a small cluster of 3 irregularly placed, low bumps per
// tile instead of one perfectly centered symmetric dome, so a hill tile
// reads as a handful of uneven mounds rather than a stamped bump. This
// module is the single source of truth for that shape:
// client-map-3d-hills.ts builds the actual dome mesh from it, and
// client-map-3d-ownership-overlay.ts / client-map-3d-settle-overlay.ts /
// client-map-3d-road-elevation.ts each drape their own geometry over a hill
// tile and must trace this exact surface to stay flush with what's visibly
// rendered.
export const HILL_DOME_RADIUS = 0.46;
export const HILL_CORE_RADIUS = 0.14;

type HillBump = {
  readonly ou: number;
  readonly ov: number;
  readonly radius: number;
  readonly weight: number;
};

export type HillBumpCluster = readonly HillBump[];

// 3 base bump-cluster layouts, each always 3 peaks (tile-local units, origin
// at tile center). Offsets/radii are chosen so every bump's extent
// (|offset| + radius) stays comfortably inside HILL_DOME_RADIUS even after
// the per-tile jitter below — never touches the tile's own edge at 0.5.
// Weights top out at 0.78 rather than 1.0, so a hill's tallest peak reads as
// a lower, gentler mound instead of the old dome's full
// HEIGHTFIELD_HILLS_ELEVATION_BONUS height.
const HILL_VARIANT_BUMPS: readonly HillBumpCluster[] = [
  [
    { ou: -0.10, ov: -0.06, radius: 0.20, weight: 0.78 },
    { ou: 0.13, ov: 0.09, radius: 0.17, weight: 0.64 },
    { ou: 0.01, ov: -0.19, radius: 0.13, weight: 0.48 }
  ],
  [
    { ou: 0.06, ov: 0.14, radius: 0.19, weight: 0.78 },
    { ou: -0.15, ov: 0.01, radius: 0.18, weight: 0.68 },
    { ou: -0.02, ov: -0.16, radius: 0.13, weight: 0.46 }
  ],
  [
    { ou: -0.07, ov: 0.10, radius: 0.16, weight: 0.66 },
    { ou: 0.11, ov: -0.10, radius: 0.21, weight: 0.78 },
    { ou: -0.17, ov: -0.13, radius: 0.12, weight: 0.43 }
  ]
];

// Smoothstep shoulder from a flat plateau at the bump's own core out to 0 at
// its own radius — same shape family the old single centered dome used, just
// scoped to one small bump instead of the whole tile.
const bumpFalloff = (d: number, radius: number): number => {
  const core = radius * 0.35;
  if (d <= core) return 1;
  const t = Math.min(1, Math.max(0, 1 - (d - core) / (radius - core)));
  return t * t * (3 - 2 * t);
};

// Small-scale value noise (bilinear-interpolated hashed grid) used only for
// the fine ground roughness between/around the 3 peaks below — a much finer
// cell than any noise elsewhere in the terrain stack, so it reads as texture
// rather than new landforms.
const hash01 = (x: number, y: number, seed: number): number => {
  const h = ((x * 374761393) ^ (y * 668265263) ^ (seed * 2246822519)) >>> 0;
  return h / 4294967295;
};
const smoothstep01 = (t: number): number => t * t * (3 - 2 * t);
const roughnessNoiseAt = (wx: number, wy: number, u: number, v: number): number => {
  const cell = 0.22;
  const x = (wx + u) / cell;
  const y = (wy + v) / cell;
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  const tx = smoothstep01(x - gx);
  const ty = smoothstep01(y - gy);
  const n00 = hash01(gx, gy, 61);
  const n10 = hash01(gx + 1, gy, 61);
  const n01 = hash01(gx, gy + 1, 61);
  const n11 = hash01(gx + 1, gy + 1, 61);
  const nx0 = n00 + (n10 - n00) * tx;
  const nx1 = n01 + (n11 - n01) * tx;
  return nx0 + (nx1 - nx0) * ty; // 0..1
};
// Ground roughness fades to exactly 0 by ROUGHNESS_EDGE (inside
// HILL_DOME_RADIUS, same margin the bumps themselves keep) so the tile's
// true edge ring stays perfectly flat and flush with the corner-averaged
// data neighbouring tiles blend against — only the interior gets texture.
const ROUGHNESS_EDGE = 0.40;
const ROUGHNESS_AMPLITUDE = 0.11;
const roughnessEnvelopeAt = (u: number, v: number): number => {
  const r = Math.hypot(u, v);
  if (r >= ROUGHNESS_EDGE) return 0;
  return smoothstep01(1 - r / ROUGHNESS_EDGE);
};

// Salts distinct from every salt client-map-3d-forest.ts already uses
// (species=11, layout=7, jitterX=31, jitterZ=37, scale=41) so hill variant
// selection never correlates with a co-located forest tile's own randomness.
const VARIANT_SALT = 97;

// Per-tile jitter on top of the chosen variant so hill tiles sharing a
// variant don't look stamped from the same mold — position wobble up to
// +-0.04 tile units per bump, weight wobble +-15%.
const jitteredBumpsAt = (wx: number, wy: number, variant: number): HillBumpCluster =>
  HILL_VARIANT_BUMPS[variant]!.map((b, i) => {
    const salt = 53 + i * 5;
    const jx = (tileHash(wx, wy, salt, 21) / 21 - 0.5) * 0.08;
    const jy = (tileHash(wx, wy, salt + 1, 21) / 21 - 0.5) * 0.08;
    const jw = 0.85 + (tileHash(wx, wy, salt + 2, 21) / 21) * 0.3;
    return { ou: b.ou + jx, ov: b.ov + jy, radius: b.radius, weight: b.weight * jw };
  });

// Picks this hill tile's bump cluster once (one of 3 variants, jittered).
// Callers that evaluate many points on the same tile (a dense mesh grid, a
// drape overlay's own subdivision) should call this once per tile and reuse
// the result via hillShapeHeight, rather than recomputing it per point.
export const hillBumpsAt = (wx: number, wy: number): HillBumpCluster => {
  const variant = tileHash(wx, wy, VARIANT_SALT, 3);
  return jitteredBumpsAt(wx, wy, variant);
};

// Extent (0.34 + 0.12 = 0.46) keeps the same margin every peak bump already
// uses — 0 well before the tile's true edge at 0.5 — so it can never touch
// or cross into a neighbour's own independent dome mesh, and stays exactly
// 0 (matching flat ground) on any edge that does NOT border another hill.
const CORRIDOR_RADIUS = 0.12;
const CORRIDOR_OFFSET = 0.34;
const CORRIDOR_WEIGHT = 0.32;

// Which of a hill tile's 4 cardinal neighbours are themselves a rendered
// hill dome — every caller that needs the tile's true bump cluster (the
// dome mesh itself, and any overlay draping over it) computes this the same
// way (mirroring whatever "is this a hill dome tile" check that caller
// already has) and passes it to hillCorridorBumpsFor below.
export type HillNeighborFlags = {
  readonly north: boolean;
  readonly south: boolean;
  readonly east: boolean;
  readonly west: boolean;
};

// Convenience for the common case: a caller with only a raw "is this world
// tile a hill" predicate (no extra exclusions) plus wrap helpers, rather
// than client-map-3d-hills.ts's own more careful isHillNeighbor.
export const hillNeighborFlagsAt = (
  wx: number,
  wy: number,
  isHill: (x: number, y: number) => boolean,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number
): HillNeighborFlags => ({
  north: isHill(wx, wrapY(wy - 1)),
  south: isHill(wx, wrapY(wy + 1)),
  east: isHill(wrapX(wx + 1), wy),
  west: isHill(wrapX(wx - 1), wy)
});

// A low corridor bump reaching toward each hill-neighbouring edge — merged
// (union-max) with the tile's own peak cluster in hillShapeHeight, so two
// adjacent hill tiles both raise ground toward their shared border and read
// as one connected range instead of separate stamped mounds. Lower weight
// than any peak (see HILL_VARIANT_BUMPS above) so the corridor itself stays
// a saddle, not a fourth peak.
export const hillCorridorBumpsFor = (neighbors: HillNeighborFlags): HillBumpCluster => {
  const bumps: HillBump[] = [];
  if (neighbors.north) bumps.push({ ou: 0, ov: -CORRIDOR_OFFSET, radius: CORRIDOR_RADIUS, weight: CORRIDOR_WEIGHT });
  if (neighbors.south) bumps.push({ ou: 0, ov: CORRIDOR_OFFSET, radius: CORRIDOR_RADIUS, weight: CORRIDOR_WEIGHT });
  if (neighbors.west) bumps.push({ ou: -CORRIDOR_OFFSET, ov: 0, radius: CORRIDOR_RADIUS, weight: CORRIDOR_WEIGHT });
  if (neighbors.east) bumps.push({ ou: CORRIDOR_OFFSET, ov: 0, radius: CORRIDOR_RADIUS, weight: CORRIDOR_WEIGHT });
  return bumps;
};

// The single merge every caller needs: this tile's own peak cluster plus its
// corridor bumps toward any hill-neighbouring edge. Previously duplicated
// verbatim in client-map-3d-hills.ts, client-map-3d-ownership-overlay.ts,
// client-map-3d-road-elevation.ts and client-map-3d-settle-overlay.ts -- a
// future change to how the two combine only has to happen here now.
export const hillBumpsWithCorridorAt = (wx: number, wy: number, neighbors: HillNeighborFlags): HillBumpCluster => [
  ...hillBumpsAt(wx, wy),
  ...hillCorridorBumpsFor(neighbors)
];

// A road doesn't climb every peak/roughness wrinkle it crosses — it's a
// graded, paved cut through the hill. hillRoadCutMask returns how strongly
// (0..1) a tile-local point sits on that cut: 1 directly on any of the
// road's own cardinal arms (each a line from tile center to that edge,
// matching the corridor bumps' own directions), fading to 0 by
// ROAD_CUT_FADE_WIDTH. Diagonal road segments (northeast, etc.) aren't
// covered -- only whichever of north/south/east/west this tile's road uses.
export type RoadCutDirections = {
  readonly north?: boolean;
  readonly south?: boolean;
  readonly east?: boolean;
  readonly west?: boolean;
};

const ROAD_CUT_FULL_WIDTH = 0.09;
// Must reach at least as far as the corridor bump's own extent
// (CORRIDOR_OFFSET + CORRIDOR_RADIUS = 0.46) -- a road exiting toward the
// same edge as a hill-neighbour corridor connection needs the cut to fade
// out past the corridor bump, or that mound pokes back up through the
// graded path right where it's supposed to keep flattening toward the edge.
const ROAD_CUT_FADE_WIDTH = 0.46;

// Perpendicular distance from (u, v) to the nearest point on whichever
// tile-center-to-edge arms are active, clamped to each arm's own extent.
const distanceToRoadArms = (u: number, v: number, dirs: RoadCutDirections): number => {
  let best = Infinity;
  const consider = (x1: number, y1: number, x2: number, y2: number): void => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((u - x1) * dx + (v - y1) * dy) / len2)) : 0;
    const d = Math.hypot(u - (x1 + t * dx), v - (y1 + t * dy));
    if (d < best) best = d;
  };
  if (dirs.north) consider(0, 0, 0, -0.5);
  if (dirs.south) consider(0, 0, 0, 0.5);
  if (dirs.east) consider(0, 0, 0.5, 0);
  if (dirs.west) consider(0, 0, -0.5, 0);
  return best;
};

export const hillRoadCutMask = (u: number, v: number, dirs: RoadCutDirections | undefined): number => {
  if (!dirs || !(dirs.north || dirs.south || dirs.east || dirs.west)) return 0;
  const d = distanceToRoadArms(u, v, dirs);
  if (d <= ROAD_CUT_FULL_WIDTH) return 1;
  if (d >= ROAD_CUT_FADE_WIDTH) return 0;
  const t = 1 - (d - ROAD_CUT_FULL_WIDTH) / (ROAD_CUT_FADE_WIDTH - ROAD_CUT_FULL_WIDTH);
  return t * t * (3 - 2 * t);
};

// Height (>= 0, though rarely above ~0.9) of a tile's bump cluster at
// tile-local (u, v), each in [-0.5, 0.5] with origin at tile center. Starts
// from a soft union (max, not sum, so overlapping bumps don't double-peak)
// of whichever of the 3 peaks reaches furthest at this point, then adds a
// small, fading-to-0-at-the-edge ground roughness so the terrain between and
// around the peaks reads as uneven natural ground instead of bare flat
// plateau — clamped at 0 so that roughness never dips below true ground
// level. wx/wy (this tile's world coords) seed both the peak cluster
// (already baked into `bumps`) and this roughness texture. `roadDirs`
// (default: no road) flattens the result toward 0 along hillRoadCutMask's
// own carved path, so a road crossing this hill reads as a graded cut
// through it rather than climbing every peak/wrinkle in its way.
export const hillShapeHeight = (
  u: number,
  v: number,
  bumps: HillBumpCluster,
  wx: number,
  wy: number,
  roadDirs?: RoadCutDirections
): number => {
  let h = 0;
  for (const b of bumps) {
    const d = Math.hypot(u - b.ou, v - b.ov);
    const bh = bumpFalloff(d, b.radius) * b.weight;
    if (bh > h) h = bh;
  }
  const roughness = (roughnessNoiseAt(wx, wy, u, v) - 0.5) * 2 * ROUGHNESS_AMPLITUDE * roughnessEnvelopeAt(u, v);
  const raw = Math.max(0, h + roughness);
  const cut = hillRoadCutMask(u, v, roadDirs);
  return cut > 0 ? raw * (1 - cut) : raw;
};
