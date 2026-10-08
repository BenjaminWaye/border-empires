// v9 river water helpers: which side(s) of a border river may draw water,
// and how a river's mouth runs out into the sea.
import { terrainAt, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { wrap } from "../client-map-3d-heightfield-terrain.js";
import { isInHeightfieldTileWindow, type HeightfieldTileWindow } from "../client-map-3d-heightfield/client-map-3d-heightfield-window.js";
import type { ChannelPathPoint, WaterBuffers, WaterSides } from "./client-map-3d-rivers-channel.js";
import { WATER_SURFACE_Y } from "../client-map-3d-water-surface.js";

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
 * `end` itself so the plume meets the channel without a gap. When carrying
 * on along the river would run over land (the sea only touches the final
 * corner diagonally), the plume heads straight out to sea instead.
 */
export const riverMouthPlume = (
  end: ChannelPathPoint,
  tangent: { readonly x: number; readonly z: number },
  seaDir: { readonly x: number; readonly z: number },
  isSeaAtScene: (sceneX: number, sceneZ: number) => boolean = () => true
): ChannelPathPoint[] => {
  const ahead = isSeaAtScene(end.x + tangent.x * 0.3, end.z + tangent.z * 0.3) ? tangent : seaDir;
  const cx = end.x + ahead.x * MOUTH_REACH * 0.4;
  const cz = end.z + ahead.z * MOUTH_REACH * 0.4;
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

// The channel cuts down to sea level over this much river before the mouth.
const MOUTH_DESCENT_LENGTH = 1.2;

/**
 * Marks the last MOUTH_DESCENT_LENGTH of a smoothed centreline with a
 * `descent` ramp (0 -> 1 at the final sample), so the channel and its water
 * step down to sea level at the coast instead of ending on the cliff top.
 */
export const withMouthDescent = (line: readonly ChannelPathPoint[]): ChannelPathPoint[] => {
  const out = [...line];
  let arc = 0;
  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (i < out.length - 1) arc += Math.hypot(out[i + 1]!.x - out[i]!.x, out[i + 1]!.z - out[i]!.z);
    if (arc >= MOUTH_DESCENT_LENGTH) break;
    const t = 1 - arc / MOUTH_DESCENT_LENGTH;
    out[i] = { ...out[i]!, descent: t * t * (3 - 2 * t) };
  }
  return out;
};

// A small cove at each mouth: within COVE_RADIUS of the river's final corner
// the riverside land slopes down to just under the sea surface, and an
// estuary pool of river water covers it. The coast is otherwise a square
// step (land above the sea, square sea-tile edges and walls), which showed
// right where the river met the sea; the pool's rim is hidden wherever the
// land rises above it, so the shoreline around the mouth comes out curved.
export const COVE_RADIUS = 0.55;
const COVE_FLOOR_BELOW_SEA = 0.03;
// The cove only cuts land this close to the sea (tiles): a full circle cut
// into the neighbouring tiles' interiors left their buildings standing in
// the estuary water.
export const COVE_COAST_BAND = 0.3;

const smooth01 = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/**
 * Ground height at `baseY`, `distance` from a mouth corner and `seaDistance`
 * from the nearest sea tile, once the cove is cut (never raises it).
 */
export const riverCoveY = (baseY: number, distance: number, seaDistance = 0): number => {
  if (distance >= COVE_RADIUS || seaDistance >= COVE_COAST_BAND) return baseY;
  const s = smooth01(1 - distance / COVE_RADIUS) * smooth01(1 - seaDistance / COVE_COAST_BAND);
  return Math.min(baseY, baseY + (WATER_SURFACE_Y - COVE_FLOOR_BELOW_SEA - baseY) * s);
};

const ESTUARY_SEGMENTS = 20;
// [radius / COVE_RADIUS, alpha, blend toward the sea colour]. A faint,
// graded wash -- an opaque disc hid the river's own structure where it met
// the coast and ended the shore foam in a hard edge.
const ESTUARY_RINGS: ReadonlyArray<readonly [number, number, number]> = [
  [0.5, 0.45, 0.25],
  [0.95, 0.3, 0.55],
  [1.35, 0.14, 0.8],
  [1.75, 0, 1]
];
const ESTUARY_CENTRE_ALPHA = 0.5;

/** How much of the estuary pool shows `seaDistance` from the nearest sea tile: all of it near the coast, none inland. */
export const estuaryCoastFade = (seaDistance: number): number => smooth01(1 - seaDistance / COVE_COAST_BAND);

/**
 * Appends a round estuary pool of river water centred on a mouth corner
 * (scene coords), at `y`. `seaDistanceAt` fades it out over land away from
 * the coast: coastal ground near a mouth can already sit at sea level, and
 * an unfaded pool flooded the neighbouring tiles and their buildings.
 */
export const appendEstuary = (
  buffers: WaterBuffers,
  centerX: number,
  centerZ: number,
  y: number,
  color: readonly [number, number, number, ...number[]],
  seaDistanceAt: (x: number, z: number) => number = () => 0,
  seaColor: readonly [number, number, number, ...number[]] = color
): void => {
  const mix = (k: number, t: number): number => color[k]! + (seaColor[k]! - color[k]!) * t;
  const center = buffers.positions.length / 3;
  buffers.positions.push(centerX, y, centerZ);
  buffers.colors.push(color[0], color[1], color[2], ESTUARY_CENTRE_ALPHA * estuaryCoastFade(seaDistanceAt(centerX, centerZ)));
  for (const [r, alpha, toSea] of ESTUARY_RINGS) {
    for (let k = 0; k < ESTUARY_SEGMENTS; k += 1) {
      const a = (k / ESTUARY_SEGMENTS) * Math.PI * 2;
      const x = centerX + Math.cos(a) * r * COVE_RADIUS;
      const z = centerZ + Math.sin(a) * r * COVE_RADIUS;
      buffers.positions.push(x, y, z);
      buffers.colors.push(mix(0, toSea), mix(1, toSea), mix(2, toSea), alpha * estuaryCoastFade(seaDistanceAt(x, z)));
    }
  }
  const ring = (i: number, k: number): number => center + 1 + i * ESTUARY_SEGMENTS + (k % ESTUARY_SEGMENTS);
  for (let k = 0; k < ESTUARY_SEGMENTS; k += 1) buffers.indices.push(center, ring(0, k + 1), ring(0, k));
  for (let i = 0; i + 1 < ESTUARY_RINGS.length; i += 1) {
    for (let k = 0; k < ESTUARY_SEGMENTS; k += 1) {
      buffers.indices.push(ring(i, k), ring(i, k + 1), ring(i + 1, k), ring(i, k + 1), ring(i + 1, k + 1), ring(i + 1, k));
    }
  }
};
