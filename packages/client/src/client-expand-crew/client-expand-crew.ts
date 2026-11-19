import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { wanderHash01 } from "../client-ancillary-wander/client-ancillary-wander.js";
import { patrolPoseAt } from "../client-map-3d-planetary-defense-patrol.js";

// Expand crew: two ancillary soldiers (the same marines that march to and
// fight attacks) walk out of the tile an EXPAND launches from, then patrol
// the neutral target -- idly walking between waypoints the same way the
// Planetary Defense soldiers patrol their tiles
// (client-map-3d-planetary-defense-patrol.ts) -- and kneel to plant the
// claim as it completes. Shared by the 3D marine layer
// (client-map-3d-expand-crew/) and the 2D canvas soldier glyphs
// (client-expand-crew-2d/), so both renderers walk the same paths on the same
// clock. Three-free on purpose, like the patrol module it builds on.
//
// Every pose is a pure function of (claim, clock): no per-claim state.
//
// Coordinates are tile-local: (0, 0) is the target tile's top-left corner,
// (1, 1) its bottom-right. A soldier still on its origin tile sits outside
// [0, 1] (e.g. x = 1.5 for an origin to the east).

// Every EXPAND -- a player's own or a muster flag's -- sends the same pair,
// matching the Planetary Defense patrol's two soldiers per tile.
export const EXPAND_CREW_SIZE = 2;

export const EXPAND_CREW_WALK_MS = 1_600;
const WALK_MAX_SHARE = 0.3;
const WALK_STAGGER_MS = 220;
// Closing beat: the soldiers stop and kneel to plant the claim.
export const EXPAND_CREW_KNEEL_MS = 900;
const KNEEL_MAX_SHARE = 0.15;
const SPAWN_JITTER = 0.18;

export type ExpandCrewStep = { readonly dx: number; readonly dy: number };

export type ExpandCrewClaim = {
  readonly targetX: number;
  readonly targetY: number;
  readonly startAt: number;
  readonly resolvesAt: number;
  readonly crew: number;
  // Step from the target to the tile the crew walks out of, each -1, 0 or 1.
  // Undefined when no adjacent origin is known (e.g. a dock crossing): the
  // crew then simply patrols the target from the start.
  readonly fromStep?: ExpandCrewStep;
};

export type ExpandCrewStance = "walk" | "stand" | "kneel";

export type ExpandCrewPose = {
  readonly x: number;
  readonly y: number;
  // Facing about +Y, atan2(dx, dz) with tile-local y as scene z (the patrol's
  // convention).
  readonly yaw: number;
  readonly stance: ExpandCrewStance;
};

type Timeline = { readonly walkEndsAt: number; readonly kneelStartsAt: number };

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

// Deliberately independent of whether motion is on: that verdict is re-read
// every frame (the slow-device latch can trip mid-claim, reduced motion can
// be toggled), so a timeline keyed on it would make the plate jump. With
// motion off the crew simply stands where it would have arrived.
const timeline = (claim: ExpandCrewClaim): Timeline => {
  const total = Math.max(1, claim.resolvesAt - claim.startAt);
  const walkMs = claim.fromStep && claim.crew > 0 ? Math.min(EXPAND_CREW_WALK_MS, total * WALK_MAX_SHARE) : 0;
  const kneelMs = Math.max(1, Math.min(EXPAND_CREW_KNEEL_MS, total * KNEEL_MAX_SHARE));
  return { walkEndsAt: claim.startAt + walkMs, kneelStartsAt: claim.resolvesAt - kneelMs };
};

// Where soldier i patrols at `atMs`, in tile-local coordinates.
const patrolAt = (claim: ExpandCrewClaim, i: number, atMs: number): { x: number; y: number; yaw: number; walking: boolean } => {
  const patrol = patrolPoseAt(claim.targetX, claim.targetY, i, atMs);
  return { x: 0.5 + patrol.offsetX, y: 0.5 + patrol.offsetZ, yaw: patrol.yaw, walking: patrol.walking };
};

// Where soldier i first sets foot on its patrol: the end of its walk in.
export const expandCrewArrivalPoint = (claim: ExpandCrewClaim, i: number): { x: number; y: number } => {
  const arrival = patrolAt(claim, i, timeline(claim).walkEndsAt);
  return { x: arrival.x, y: arrival.y };
};

