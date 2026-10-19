import { isCaptureHoldActive } from "@border-empires/shared";
import { escapeHtml } from "../client-duke-panel/client-duke-escape.js";
import type { Tile } from "../client-types.js";

const CAPTURE_RECOVERY_WINDOW_MS = 11 * 60_000;
/**
 * Historical encirclement window. Encirclement itself is instant now (see
 * apps/simulation/src/encirclement/encirclement.ts), so this only bounds the
 * display of an ENCIRCLEMENT stamp left over from an older snapshot.
 */
const ENCIRCLEMENT_DECAY_MS = 60_000;

export type TileMenuHeaderStatus = {
  /** Rendered as HTML by the tile menu: escape anything player-controlled. */
  text: string;
  tone: "warning" | "neutral";
  /** Plain-text explainer; when present the status expands in place to show it. */
  helpText?: string;
};

const INSIDE_REACH_HELP_TEXT = "Can't garrison inside another empire's reach.";
const BEYOND_REACH_HELP_TEXT =
  "Can't garrison or build buildings on tiles outside your reach. Extend your reach using Relay Beacons.";

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

/** True iff this owned tile is an encircled (cut-off-from-supply) frontier
 *  tile, which the sim rejects as an ATTACK/EXPAND origin (ORIGIN_CUT_OFF). */
export const isFrontierOriginCutOff = (tile: Tile, nowMs = Date.now()): boolean =>
  encirclementRemainingMsForTile(tile, nowMs) !== undefined;

/**
 * "Inside <Name> Reach" when the covering empire(s) are known (one or two);
 * otherwise -- unknown owner (fogged anchors) or a crowd -- the generic
 * "Inside Enemy Reach".
 */
const insideReachText = (ownerNames: readonly string[]): string =>
  ownerNames.length === 0 || ownerNames.length > 2
    ? "Inside Enemy Reach"
    : `Inside ${ownerNames.map(escapeHtml).join(" and ")} Reach`;

export const tileMenuHeaderStatusForTile = (
  tile: Tile,
  nowMs = Date.now(),
  isOwnedTileInReach?: (tile: Tile) => boolean,
  // Lazy: only called when the "Inside ... Reach" line is actually shown, so
  // the (cached-tile scan) owner lookup costs nothing on every other status.
  reachOwnerNames?: () => readonly string[],
  viewerOwnsTile = true
): TileMenuHeaderStatus | undefined => {
  // Fogged takes precedence over everything below: those other statuses
  // (encirclement countdowns, capture recovery) are all
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

  // Capture hold (shared capture-hold.ts): the new owner's troops still
  // stand on this freshly captured FRONTIER tile, so it fights back instead
  // of being a free retake -- and the clock is how long that lasts.
  if (isCaptureHoldActive(tile, nowMs)) {
    return {
      text: `Holding captured ground ${formatHeaderCountdown(tile.captureHoldUntil! - nowMs)}`,
      tone: "neutral",
      helpText: viewerOwnsTile
        ? "Your troops are holding this tile after taking it, so it defends like ordinary ground until the timer ends. Garrison it to keep it defended."
        : "Its new owner's troops are holding this tile after taking it, so attacking it is a real fight until the timer ends."
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
  // disabled instead of leaving the player to guess. Two cases: ground some
  // other empire's reach covers ("Inside ... Reach"), and genuine
  // no-man's-land nobody's reach covers ("Beyond your reach"), which can't be
  // garrisoned and lives or dies by its supply line (see encirclement.ts).
  if (tile.ownershipState === "FRONTIER" && isOwnedTileInReach && !isOwnedTileInReach(tile)) {
    const ownerNames = reachOwnerNames?.() ?? [];
    if (ownerNames.length === 0 && !tile.reachOwnerId) return { text: "Beyond your reach", tone: "warning", helpText: BEYOND_REACH_HELP_TEXT };
    return { text: insideReachText(ownerNames), tone: "warning", helpText: INSIDE_REACH_HELP_TEXT };
  }

  return undefined;
};
