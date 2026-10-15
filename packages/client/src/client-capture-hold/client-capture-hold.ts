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
