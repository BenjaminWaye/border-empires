import { scoutDroneStepIndexAt, type ScoutDroneFlight } from "@border-empires/shared";

// Where the scout drone is and what it is doing at a moment, from its flight plan
// (packages/shared/src/scout-drone/scout-drone.ts). Shared by the 3D overlay and the 2D glyph.
// Written into a caller-owned object so the per-frame path allocates nothing.
//
// On top of the server's tile-by-tile timeline it adds the presentation beats: on launch the
// props spool up on the crown first (still blades accelerating into a blur over SCOUT_SPOOL_MS),
// then the drone lifts out of the AFC's crown by SCOUT_LAUNCH_MS after launch; it settles back
// into the crown over SCOUT_LAND_MS before it lands, its props spinning down at the very end.

/** Launch to cruise, spool-up included. */
export const SCOUT_LAUNCH_MS = 2_400;
/** Props spooling up on the crown before the drone lifts. */
export const SCOUT_SPOOL_MS = 700;
export const SCOUT_LAND_MS = 1_800;
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
  /** Linear progress through the climb after spool-up: 0 on the crown .. 1 at cruise. */
  launchT: number;
  /** Linear progress through the descent: 0 before it begins .. 1 at touch-down. */
  landT: number;
  returning: boolean;
  /** Index of the step the drone last passed. */
  stepIndex: number;
};

export const createScoutDronePose = (): ScoutDronePose => ({ x: 0, y: 0, dirX: 0, dirY: 0, speed: 0, lift: 0, rotor: 0, launchT: 0, landT: 0, returning: false, stepIndex: 0 });

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
  const sinceLaunch = nowMs - flight.launchedAt;
  const launchT = clamp01((sinceLaunch - SCOUT_SPOOL_MS) / (SCOUT_LAUNCH_MS - SCOUT_SPOOL_MS));
  const launch = smoothstep01(launchT);
  // Leave the crown almost straight up, then slide onto the route as it climbs.
  const glide = launch * launch * launch;
  out.x = first.x + (wrapDelta(first.x, from.x, width) + dx * t) * glide;
  out.y = first.y + (wrapDelta(first.y, from.y, height) + dy * t) * glide;
  out.dirX = length > 0 ? dx / length : 0;
  out.dirY = length > 0 ? dy / length : 0;
  out.speed = span > 0 && length > 0 ? (1000 * length) / span : 0;
  out.lift = Math.min(launch, smoothstep01((flight.landsAt - nowMs) / SCOUT_LAND_MS));
  // Spool-up eases in (slow first turns, then accelerating), so the blades read before the blur.
  const spool = clamp01(sinceLaunch / SCOUT_SPOOL_MS);
  out.rotor = Math.min(spool * spool * (2 - spool), clamp01((flight.landsAt - nowMs) / ROTOR_SPIN_DOWN_MS));
  out.launchT = launchT;
  out.landT = clamp01(1 - (flight.landsAt - nowMs) / SCOUT_LAND_MS);
  out.returning = index >= flight.turnIndex;
  out.stepIndex = index;
  return true;
};
