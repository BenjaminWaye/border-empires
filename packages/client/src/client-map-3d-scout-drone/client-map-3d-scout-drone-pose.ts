import { scoutDroneStepIndexAt, type ScoutDroneFlight } from "@border-empires/shared";

// Where the scout drone is and what it is doing at a moment, from its flight plan
// (packages/shared/src/scout-drone/scout-drone.ts). Shared by the 3D overlay and the 2D glyph.
// Written into a caller-owned object so the per-frame path allocates nothing.
//
// On top of the server's tile-by-tile timeline it adds the presentation beats: the drone lifts
// out of the AFC's crown over SCOUT_LAUNCH_MS after launch, its rotors spin up first, and it
// settles back into the crown over SCOUT_LAND_MS before it lands.

export const SCOUT_LAUNCH_MS = 1_800;
export const SCOUT_LAND_MS = 1_800;
const ROTOR_SPIN_UP_MS = 500;
const ROTOR_SPIN_DOWN_MS = 450;

export type ScoutDronePose = {
  /** Tile-space position (fractional; may sit just past a wrap seam). */
  x: number;
  y: number;
  /** Unit direction of travel in tile space (0, 0 while hovering over the AFC). */
  dirX: number;
  dirY: number;
  /** Tiles per second along the current leg. */
  speed: number;
  /** 0 docked in the crown .. 1 at cruise altitude. */
  lift: number;
  /** 0 stopped .. 1 full speed. */
  rotor: number;
  returning: boolean;
  /** Index of the step the drone last passed. */
  stepIndex: number;
};

export const createScoutDronePose = (): ScoutDronePose => ({ x: 0, y: 0, dirX: 0, dirY: 0, speed: 0, lift: 0, rotor: 0, returning: false, stepIndex: 0 });

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep01 = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const wrapDelta = (from: number, to: number, size: number): number => {
  let delta = to - from;
  if (delta > size / 2) delta -= size;
  if (delta < -size / 2) delta += size;
  return delta;
};

/** Fills `out` for `nowMs` (the flight's clock). Returns false when there is nothing to draw. */
export const scoutDronePoseAt = (flight: ScoutDroneFlight | undefined, nowMs: number, width: number, height: number, out: ScoutDronePose): boolean => {
  if (!flight || flight.steps.length === 0 || nowMs >= flight.landsAt) return false;
  const first = flight.steps[0]!;
  const index = Math.max(0, scoutDroneStepIndexAt(flight, nowMs));
  const from = flight.steps[index]!;
  const to = flight.steps[Math.min(index + 1, flight.steps.length - 1)]!;
  const span = to.at - from.at;
  const t = span > 0 ? clamp01((nowMs - from.at) / span) : 0;
  const dx = wrapDelta(from.x, to.x, width);
  const dy = wrapDelta(from.y, to.y, height);
  const length = Math.hypot(dx, dy);
  const launch = smoothstep01((nowMs - flight.launchedAt) / SCOUT_LAUNCH_MS);
  // Leave the crown almost straight up, then slide onto the route as it climbs.
  const glide = launch * launch * launch;
  out.x = first.x + (wrapDelta(first.x, from.x, width) + dx * t) * glide;
  out.y = first.y + (wrapDelta(first.y, from.y, height) + dy * t) * glide;
  out.dirX = length > 0 ? dx / length : 0;
  out.dirY = length > 0 ? dy / length : 0;
  out.speed = span > 0 && length > 0 ? (1000 * length) / span : 0;
  out.lift = Math.min(launch, smoothstep01((flight.landsAt - nowMs) / SCOUT_LAND_MS));
  out.rotor = Math.min(clamp01((nowMs - flight.launchedAt) / ROTOR_SPIN_UP_MS), clamp01((flight.landsAt - nowMs) / ROTOR_SPIN_DOWN_MS));
  out.returning = index >= flight.turnIndex;
  out.stepIndex = index;
  return true;
};
