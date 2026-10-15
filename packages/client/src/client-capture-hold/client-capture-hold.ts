import { isCaptureHoldActive } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

type HoldTile = Pick<Tile, "ownershipState" | "captureHoldUntil"> & { fogged?: boolean | undefined };

/**
 * Whether an ATTACK on this tile is against undefended FRONTIER ground -- a
 * guaranteed capture with no battle (claim-plate sweep, no skirmish FX) --
 * rather than a freshly captured FRONTIER tile still holding ground (shared
 * capture-hold.ts), which is a real fight.
 *
 * The server rolls the fight when the attack launches, so prefer that
 * attack's locked win chance when the client has it: a guaranteed capture is
 * locked at exactly 1, a held tile below 1. That way the FX can't flip from
 * a battle to a claim halfway through just because the hold window ran out
 * while the attack was still resolving. Without it, fall back to the hold's
 * live state.
 */
export const frontierAttackIsUndefended = (
  tile: HoldTile | undefined,
  lockedWinChance: number | undefined,
  nowEpochMs: number = Date.now()
): boolean => {
  if (tile?.ownershipState !== "FRONTIER") return false;
  if (typeof lockedWinChance === "number") return lockedWinChance >= 1;
  return !isCaptureHoldActive(tile, nowEpochMs);
};

/** A visible tile whose new owner's troops are still standing on it after a capture. */
export const isHoldingCapturedGround = (tile: HoldTile | undefined, nowEpochMs: number = Date.now()): boolean =>
  Boolean(tile && !tile.fogged && isCaptureHoldActive(tile, nowEpochMs));

// Tile key -> capture-hold deadline for every tile the client has been told
// holds ground, fed by the tile merge (applyCommonTileFields) so consumers
// like the 3D garrison never scan the whole tile cache to find the handful
// of held tiles. Bounded: expired entries are swept on every read and
// whenever it grows past HELD_INDEX_SWEEP_AT, so it never holds more than
// the tiles captured within the last hold window plus that slack.
const HELD_INDEX_SWEEP_AT = 256;
const holdDeadlineByKey = new Map<string, number>();

const sweepExpired = (nowEpochMs: number): void => {
  for (const [key, until] of holdDeadlineByKey) if (until <= nowEpochMs) holdDeadlineByKey.delete(key);
};

/** Records (or, with undefined, forgets) a tile's capture-hold deadline. */
export const noteCaptureHoldDeadline = (tileKey: string, until: number | undefined, nowEpochMs: number = Date.now()): void => {
  if (until === undefined || until <= nowEpochMs) holdDeadlineByKey.delete(tileKey);
  else holdDeadlineByKey.set(tileKey, until);
  if (holdDeadlineByKey.size > HELD_INDEX_SWEEP_AT) sweepExpired(nowEpochMs);
};

/** Keys of tiles whose last known capture hold is still running. */
export const liveCaptureHoldKeys = (nowEpochMs: number): string[] => {
  sweepExpired(nowEpochMs);
  return [...holdDeadlineByKey.keys()];
};

/** Test-only: forget every recorded hold. */
export const resetCaptureHoldIndex = (): void => holdDeadlineByKey.clear();
