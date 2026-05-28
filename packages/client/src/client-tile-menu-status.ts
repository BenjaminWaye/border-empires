import type { Tile } from "./client-types.js";

const CAPTURE_RECOVERY_WINDOW_MS = 11 * 60_000;
/** Must match ENCIRCLEMENT_DECAY_MS in apps/simulation/src/encirclement.ts */
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
 * Returns the remaining ms if this frontier tile is in the final 60 s of its
 * natural (~10 min) decay window. Matches the 3D map's blink threshold so the
 * on-tile flash and the header countdown light up together.
 */
export const naturalDecayRemainingMsForTile = (tile: Tile, nowMs = Date.now()): number | undefined => {
  if (tile.ownershipState !== "FRONTIER") return undefined;
  if (typeof tile.frontierDecayAt !== "number") return undefined;
  if (tile.frontierDecayKind !== "NATURAL") return undefined;
  const remaining = tile.frontierDecayAt - nowMs;
  if (remaining <= 0 || remaining > ENCIRCLEMENT_DECAY_MS) return undefined;
  return remaining;
};

/**
 * Returns true if this frontier tile has an active natural decay timer —
 * i.e. it is unsupported for the full decay window, not just the final 60 s.
 */
export const isFrontierNaturallyDecaying = (tile: Tile, nowMs = Date.now()): boolean => {
  if (tile.ownershipState !== "FRONTIER") return false;
  if (tile.frontierDecayKind !== "NATURAL") return false;
  if (typeof tile.frontierDecayAt !== "number") return false;
  return tile.frontierDecayAt > nowMs;
};

export const tileMenuHeaderStatusForTile = (tile: Tile, nowMs = Date.now()): TileMenuHeaderStatus | undefined => {
  // Encirclement takes precedence over capture-recovery for the header status.
  const encirclementRemaining = encirclementRemainingMsForTile(tile, nowMs);
  if (encirclementRemaining !== undefined) {
    const seconds = Math.max(1, Math.ceil(encirclementRemaining / 1000));
    return {
      text: `Cut off from supply — disappears in ${seconds}s`,
      tone: "warning"
    };
  }

  const naturalRemaining = naturalDecayRemainingMsForTile(tile, nowMs);
  if (naturalRemaining !== undefined) {
    const seconds = Math.max(1, Math.ceil(naturalRemaining / 1000));
    return {
      text: `Frontier collapsing in ${seconds}s`,
      tone: "warning"
    };
  }

  const remainingMs = captureRecoveryRemainingMsForTile(tile, nowMs);
  if (remainingMs === undefined) return undefined;
  return {
    text: `Recently captured ${formatHeaderCountdown(remainingMs)}`,
    tone: "warning"
  };
};