// Where the claim plate grows from: the middle of the crew's arrival points
// (inside the patrol disc, so the growing plate never leaves the tile), or
// the tile centre when there is no crew.
export const expandCrewAnchor = (claim: ExpandCrewClaim): { x: number; y: number } => {
  if (claim.crew <= 0) return { x: 0.5, y: 0.5 };
  let x = 0;
  let y = 0;
  for (let i = 0; i < claim.crew; i += 1) {
    const arrival = expandCrewArrivalPoint(claim, i);
    x += arrival.x;
    y += arrival.y;
  }
  return { x: x / claim.crew, y: y / claim.crew };
};

// Claim-plate fill progress (0..1). With a crew walking in the plate waits
// for them to arrive, then fills over the rest of the claim, with motion on
// or off (see timeline).
export const expandCrewPlateProgress = (claim: ExpandCrewClaim, nowMs: number): number => {
  const { walkEndsAt } = timeline(claim);
  return clamp01((nowMs - walkEndsAt) / Math.max(1, claim.resolvesAt - walkEndsAt));
};

export const expandCrewFigurePose = (claim: ExpandCrewClaim, i: number, nowMs: number, animate: boolean): ExpandCrewPose | undefined => {
  if (i >= claim.crew || nowMs >= claim.resolvesAt) return undefined;
  const { walkEndsAt, kneelStartsAt } = timeline(claim);
  if (!animate) {
    // Standing still: where it would have arrived, facing its first leg.
    const arrival = patrolAt(claim, i, walkEndsAt);
    return { x: arrival.x, y: arrival.y, yaw: arrival.yaw, stance: nowMs >= kneelStartsAt ? "kneel" : "stand" };
  }
  if (nowMs >= kneelStartsAt) {
    // Stop where the patrol had got to and kneel to plant the claim.
    const planted = patrolAt(claim, i, Math.max(walkEndsAt, kneelStartsAt));
    return { x: planted.x, y: planted.y, yaw: planted.yaw, stance: "kneel" };
  }
  if (claim.fromStep && nowMs < walkEndsAt) {
    const walkMs = walkEndsAt - claim.startAt;
    const delay = Math.min(i * WALK_STAGGER_MS, walkMs * 0.4);
    const arrival = patrolAt(claim, i, walkEndsAt);
    const fromX = 0.5 + claim.fromStep.dx + (wanderHash01(claim.targetX, claim.targetY, i, 173) - 0.5) * 2 * SPAWN_JITTER;
    const fromY = 0.5 + claim.fromStep.dy + (wanderHash01(claim.targetX, claim.targetY, i, 211) - 0.5) * 2 * SPAWN_JITTER;
    const raw = (nowMs - claim.startAt - delay) / Math.max(1, walkMs - delay);
    const u = smoothstep(clamp01(raw));
    const yaw = Math.atan2(arrival.x - fromX, arrival.y - fromY);
    return {
      x: fromX + (arrival.x - fromX) * u,
      y: fromY + (arrival.y - fromY) * u,
      yaw,
      // Waiting its turn on the origin tile until its staggered start.
      stance: raw > 0 ? "walk" : "stand"
    };
  }
  const patrol = patrolAt(claim, i, nowMs);
  return { x: patrol.x, y: patrol.y, yaw: patrol.yaw, stance: patrol.walking ? "walk" : "stand" };
};

const wrappedDelta = (from: number, to: number, dim: number): number => {
  let d = (to - from) % dim;
  if (d > dim / 2) d -= dim;
  if (d < -dim / 2) d += dim;
  return d;
};

const NEIGHBOUR_STEPS: readonly ExpandCrewStep[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: -1, dy: 1 }
];

// Which way the crew walks in from. A known launch tile wins when it touches
// the target; otherwise the first of this player's own neighbouring tiles
// (orthogonal before diagonal). A launch tile further away (a dock crossing)
// gives no step: the crew can't plausibly walk that far.
export const expandCrewFromStep = (
  target: { readonly x: number; readonly y: number },
  origin: { readonly x: number; readonly y: number } | undefined,
  isMineAt: (x: number, y: number) => boolean
): ExpandCrewStep | undefined => {
  if (origin) {
    const dx = wrappedDelta(target.x, origin.x, WORLD_WIDTH);
    const dy = wrappedDelta(target.y, origin.y, WORLD_HEIGHT);
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx !== 0 || dy !== 0)) return { dx, dy };
    return undefined;
  }
  for (const step of NEIGHBOUR_STEPS) {
    const x = (((target.x + step.dx) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
    const y = (((target.y + step.dy) % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
    if (isMineAt(x, y)) return step;
  }
  return undefined;
};
