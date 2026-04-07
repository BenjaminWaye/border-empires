import type { Tile } from "./client-types.js";

export const shouldPreserveOptimisticExpand = (tile: Tile | undefined, me: string): boolean =>
  Boolean(tile && tile.ownerId === me && tile.optimisticPending === "expand");

export const shouldHideCaptureOverlayAfterTimer = (tile: Tile | undefined, me: string, awaitingResult: boolean): boolean =>
  awaitingResult && shouldPreserveOptimisticExpand(tile, me);

export const shouldHideQueuedFrontierBadge = (
  tile: Tile | undefined,
  me: string,
  awaitingResult: boolean,
  isCurrentActionTarget: boolean
): boolean => isCurrentActionTarget && shouldHideCaptureOverlayAfterTimer(tile, me, awaitingResult);
