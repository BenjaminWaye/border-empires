import { tileHash } from "./client-map-3d-forest.js";
import { afcHillCutMask, type AfcPadOffset } from "./client-map-3d-afc-hill-cut/client-map-3d-afc-hill-cut.js";

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

// A segment from the tile's own center toward a neighbouring hill tile's
// center (tile-local units): the plateau stays at full height along it, so
// adjacent hill tiles merge into one landform -- see plateauHeightAt.
type HillRidge = {
  readonly du: number;
  readonly dv: number;
};

export type HillBumpCluster = {
  readonly peaks: readonly HillBump[];
  readonly ridges: readonly HillRidge[];
};

// 3 base layouts, each 3 small triangular "points" (tile-local units,
// origin at tile center) — modest bumps (weight ~0.23-0.29, small radius),
// visible as 3 distinct points but still well short of the old pointy-peak
// look. The hill's actual bulk comes from plateauHeightAt below: an
// irregular, almost-flat raised surface the 3 points sit on top of. Every
// point's extent (|offset| + radius) stays comfortably inside
// HILL_DOME_RADIUS even after the per-tile jitter below (+-0.057 worst
// case combined x/y) — never touches
// the tile's own edge at 0.5 or a neighbour's independent dome.
const HILL_VARIANT_BUMPS: ReadonlyArray<readonly HillBump[]> = [
  [
    { ou: 0, ov: -0.18, radius: 0.13, weight: 0.28 },
    { ou: 0.16, ov: 0.10, radius: 0.12, weight: 0.25 },
    { ou: -0.15, ov: 0.11, radius: 0.12, weight: 0.23 }
  ],
  [
    { ou: 0.05, ov: -0.19, radius: 0.12, weight: 0.25 },
    { ou: 0.17, ov: 0.08, radius: 0.13, weight: 0.29 },
    { ou: -0.18, ov: 0.07, radius: 0.12, weight: 0.23 }
  ],
  [
    { ou: -0.06, ov: -0.17, radius: 0.13, weight: 0.29 },
    { ou: 0.14, ov: 0.12, radius: 0.12, weight: 0.23 },
    { ou: -0.16, ov: 0.09, radius: 0.13, weight: 0.26 }
  ]
];

// The hill's actual bulk: an irregular, almost-flat raised surface out to
// PLATEAU_FLAT_RADIUS from the hill's skeleton, then a short slope back
// down to true ground level (0) by PLATEAU_SLOPE_EDGE. The skeleton is the
// tile's own center plus one ridge toward each neighbouring hill tile, so a
// lone hill is still a round plateau, while a cluster of
// hill tiles reads as one massif. Measured from the center alone (the old
// shape), every tile sloped back to 0 at all four edges, and a hill cluster
// rendered as a grid of separate mounds with creases at every tile border.
// PLATEAU_SLOPE_EDGE (0.44) stays inside HILL_DOME_RADIUS (0.46), so toward
// a non-hill neighbour the plateau still reaches 0 before the tile edge.
// PLATEAU_FLAT_RADIUS was 0.32; the 0.12-wide slope that left was steep
// enough to draw a dark rim around every hill. 0.2 lets it ease out.
const PLATEAU_FLAT_RADIUS = 0.2;
const PLATEAU_SLOPE_EDGE = 0.44;
const PLATEAU_BASE_HEIGHT = 0.20;
// Deliberately smaller than PLATEAU_BASE_HEIGHT so the irregular variation
// never dips the plateau below true ground level on its own (that's the
// slope band's job, not this noise).
const PLATEAU_IRREGULARITY = 0.06;

const distanceToSegment = (u: number, v: number, du: number, dv: number): number => {
  const t = Math.max(0, Math.min(1, (u * du + v * dv) / (du * du + dv * dv)));
  return Math.hypot(u - t * du, v - t * dv);
};

// Distance from (u, v) to the hill's skeleton: its center point and ridges.
const skeletonDistanceAt = (u: number, v: number, ridges: readonly HillRidge[]): number => {
  let d = Math.hypot(u, v);
  for (const ridge of ridges) d = Math.min(d, distanceToSegment(u, v, ridge.du, ridge.dv));
  return d;
};

