import type { RallyAnchor } from "./rally-link-store.js";

export type RallyAnchorTile = {
  x: number;
  y: number;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  townType?: string | undefined;
};

export const rallyAnchorFromTiles = (ownerPlayerId: string, tiles: RallyAnchorTile[]): RallyAnchor | undefined => {
  const anchor = tiles
    .filter((tile) => tile.ownerId === ownerPlayerId && tile.ownershipState === "SETTLED")
    .sort((left, right) => {
      const leftTown = left.townType ? 0 : 1;
      const rightTown = right.townType ? 0 : 1;
      return (leftTown - rightTown) || (left.y - right.y) || (left.x - right.x);
    })[0];
  return anchor ? { x: anchor.x, y: anchor.y, island: `tile:${anchor.x},${anchor.y}` } : undefined;
};
