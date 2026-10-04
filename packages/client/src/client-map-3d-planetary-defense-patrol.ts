// Pure, time-derived patrol math for the Planetary Defense soldiers that walk
// around on every barbarian-owned tile (client-map-3d-planetary-defense-
// overlay.ts). Kept free of three.js so it can be unit-tested directly and
// reused by the 2D canvas fallback (client-map-render-planetary-defense-
// overlay.ts), which has no per-frame state of its own to keep.
//
// A soldier's position is a pure function of (tile, soldier index, nowMs):
// it walks between pseudo-random waypoints inside its own tile, pausing at
// each one, on a cycle whose phase is offset per tile/soldier so a field of
// Planetary Defense tiles never steps in lockstep. Deriving everything from
// nowMs (rather than accumulating per-frame deltas) keeps it scrub/rejoin
// safe, the same reason the battle and muster-transit overlays do it.

// Soldiers patrolling each Planetary Defense tile (3D and 2D alike).
export const SOLDIERS_PER_TILE = 2;

// How far from the tile center (in tile units, tile = 1) a waypoint can sit.
// Kept well inside the tile so a patrolling soldier never reads as standing
// on a neighbor.
export const PATROL_RADIUS = 0.26;
// One patrol leg: walk to the next waypoint, then stand there for a beat.
export const PATROL_WALK_MS = 2600;
export const PATROL_PAUSE_MS = 1600;
const PATROL_CYCLE_MS = PATROL_WALK_MS + PATROL_PAUSE_MS;

export type PatrolPose = {
  // Offset from the tile center, in tile units.
  readonly offsetX: number;
  readonly offsetZ: number;
  // Facing (radians about +Y, atan2(dx, dz) convention) — the direction of
  // the current (or, while paused, the most recent) leg.
  readonly yaw: number;
  readonly walking: boolean;
};

const hash32 = (a: number, b: number, c: number): number => {
  let h = 2166136261 ^ Math.imul(a | 0, 374761393);
  h = Math.imul(h ^ (b | 0), 668265263);
  h = Math.imul(h ^ (c | 0), 2246822519);
  h ^= h >>> 15;
  h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  return h >>> 0;
};

const unit = (h: number): number => (h % 10007) / 10007;

const waypoint = (wx: number, wy: number, soldier: number, leg: number): { x: number; z: number } => {
  const h = hash32(wx * 31 + soldier, wy, leg);
  const angle = unit(h) * Math.PI * 2;
  // sqrt keeps waypoints spread across the disc rather than bunched at the center.
  const radius = PATROL_RADIUS * Math.sqrt(0.25 + 0.75 * unit(h >>> 7));
  return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius };
};

const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

export const patrolPoseAt = (wx: number, wy: number, soldier: number, nowMs: number): PatrolPose => {
  const phaseMs = hash32(wx, wy, soldier + 101) % PATROL_CYCLE_MS;
  const shifted = nowMs + phaseMs;
  const leg = Math.floor(shifted / PATROL_CYCLE_MS);
  const intoLeg = shifted - leg * PATROL_CYCLE_MS;
  const from = waypoint(wx, wy, soldier, leg);
  const to = waypoint(wx, wy, soldier, leg + 1);
  const yaw = Math.atan2(to.x - from.x, to.z - from.z);
  if (intoLeg >= PATROL_WALK_MS) return { offsetX: to.x, offsetZ: to.z, yaw, walking: false };
  const t = easeInOutSine(intoLeg / PATROL_WALK_MS);
  return { offsetX: from.x + (to.x - from.x) * t, offsetZ: from.z + (to.z - from.z) * t, yaw, walking: true };
};
