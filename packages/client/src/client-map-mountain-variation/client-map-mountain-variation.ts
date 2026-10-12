// Per-tile look of a mountain, shared by the true-3D massif
// (client-map-3d-mountain-massif.ts) and the 2D canvas peaks
// (client-map-render/client-map-render-mountain-peaks.ts), so both renderers
// agree on which mountains are tall, summits or snow-capped
// (docs/river-mountains-plan.md, PR A).
//
// Everything is derived from an integer hash of the *world* tile, never of
// scene/camera coordinates, so a mountain looks the same wherever the camera
// is and never changes shape while panning.

const TAU = Math.PI * 2;

/** Which orthogonal neighbours are mountains, and whether the tile sits in cold country. */
export type MountainNeighbourhood = {
  readonly north: boolean;
  readonly east: boolean;
  readonly south: boolean;
  readonly west: boolean;
  readonly cold: boolean;
};

/** A smaller second peak, offset from the tile centre (tile units, +x east, +z south). */
export type SecondaryPeak = {
  readonly dx: number;
  readonly dz: number;
  readonly scale: number;
};

export type MountainVariation = {
  /** Peak yaw in radians, [0, PI/2) -- the 4-sided peak repeats every quarter turn. */
  readonly yaw: number;
  /** Peak height multiplier; ranges (2+ mountain neighbours) get a spine bonus. */
  readonly heightScale: number;
  /** Base/peak footprint multiplier. */
  readonly footprintScale: number;
  /** Rock lightness shift in [-1, 1]. */
  readonly tint: number;
  /** Rock warm (+) / cool (-) shift in [-1, 1]. */
  readonly warmth: number;
  readonly secondary: SecondaryPeak | null;
  /** Low ridge saddle toward the east / south neighbour (each adjacent pair drawn once). */
  readonly saddleEast: boolean;
  readonly saddleSouth: boolean;
};

const MIN_HEIGHT_SCALE = 0.82;
const HEIGHT_SCALE_RANGE = 0.4;
const RANGE_SPINE_BONUS = 0.12;
const MAX_HEIGHT_SCALE = 1.4;
const MIN_FOOTPRINT_SCALE = 0.9;
const FOOTPRINT_SCALE_RANGE = 0.2;
const SECONDARY_PEAK_CHANCE = 0.45;
const SECONDARY_MIN_DISTANCE = 0.22;
const SECONDARY_DISTANCE_RANGE = 0.08;
const SECONDARY_MIN_SCALE = 0.5;
const SECONDARY_SCALE_RANGE = 0.2;
const SUMMIT_SALT = 21;
const SNOW_SALT = 47;
/** Share of summit tiles outside cold country whose peaks carry snow. */
export const SUMMIT_SNOW_SHARE = 0.65;

/**
 * Deterministic 0..1 value for a world tile and a salt (one salt per
 * property, so properties don't correlate). Integer-only mixing: identical
 * in every JS engine, unlike Math.sin-based noise.
 */
export const mountainHash01 = (wx: number, wy: number, salt: number): number => {
  let h = Math.imul(wx | 0, 0x27d4eb2d) ^ Math.imul(wy | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const COLD_RADIUS = 3;

export type MountainNeighbourhoodLookup = {
  readonly isMountainAt: (wx: number, wy: number) => boolean;
  readonly isColdAt: (wx: number, wy: number) => boolean;
  readonly wrapX: (wx: number) => number;
  readonly wrapY: (wy: number) => number;
};

export const mountainNeighbourhoodAt = (wx: number, wy: number, lookup: MountainNeighbourhoodLookup): MountainNeighbourhood => {
  const { isMountainAt, isColdAt, wrapX, wrapY } = lookup;
  // Cold if there is cold land within COLD_RADIUS: wide enough that tiles
  // deep inside a range (with only mountains around them) share their
  // range's climate instead of patching it with the other palette.
  let cold = false;
  for (let dy = -COLD_RADIUS; dy <= COLD_RADIUS && !cold; dy += 1) {
    for (let dx = -COLD_RADIUS; dx <= COLD_RADIUS; dx += 1) {
      if ((dx !== 0 || dy !== 0) && isColdAt(wrapX(wx + dx), wrapY(wy + dy))) {
        cold = true;
        break;
      }
    }
  }
  return {
    north: isMountainAt(wx, wrapY(wy - 1)),
    east: isMountainAt(wrapX(wx + 1), wy),
    south: isMountainAt(wx, wrapY(wy + 1)),
    west: isMountainAt(wrapX(wx - 1), wy),
    cold
  };
};

export const mountainVariationAt = (wx: number, wy: number, neighbourhood: MountainNeighbourhood): MountainVariation => {
  const neighbours = Number(neighbourhood.north) + Number(neighbourhood.east) + Number(neighbourhood.south) + Number(neighbourhood.west);
  const spine = neighbours >= 2 ? RANGE_SPINE_BONUS * Math.min(2, neighbours - 1) : 0;
  const ownHeight = MIN_HEIGHT_SCALE + HEIGHT_SCALE_RANGE * mountainHash01(wx, wy, 1);
  const heightScale = Math.min(MAX_HEIGHT_SCALE, ownHeight + spine);
  let secondary: SecondaryPeak | null = null;
  if (mountainHash01(wx, wy, 5) < SECONDARY_PEAK_CHANCE) {
    const angle = mountainHash01(wx, wy, 6) * TAU;
    const distance = SECONDARY_MIN_DISTANCE + SECONDARY_DISTANCE_RANGE * mountainHash01(wx, wy, 7);
    secondary = {
      dx: Math.cos(angle) * distance,
      dz: Math.sin(angle) * distance,
      scale: SECONDARY_MIN_SCALE + SECONDARY_SCALE_RANGE * mountainHash01(wx, wy, 8)
    };
  }
  return {
    yaw: mountainHash01(wx, wy, 2) * (Math.PI / 2),
    heightScale,
    footprintScale: MIN_FOOTPRINT_SCALE + FOOTPRINT_SCALE_RANGE * mountainHash01(wx, wy, 3),
    tint: mountainHash01(wx, wy, 4) * 2 - 1,
    warmth: mountainHash01(wx, wy, 9) * 2 - 1,
    secondary,
    saddleEast: neighbourhood.east,
    saddleSouth: neighbourhood.south
  };
};

/**
 * A tile that stands higher than all its orthogonal mountain neighbours (by
 * hash): the summit of its range. 3D gives it a tall summit model.
 */
export const isSummitTile = (wx: number, wy: number, lookup: MountainNeighbourhoodLookup): boolean => {
  const own = mountainHash01(wx, wy, SUMMIT_SALT);
  return [[0, -1], [1, 0], [0, 1], [-1, 0]].every(([dx, dy]) => {
    const nx = lookup.wrapX(wx + dx!);
    const ny = lookup.wrapY(wy + dy!);
    return !lookup.isMountainAt(nx, ny) || mountainHash01(nx, ny, SUMMIT_SALT) < own;
  });
};

/**
 * Whether a mountain tile is snow-capped, in both renderers: every mountain in
 * cold country, and most summit tiles elsewhere (a range with no white tops
 * at all looks odd); the rest of a range stays bare.
 */
export const mountainSnowAt = (wx: number, wy: number, lookup: MountainNeighbourhoodLookup, cold: boolean): boolean =>
  cold || (isSummitTile(wx, wy, lookup) && mountainHash01(wx, wy, SNOW_SALT) < SUMMIT_SNOW_SHARE);
