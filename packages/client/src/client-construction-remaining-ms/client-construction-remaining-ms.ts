import type { Tile } from "../client-types.js";

// A structure paused by an attack on its tile (server: attack-development-hold.ts)
// keeps its frozen completesAt and carries pausedAt; remaining time is measured
// against pausedAt rather than the wall clock until the attack resolves.
export const constructionClockMs = (structure: { pausedAt?: number } | undefined): number => structure?.pausedAt ?? Date.now();

// The under_construction structure on this tile that an attack has paused, if any.
export const pausedConstructionOnTile = (tile: Tile): { pausedAt: number } | undefined => {
  for (const structure of [tile.fort, tile.observatory, tile.siegeOutpost, tile.economicStructure]) {
    if (structure?.status === "under_construction" && typeof structure.pausedAt === "number") return { pausedAt: structure.pausedAt };
  }
  return undefined;
};

// Pure "how much construction time is left on this tile" lookup — split out
// of client-action-flow.ts (file-line growth cap) since it doesn't close
// over any outer state and can be called directly.
export const constructionRemainingMsForTile = (tile: Tile): number | undefined => {
  const structure =
    tile.fort?.status === "under_construction" || tile.fort?.status === "removing"
      ? tile.fort
      : tile.observatory?.status === "under_construction" || tile.observatory?.status === "removing"
        ? tile.observatory
        : tile.siegeOutpost?.status === "under_construction" || tile.siegeOutpost?.status === "removing"
          ? tile.siegeOutpost
          : tile.economicStructure?.status === "under_construction" || tile.economicStructure?.status === "removing"
            ? tile.economicStructure
            : undefined;
  const completesAt = structure?.completesAt;
  if (typeof completesAt !== "number") return undefined;
  const remaining = Math.max(0, completesAt - constructionClockMs(structure));
  // Paused builds are not stalled: never report 0, which would trip the stalled-construction refresh.
  return structure?.pausedAt !== undefined ? Math.max(1, remaining) : remaining;
};
