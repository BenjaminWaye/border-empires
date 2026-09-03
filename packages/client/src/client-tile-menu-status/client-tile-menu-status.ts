import { OUT_OF_REACH_DECAY_MS } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

const CAPTURE_RECOVERY_WINDOW_MS = 11 * 60_000;
/**
 * Historical encirclement window. Encirclement itself is instant now (see
 * apps/simulation/src/encirclement/encirclement.ts), so this only bounds the
 * display of an ENCIRCLEMENT stamp left over from an older snapshot.
 */
const ENCIRCLEMENT_DECAY_MS = 60_000;

export type TileMenuHeaderStatus = {
  text: string;
  tone: "warning" | "neutral";
};

const disabledUntilForTileStructure = (tile: Tile): number | undefined => tile.economicStructure?.disabledUntil ?? tile.fort?.disabledUntil;

export const captureRecoveryRemainingMsForTile = (tile: Tile, nowMs = Date.now()): number | undefined => {
  const townShockUntil = tile.town?.captureShockUntil;
  if (typeof townShockUntil === "number" && townShockUntil > nowMs) return Math.max(0, townShockUntil - nowMs);

  const disabledUntil = disabledUntilForTileStructure(tile);
  const lastCapturedAt = tile.history?.lastCapturedAt;
  if (typeof disabledUntil !== "number" || disabledUntil <= nowMs || typeof lastCapturedAt !== "number") return undefined;
  if (lastCapturedAt > disabledUntil) return undefined;
  if (disabledUntil - lastCapturedAt > CAPTURE_RECOVERY_WINDOW_MS) return undefined;
  return Math.max(0, disabledUntil - nowMs);
};

const formatHeaderCountdown = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

/**
 * Returns the remaining ms if this frontier tile is cut off from supply
 * (encirclement decay timer set and within the encirclement window).
 */
export const encirclementRemainingMsForTile = (tile: Tile, nowMs = Date.now()): number | undefined => {
  if (tile.ownershipState !== "FRONTIER") return undefined;
  if (typeof tile.frontierDecayAt !== "number") return undefined;
  if (tile.frontierDecayKind !== "ENCIRCLEMENT") return undefined;
  const remaining = tile.frontierDecayAt - nowMs;
  if (remaining <= 0 || remaining > ENCIRCLEMENT_DECAY_MS) return undefined;
  return remaining;
};

/**
 * Remaining ms for a frontier tile decaying because it was claimed outside its
 * owner's reach. Unlike encirclement this timer is live: the sim expires the
 * tile when it runs out unless reach catches up first.
 */
export const outOfReachDecayRemainingMsForTile = (tile: Tile, nowMs = Date.now()): number | undefined => {
  if (tile.ownershipState !== "FRONTIER") return undefined;
  if (typeof tile.frontierDecayAt !== "number") return undefined;
  if (tile.frontierDecayKind !== "OUT_OF_REACH") return undefined;
  const remaining = tile.frontierDecayAt - nowMs;
  if (remaining <= 0 || remaining > OUT_OF_REACH_DECAY_MS) return undefined;
  return remaining;
};

/** True iff this owned tile is an encircled (cut-off-from-supply) frontier
 *  tile, which the sim rejects as an ATTACK/EXPAND origin (ORIGIN_CUT_OFF). */
export const isFrontierOriginCutOff = (tile: Tile, nowMs = Date.now()): boolean =>
  encirclementRemainingMsForTile(tile, nowMs) !== undefined;

export const tileMenuHeaderStatusForTile = (
  tile: Tile,
  nowMs = Date.now(),
  isOwnedTileInReach?: (tile: Tile) => boolean
): TileMenuHeaderStatus | undefined => {
  // Fogged takes precedence over everything below: those other statuses
  // (encirclement/out-of-reach decay countdowns, capture recovery) are all
  // computed from timestamps in the tile's own data, which for a fogged
  // tile is frozen at whatever it was the last time it was actually
  // visible -- showing a live-looking "disappears in 3s" countdown built
  // from stale data would be actively misleading, not just imprecise.
  if (tile.fogged) {
    return { text: "Fogged — showing last known data", tone: "neutral" };
  }

  // Encirclement takes precedence over capture-recovery for the header status.
  const encirclementRemaining = encirclementRemainingMsForTile(tile, nowMs);
  if (encirclementRemaining !== undefined) {
    const seconds = Math.max(1, Math.ceil(encirclementRemaining / 1000));
    return {
      text: `Cut off from supply — disappears in ${seconds}s`,
      tone: "warning"
    };
  }

  // Out-of-reach decay outranks capture recovery for the same reason
  // encirclement does: the tile is about to be lost outright, which matters
  // more than a temporary structure debuff.
  const outOfReachRemaining = outOfReachDecayRemainingMsForTile(tile, nowMs);
  if (outOfReachRemaining !== undefined) {
    const seconds = Math.max(1, Math.ceil(outOfReachRemaining / 1000));
    return {
      text: `Beyond your reach — decays in ${seconds}s`,
      tone: "warning"
    };
  }

  const remainingMs = captureRecoveryRemainingMsForTile(tile, nowMs);
  if (remainingMs !== undefined) {
    return {
      text: `Recently captured ${formatHeaderCountdown(remainingMs)}`,
      tone: "warning"
    };
  }

  // Fixed-border reach: settling/building an outpost on this FRONTIER tile
  // is still blocked until reach catches up, even though EXPAND itself no
  // longer is -- flag it so the header explains why those actions are
  // disabled instead of leaving the player to guess.
  if (tile.ownershipState === "FRONTIER" && isOwnedTileInReach && !isOwnedTileInReach(tile)) {
    return {
      text: "Outside reach",
      tone: "warning"
    };
  }

  return undefined;
};
