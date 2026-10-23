import type { Tile, TileVisibilityState } from "../client-types.js";
import { ownTownDetailRecoveryNeeded } from "../client-tile-menu-view/client-tile-menu-view.js";

// When a tile press or menu should ask the gateway for a tile's full detail
// (extracted from client-action-flow.ts, 500-line budget).
export type TileDetailRequestOptions = {
  force?: boolean;
};

export const shouldSendTileDetailRequest = (tile: Tile | undefined, me: string, options: TileDetailRequestOptions = {}): tile is Tile => {
  if (!tile || tile.fogged) return false;
  if (options.force) return true;
  return tile.detailLevel !== "full" || ownTownDetailRecoveryNeeded(tile, me);
};

export const shouldRefreshTileDetailOnPress = (tile: Tile | undefined, visibility: TileVisibilityState): tile is Tile =>
  Boolean(tile && visibility === "visible" && !tile.fogged);
