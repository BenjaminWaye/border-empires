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
