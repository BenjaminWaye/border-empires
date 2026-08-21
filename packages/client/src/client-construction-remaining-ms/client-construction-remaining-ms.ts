import type { Tile } from "../client-types.js";

// Pure "how much construction time is left on this tile" lookup — split out
// of client-action-flow.ts (file-line growth cap) since it doesn't close
// over any outer state and can be called directly.
export const constructionRemainingMsForTile = (tile: Tile): number | undefined => {
  const completesAt =
    tile.fort?.status === "under_construction" || tile.fort?.status === "removing"
      ? tile.fort.completesAt
      : tile.observatory?.status === "under_construction" || tile.observatory?.status === "removing"
        ? tile.observatory.completesAt
        : tile.siegeOutpost?.status === "under_construction" || tile.siegeOutpost?.status === "removing"
          ? tile.siegeOutpost.completesAt
          : tile.economicStructure?.status === "under_construction" || tile.economicStructure?.status === "removing"
            ? tile.economicStructure.completesAt
            : undefined;
  return typeof completesAt === "number" ? Math.max(0, completesAt - Date.now()) : undefined;
};
