import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { wanderHash01, wanderPoint } from "../client-ancillary-wander/client-ancillary-wander.js";

// Expand crew: a few ancillaries walk out of the tile an EXPAND launches from,
// spread over the neutral target, stake it, and sink into the ground as the
// claim completes, so the finished frontier reads as "they became the claim"
// rather than "they vanished". Shared by the 3D crew layer
// (client-map-3d-expand-crew/) and the 2D canvas dots
// (client-expand-crew-2d/), so both renderers walk the same paths on the same
// clock. Three-free on purpose, like client-ancillary-wander.ts.
//
// Every pose is a pure function of (claim, clock): no per-claim state.
//
// Coordinates are tile-local: (0, 0) is the target tile's top-left corner,
// (1, 1) its bottom-right. A figure still on its origin tile sits outside
// [0, 1] (e.g. x = 1.5 for an origin to the east).

// A player's own EXPAND gets the full crew; a muster flag's auto-fired EXPAND
// a lighter one, because a flag on ADVANCE fires many in a row.
export const EXPAND_CREW_MANUAL = 4;
export const EXPAND_CREW_MUSTER = 2;

export const EXPAND_CREW_WALK_MS = 1_600;
const WALK_MAX_SHARE = 0.3;
const WALK_STAGGER_MS = 140;
export const EXPAND_CREW_SINK_MS = 700;
const SINK_MAX_SHARE = 0.15;
// Stake points stay off the tile's edges so the claim plate grown from their
// centroid never leaves the tile.
const STAKE_MIN = 0.28;
const STAKE_SPAN = 0.44;
const SPAWN_JITTER = 0.18;
const IDLE_SWAY = 0.07;
const IDLE_SWAY_RAMP_MS = 400;

export type ExpandCrewStep = { readonly dx: number; readonly dy: number };

export type ExpandCrewClaim = {
  readonly targetX: number;
  readonly targetY: number;
  readonly startAt: number;
  readonly resolvesAt: number;
  readonly crew: number;
  // Step from the target to the tile the crew walks out of, each -1, 0 or 1.
  // Undefined when no adjacent origin is known (e.g. a dock crossing): the
  // crew then simply stands on the target from the start.
  readonly fromStep?: ExpandCrewStep;
};

export type ExpandCrewPose = { readonly x: number; readonly y: number; readonly height: number };

type Timeline = { readonly walkEndsAt: number; readonly sinkStartsAt: number; readonly sinkMs: number };

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

const timeline = (claim: ExpandCrewClaim, animate: boolean): Timeline => {
  const total = Math.max(1, claim.resolvesAt - claim.startAt);
  const walkMs = animate && claim.fromStep && claim.crew > 0 ? Math.min(EXPAND_CREW_WALK_MS, total * WALK_MAX_SHARE) : 0;
  const sinkMs = Math.max(1, Math.min(EXPAND_CREW_SINK_MS, total * SINK_MAX_SHARE));
  return { walkEndsAt: claim.startAt + walkMs, sinkStartsAt: claim.resolvesAt - sinkMs, sinkMs };
};

export const expandCrewStakePoint = (claim: Pick<ExpandCrewClaim, "targetX" | "targetY">, i: number): { x: number; y: number } => ({
  x: STAKE_MIN + wanderHash01(claim.targetX, claim.targetY, i, 97) * STAKE_SPAN,
  y: STAKE_MIN + wanderHash01(claim.targetX, claim.targetY, i, 131) * STAKE_SPAN
});

// Where the claim plate grows from: the middle of the crew's stake points, or
// the tile centre when there is no crew.
export const expandCrewAnchor = (claim: ExpandCrewClaim): { x: number; y: number } => {
  if (claim.crew <= 0) return { x: 0.5, y: 0.5 };
  let x = 0;
  let y = 0;
  for (let i = 0; i < claim.crew; i += 1) {
    const stake = expandCrewStakePoint(claim, i);
    x += stake.x;
    y += stake.y;
  }
  return { x: x / claim.crew, y: y / claim.crew };
};

// Claim-plate fill progress (0..1). With a walking crew the plate waits for
// them to reach their stakes, then fills over the rest of the claim.
export const expandCrewPlateProgress = (claim: ExpandCrewClaim, nowMs: number, animate: boolean): number => {
  const { walkEndsAt } = timeline(claim, animate);
  return clamp01((nowMs - walkEndsAt) / Math.max(1, claim.resolvesAt - walkEndsAt));
};

export const expandCrewFigurePose = (claim: ExpandCrewClaim, i: number, nowMs: number, animate: boolean): ExpandCrewPose | undefined => {
  if (i >= claim.crew || nowMs >= claim.resolvesAt) return undefined;
  const { walkEndsAt, sinkStartsAt, sinkMs } = timeline(claim, animate);
  const stake = expandCrewStakePoint(claim, i);
  const height = 1 - clamp01((nowMs - sinkStartsAt) / sinkMs);
  if (animate && claim.fromStep && nowMs < walkEndsAt) {
    const walkMs = walkEndsAt - claim.startAt;
    const delay = Math.min(i * WALK_STAGGER_MS, walkMs * 0.4);
    const u = smoothstep(clamp01((nowMs - claim.startAt - delay) / Math.max(1, walkMs - delay)));
    const fromX = 0.5 + claim.fromStep.dx + (wanderHash01(claim.targetX, claim.targetY, i, 173) - 0.5) * 2 * SPAWN_JITTER;
    const fromY = 0.5 + claim.fromStep.dy + (wanderHash01(claim.targetX, claim.targetY, i, 211) - 0.5) * 2 * SPAWN_JITTER;
    return { x: fromX + (stake.x - fromX) * u, y: fromY + (stake.y - fromY) * u, height };
  }
  if (!animate) return { x: stake.x, y: stake.y, height };
  // Staked: a small shuffle around the stake, eased in so the end of the walk
  // doesn't jump.
  const amp = IDLE_SWAY * clamp01((nowMs - walkEndsAt) / IDLE_SWAY_RAMP_MS);
  const sway = wanderPoint(nowMs, claim.targetX, claim.targetY, i);
  return { x: stake.x + (sway.x - 0.5) * 2 * amp, y: stake.y + (sway.y - 0.5) * 2 * amp, height };
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
