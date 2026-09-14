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

// Height in [0, 1] of a tile's bump cluster at tile-local (u, v), each in
// [-0.5, 0.5] with origin at tile center. A soft union (max, not sum, so
// overlapping bumps don't double-peak) of whichever bump reaches furthest at
// this point.
export const hillShapeHeight = (u: number, v: number, bumps: HillBumpCluster): number => {
  let h = 0;
  for (const b of bumps) {
    const d = Math.hypot(u - b.ou, v - b.ov);
    const bh = bumpFalloff(d, b.radius) * b.weight;
    if (bh > h) h = bh;
  }
  return h;
};