const plateauHeightAt = (wx: number, wy: number, u: number, v: number, r: number): number => {
  if (r >= PLATEAU_SLOPE_EDGE) return 0;
  const irregular = PLATEAU_BASE_HEIGHT + (roughnessNoiseAt(wx, wy, u, v, 61) - 0.5) * 2 * PLATEAU_IRREGULARITY;
  if (r <= PLATEAU_FLAT_RADIUS) return irregular;
  const t = 1 - (r - PLATEAU_FLAT_RADIUS) / (PLATEAU_SLOPE_EDGE - PLATEAU_FLAT_RADIUS);
  return irregular * smoothstep01(Math.max(0, Math.min(1, t)));
};

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
const roughnessNoiseAt = (wx: number, wy: number, u: number, v: number, seed = 61): number => {
  const cell = 0.22;
  const x = (wx + u) / cell;
  const y = (wy + v) / cell;
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  const tx = smoothstep01(x - gx);
  const ty = smoothstep01(y - gy);
  const n00 = hash01(gx, gy, seed);
  const n10 = hash01(gx + 1, gy, seed);
  const n01 = hash01(gx, gy + 1, seed);
  const n11 = hash01(gx + 1, gy + 1, seed);
  const nx0 = n00 + (n10 - n00) * tx;
  const nx1 = n01 + (n11 - n01) * tx;
  return nx0 + (nx1 - nx0) * ty; // 0..1
};
// Ground roughness fades to exactly 0 by ROUGHNESS_EDGE from the skeleton
// (inside HILL_DOME_RADIUS, same margin the bumps themselves keep) so any
// edge toward open ground stays perfectly flat and flush with the
// corner-averaged data neighbouring tiles blend against. Along a ridge it
// carries on across the shared edge: the noise is world-continuous.
const ROUGHNESS_EDGE = 0.40;
// Much smaller than before (0.11 -> 0.04): the plateau's own irregularity
// now carries most of the "uneven ground" read; this is only the fine
// side-texture on top, seeded distinctly (79, not the plateau's 61) so the
// two textures don't just add up to the same pattern scaled twice.
const ROUGHNESS_AMPLITUDE = 0.04;
const ROUGHNESS_SEED = 79;
const roughnessEnvelopeAt = (r: number): number => {
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
const jitteredBumpsAt = (wx: number, wy: number, variant: number): readonly HillBump[] =>
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
  return { peaks: jitteredBumpsAt(wx, wy, variant), ridges: [] };
};

// Which of a hill tile's 8 neighbours are themselves a rendered hill dome —
// every caller that needs the tile's true bump cluster (the dome mesh
// itself, and any overlay draping over it) computes this the same way
// (mirroring whatever "is this a hill dome tile" check that caller already
// has) and passes it to hillBumpsWithCorridorAt below.
export type HillNeighborFlags = {
  readonly north: boolean;
  readonly south: boolean;
  readonly east: boolean;
  readonly west: boolean;
  readonly northEast: boolean;
  readonly northWest: boolean;
  readonly southEast: boolean;
  readonly southWest: boolean;
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
  west: isHill(wrapX(wx - 1), wy),
  northEast: isHill(wrapX(wx + 1), wrapY(wy - 1)),
  northWest: isHill(wrapX(wx - 1), wrapY(wy - 1)),
  southEast: isHill(wrapX(wx + 1), wrapY(wy + 1)),
  southWest: isHill(wrapX(wx - 1), wrapY(wy + 1))
});

// Ridges toward every neighbouring hill. A ridge runs center to center, so
// tile A's ridge toward B and B's ridge toward A are the same world segment:
// both domes compute the same plateau along their shared edge and meet
// with no step. A diagonal ridge passes through the shared corner, which
// also belongs to the two cardinal neighbours either side -- so it only
// exists when the whole 2x2 block is hills; otherwise it would raise ground
// at a corner a flat tile is pinned to.
const hillRidgesFor = (n: HillNeighborFlags): HillRidge[] => {
  const ridges: HillRidge[] = [];
  if (n.north) ridges.push({ du: 0, dv: -1 });
  if (n.south) ridges.push({ du: 0, dv: 1 });
  if (n.east) ridges.push({ du: 1, dv: 0 });
  if (n.west) ridges.push({ du: -1, dv: 0 });
  if (n.northEast && n.north && n.east) ridges.push({ du: 1, dv: -1 });
  if (n.northWest && n.north && n.west) ridges.push({ du: -1, dv: -1 });
  if (n.southEast && n.south && n.east) ridges.push({ du: 1, dv: 1 });
  if (n.southWest && n.south && n.west) ridges.push({ du: -1, dv: 1 });
  return ridges;
};

