import type { Tile } from "./client-types.js";

const CAPTURE_RECOVERY_WINDOW_MS = 11 * 60_000;

export type TileMenuHeaderStatus = {
  text: string;
  tone: "warning" | "neutral";
};

const disabledUntilForTileStructure = (tile: Tile): number | undefined => tile.economicStructure?.disabledUntil ?? tile.fort?.disabledUntil;

export const captureRecoveryRemainingMsForTile = (tile: Tile, nowMs = Date.now()): number | undefined => {
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

export const tileMenuHeaderStatusForTile = (tile: Tile, nowMs = Date.now()): TileMenuHeaderStatus | undefined => {
  const remainingMs = captureRecoveryRemainingMsForTile(tile, nowMs);
  if (remainingMs === undefined) return undefined;
  return {
    text: `Recently captured ${formatHeaderCountdown(remainingMs)}`,
    tone: "warning"
  };
};
