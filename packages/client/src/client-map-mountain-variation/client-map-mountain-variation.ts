// Per-tile look of a mountain, shared by the true-3D massif
// (client-map-3d-mountain-massif.ts) and the 2D canvas peaks
// (client-map-render/client-map-render-mountain-peaks.ts), so both renderers
// agree on which mountains are tall, twin-peaked or snow-capped
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
  /** Snow cap on the main peak: naturally tall peaks and cold-country peaks only. */
  readonly snow: boolean;
  /**
   * Where the 3D shader's snow starts, as a fraction of the peak's height
   * (lower in cold country); 0 when the peak is bare.
   */
  readonly snowLine: number;
  /** Which of the 3D mountain shapes this tile uses (client-map-3d-mountain-shape.ts). */
  readonly shape: number;
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
/** Main peaks at least this tall (own height, without the range bonus) carry snow even outside cold country. */
export const SNOW_HEIGHT_SCALE = 1.05;
const SECONDARY_PEAK_CHANCE = 0.45;
const SECONDARY_MIN_DISTANCE = 0.22;
const SECONDARY_DISTANCE_RANGE = 0.08;
const SECONDARY_MIN_SCALE = 0.5;
const SECONDARY_SCALE_RANGE = 0.2;
export const MOUNTAIN_SHAPE_COUNT = 4;
const COLD_SNOW_LINE = 0.4;
const TALL_SNOW_LINE = 0.62;

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

export type MountainNeighbourhoodLookup = {
  readonly isMountainAt: (wx: number, wy: number) => boolean;
  readonly isColdAt: (wx: number, wy: number) => boolean;
  readonly wrapX: (wx: number) => number;
  readonly wrapY: (wy: number) => number;
};

export const mountainNeighbourhoodAt = (wx: number, wy: number, lookup: MountainNeighbourhoodLookup): MountainNeighbourhood => {
  const { isMountainAt, isColdAt, wrapX, wrapY } = lookup;
  let cold = false;
  for (let dy = -1; dy <= 1 && !cold; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
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
    // Judged on the peak's own height, before the range spine bonus --
    // otherwise nearly every peak inside a range would be snow-capped.
    snow: neighbourhood.cold || ownHeight >= SNOW_HEIGHT_SCALE,
    snowLine: neighbourhood.cold ? COLD_SNOW_LINE : ownHeight >= SNOW_HEIGHT_SCALE ? TALL_SNOW_LINE : 0,
    shape: Math.floor(mountainHash01(wx, wy, 10) * MOUNTAIN_SHAPE_COUNT),
    secondary,
    saddleEast: neighbourhood.east,
    saddleSouth: neighbourhood.south
  };
};
