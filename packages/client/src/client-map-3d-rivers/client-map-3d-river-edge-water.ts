// v9 river water helpers: which side(s) of a border river may draw water,
// and how a river's mouth runs out into the sea.
import { terrainAt, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { wrap } from "../client-map-3d-heightfield-terrain.js";
import { isInHeightfieldTileWindow, type HeightfieldTileWindow } from "../client-map-3d-heightfield/client-map-3d-heightfield-window.js";
import type { ChannelPathPoint, WaterSides } from "./client-map-3d-rivers-channel.js";

// How far either side of a centreline sample to look for "the tile on each
// side of the river" (the centreline hugs the tile border).
const RIVER_SIDE_PROBE = 0.3;

/**
 * Which halves of the water may draw at a centreline sample. A border river
 * is half on each of the two tiles it separates, and each half draws only
 * when its own tile is explored and inside the heightfield's window -- the
 * same rule the terrain follows. At the fog edge the explored tile keeps
 * its half of the water (filling its half of the carved bed) and the
 * unexplored half stays dark, instead of either water hanging into the
 * void or a dry riverbed with no water. `left` is the -normal side.
 */
export const riverSampleSides = (
  x: number,
  z: number,
  normalX: number,
  normalZ: number,
  camX: number,
  camY: number,
  tileWindow: HeightfieldTileWindow,
  isExploredAt: (wx: number, wy: number) => boolean
): WaterSides => {
  const sideOk = (side: number): boolean => {
    const dx = Math.floor(x + normalX * side);
    const dz = Math.floor(z + normalZ * side);
    return isInHeightfieldTileWindow(tileWindow, dx, dz) && isExploredAt(wrap(camX + dx, WORLD_WIDTH), wrap(camY + dz, WORLD_HEIGHT));
  };
  return { left: sideOk(-RIVER_SIDE_PROBE), right: sideOk(RIVER_SIDE_PROBE) };
};

// The mouth runs this far past the river's final corner into the sea,
// widening and fading out, so the river spills into the ocean instead of
// stopping in a hard square end at the coast.
const MOUTH_REACH = 0.8;
const MOUTH_STEPS = 6;
const MOUTH_FLARE = 1.4;

const defaultIsSeaAt = (wx: number, wy: number): boolean => {
  const t = terrainAt(wx, wy);
  return t === "SEA" || t === "COASTAL_SEA";
};

/** Unit direction from a corner toward the sea tile(s) touching it; null if none do. */
export const seaDirectionAtCorner = (
  cornerX: number,
  cornerZ: number,
  isSeaAt: (wx: number, wy: number) => boolean = defaultIsSeaAt
): { readonly x: number; readonly z: number } | null => {
  let x = 0;
  let z = 0;
  for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
    if (!isSeaAt(wrap(cornerX + dx, WORLD_WIDTH), wrap(cornerZ + dz, WORLD_HEIGHT))) continue;
    x += dx + 0.5; // toward that tile's centre
    z += dz + 0.5;
  }
  const len = Math.hypot(x, z);
  return len === 0 ? null : { x: x / len, z: z / len };
};

/**
 * Plume samples past a v9 river's final centreline sample `end` (scene
 * coords, already smoothed), heading along the river (`tangent`, unit) and
 * bending toward the sea (`seaDir`, unit) on a quadratic curve. `mouth`
 * ramps 0..1 along it (the water flares and fades); the first sample is
 * `end` itself so the plume meets the channel without a gap.
 */
export const riverMouthPlume = (
  end: ChannelPathPoint,
  tangent: { readonly x: number; readonly z: number },
  seaDir: { readonly x: number; readonly z: number }
): ChannelPathPoint[] => {
  const cx = end.x + tangent.x * MOUTH_REACH * 0.4;
  const cz = end.z + tangent.z * MOUTH_REACH * 0.4;
  const ex = end.x + seaDir.x * MOUTH_REACH;
  const ez = end.z + seaDir.z * MOUTH_REACH;
  const out: ChannelPathPoint[] = [];
  for (let s = 0; s <= MOUTH_STEPS; s += 1) {
    const t = s / MOUTH_STEPS;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    out.push({
      x: a * end.x + b * cx + c * ex,
      z: a * end.z + b * cz + c * ez,
      // Widens late, so it stays inside the channel until it clears the coast.
      halfWidth: end.halfWidth * (1 + MOUTH_FLARE * t * t),
      mouth: t
    });
  }
  return out;
};
