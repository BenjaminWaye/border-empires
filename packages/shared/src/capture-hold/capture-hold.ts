import { FRONTIER_ATTACK_MUSTER_COST, MUSTER_ATTACK_COST } from "../config.js";

// Capture hold: a tile taken by ATTACK lands as FRONTIER, and FRONTIER ground
// otherwise has zero defense (defenderBattle in frontier-combat.ts) -- so the
// previous owner could retake a freshly captured dock or town at a guaranteed
// 100% for the cheap frontier muster cost, and the capture would just
// ping-pong back and forth. For CAPTURE_HOLD_MS after the capture the new
// owner's troops "hold ground" on the tile: it defends with
// CAPTURE_HOLD_DEFENSE_MULT (the same 1.0x a plain unfortified tile starts
// from, no fort/town/garrison bonus), long enough to garrison (SETTLE, 60s)
// it. Ordinary FRONTIER land that was never captured keeps
// zero defense, so normal frontier raiding is unchanged.

export const CAPTURE_HOLD_MS = 60_000;
export const CAPTURE_HOLD_DEFENSE_MULT = 1;

/** Whether a tile is inside its post-capture hold window at `nowMs`. Only FRONTIER tiles use it -- SETTLED tiles already defend on their own. */
export const isCaptureHoldActive = (
  tile: { ownershipState?: string | undefined; captureHoldUntil?: number | undefined } | undefined,
  nowMs: number
): boolean =>
  tile?.ownershipState === "FRONTIER" && typeof tile.captureHoldUntil === "number" && tile.captureHoldUntil > nowMs;

/** FRONTIER ground with no hold window: an ATTACK on it is a guaranteed capture with no combat roll. */
export const isUndefendedFrontierTile = (
  tile: { ownershipState?: string | undefined; captureHoldUntil?: number | undefined } | undefined,
  nowMs: number
): boolean => tile?.ownershipState === "FRONTIER" && !isCaptureHoldActive(tile, nowMs);

/**
 * Targets where committing manpower above the attack floor scales the odds
 * (commitOddsMultiplier): SETTLED ground, plus a FRONTIER tile inside its
 * hold window -- the only FRONTIER ground that rolls combat at all. Plain
 * FRONTIER is a guaranteed capture, so extra commitment there buys nothing.
 */
export const isCommitOddsEligibleTarget = (
  tile: { ownershipState?: string | undefined; captureHoldUntil?: number | undefined } | undefined,
  nowMs: number
): boolean => tile?.ownershipState === "SETTLED" || isCaptureHoldActive(tile, nowMs);

/**
 * The commitment a muster flag's attack carries into `tile`, or undefined
 * when commitment can't change the odds there. A flag's commitManpower is
 * chosen against the generic MUSTER_ATTACK_COST floor for any non-SETTLED
 * target (commit tab, March To sheet), but a held tile's real floor is the
 * cheaper FRONTIER_ATTACK_MUSTER_COST -- so keep the chosen effort ratio
 * (Normal 1x, Double 2x) instead of sending the raw amount, which would
 * silently turn a default flag into 4x odds.
 */
export const flagCommitForTarget = (
  tile: { ownershipState?: string | undefined; captureHoldUntil?: number | undefined } | undefined,
  flagCommit: number | undefined,
  nowMs: number
): number | undefined => {
  if (!flagCommit || !isCommitOddsEligibleTarget(tile, nowMs)) return undefined;
  if (tile?.ownershipState === "SETTLED") return flagCommit;
  return Math.max(FRONTIER_ATTACK_MUSTER_COST, Math.round((flagCommit * FRONTIER_ATTACK_MUSTER_COST) / MUSTER_ATTACK_COST));
};

/**
 * The commitment an ADVANCE flag's auto-attack carries into `tile`, whose
 * own floor is `required`. An ADVANCE flag has no fixed target, so its
 * effort (Set Advance's Normal / Extra / Double sheet) is chosen against
 * the generic MUSTER_ATTACK_COST floor and kept as a ratio for every target
 * it picks -- otherwise "Double" (120) against a 150-manpower Palisade would
 * clamp back up to the floor and buy nothing. Capped at `flagCap` (but never
 * below `required`) so a high effort can't leave the flag saving up forever
 * for more manpower than it can ever hold.
 */
export const advanceFlagCommitForTarget = (
  tile: { ownershipState?: string | undefined; captureHoldUntil?: number | undefined } | undefined,
  flagCommit: number | undefined,
  required: number,
  flagCap: number,
  nowMs: number
): number | undefined => {
  if (tile?.ownershipState !== "SETTLED") return flagCommitForTarget(tile, flagCommit, nowMs);
  if (!flagCommit) return undefined;
  const scaled = Math.round((flagCommit * required) / MUSTER_ATTACK_COST);
  return Math.max(required, Math.min(scaled, flagCap));
};
