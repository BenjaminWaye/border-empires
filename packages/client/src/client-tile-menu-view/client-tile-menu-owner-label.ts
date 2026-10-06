import type { Tile } from "../client-types.js";

/** Plain-text owner line for a tile menu header: sea, unclaimed, your own
 * frontier/settled land, or the foreign owner's name. Extracted from
 * tileMenuViewForTile (500-line budget). */
export const tileMenuOwnerLabel = (
  tile: Tile,
  me: string,
  hasActions: boolean,
  playerNameForOwner: (ownerId?: string | null) => string | undefined
): string => {
  if (tile.terrain === "SEA" || tile.terrain === "COASTAL_SEA") return hasActions ? "Crossing route" : "Open sea";
  if (!tile.ownerId) return "Unclaimed";
  if (tile.ownerId === me) return tile.ownershipState === "FRONTIER" ? "Your frontier" : "Your settled land";
  return playerNameForOwner(tile.ownerId) ?? tile.ownerId.slice(0, 8) ?? "Unknown empire";
};