// The single merge every caller needs: this tile's own peak cluster plus
// the ridges joining it to neighbouring hills. (The name predates ridges --
// it once added low "corridor" bumps at each shared edge midpoint instead,
// which left the rest of every shared edge and corner dipping to ground.)
export const hillBumpsWithCorridorAt = (wx: number, wy: number, neighbors: HillNeighborFlags): HillBumpCluster => ({
  peaks: hillBumpsAt(wx, wy).peaks,
  ridges: hillRidgesFor(neighbors)
});

// A road doesn't climb every peak/roughness wrinkle it crosses — it's a
// graded, paved cut through the hill. hillRoadCutMask returns how strongly
// (0..1) a tile-local point sits on that cut: 1 directly on any of the
// road's own cardinal arms (each a line from tile center to that edge,
// matching the cardinal ridges' own directions), fading to 0 by
// ROAD_CUT_FADE_WIDTH. Diagonal road segments (northeast, etc.) aren't
// covered -- only whichever of north/south/east/west this tile's road uses.
// `afcPads` adds an AFC's levelled pad (client-map-3d-afc-hill-cut.ts) when
// this hill tile lies within AFC_HILL_CUT_TILE_RADIUS of an AFC.
export type RoadCutDirections = {
  readonly north?: boolean;
  readonly south?: boolean;
  readonly east?: boolean;
  readonly west?: boolean;
  readonly afcPads?: readonly AfcPadOffset[];
};

const ROAD_CUT_FULL_WIDTH = 0.09;
// Must reach the tile's own true edge (0.5) -- a ridge toward a hill
// neighbour keeps the plateau at full height right up to the shared edge,
// so a road exiting toward that edge needs the cut to fade out at the very
// edge too, or the plateau pokes back up through the graded path right at
// the border.
const ROAD_CUT_FADE_WIDTH = 0.5;

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
  if (!dirs) return 0;
  const afcCut = afcHillCutMask(u, v, dirs.afcPads);
  if (afcCut >= 1 || !(dirs.north || dirs.south || dirs.east || dirs.west)) return afcCut;
  const d = distanceToRoadArms(u, v, dirs);
  if (d <= ROAD_CUT_FULL_WIDTH) return 1;
  if (d >= ROAD_CUT_FADE_WIDTH) return afcCut;
  const t = 1 - (d - ROAD_CUT_FULL_WIDTH) / (ROAD_CUT_FADE_WIDTH - ROAD_CUT_FULL_WIDTH);
  return Math.max(afcCut, t * t * (3 - 2 * t));
};

// Height (>= 0, rarely above ~0.4) of a hill tile at tile-local (u, v), each
// in [-0.5, 0.5] with origin at tile center. Three layers, in order of how
// much of the silhouette each one reads as:
//  1. plateauHeightAt: the hill's actual bulk — an irregular, almost-flat
//     raised surface along its skeleton, sloping to 0 toward open ground.
//  2. `bumps.peaks` (the 3 small triangular points):
//     added on top, not maxed against the plateau, so they read as subtle
//     rises breaking up the plateau's surface rather than replacing it.
//  3. A much finer, lower-amplitude roughness texture for "smooth but
//     slightly uneven" ground — distinct noise seed from the plateau's own
//     irregularity so the two don't just double the same pattern.
// Clamped at 0 so none of the three layers combine to dip below true
// ground level. `roadDirs` (default: no road) flattens the result toward 0
// along hillRoadCutMask's own carved path, so a road crossing this hill
// reads as a graded cut through it rather than climbing over its bulk.
export const hillShapeHeight = (
  u: number,
  v: number,
  bumps: HillBumpCluster,
  wx: number,
  wy: number,
  roadDirs?: RoadCutDirections
): number => {
  let pointsHeight = 0;
  for (const b of bumps.peaks) {
    const d = Math.hypot(u - b.ou, v - b.ov);
    const bh = bumpFalloff(d, b.radius) * b.weight;
    if (bh > pointsHeight) pointsHeight = bh;
  }
  const skeletonDistance = skeletonDistanceAt(u, v, bumps.ridges);
  const plateau = plateauHeightAt(wx, wy, u, v, skeletonDistance);
  const roughness =
    (roughnessNoiseAt(wx, wy, u, v, ROUGHNESS_SEED) - 0.5) * 2 * ROUGHNESS_AMPLITUDE * roughnessEnvelopeAt(skeletonDistance);
  const raw = Math.max(0, plateau + pointsHeight + roughness);
  const cut = hillRoadCutMask(u, v, roadDirs);
  return cut > 0 ? raw * (1 - cut) : raw;
};
