import {
  LIGHT_OUTPOST_ATTACK_MULT,
  OUTPOST_ATTACK_REACH,
  SIEGE_OUTPOST_ATTACK_MULT,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "./config.js";

/**
 * Minimal tile shape needed to evaluate outpost aura contribution. Both the
 * simulation runtime (parsed `DomainTileState`) and the realtime gateway
 * preview (JSON-decoded structure blobs) project their tiles into this shape
 * so the per-tile rule lives in one place.
 */
export type OutpostAuraTileFacts = {
  ownerId?: string | undefined;
  siegeOutpost?: { ownerId?: string; status?: string } | undefined;
  economicStructure?: { ownerId?: string; type?: string; status?: string } | undefined;
};

/**
 * Returns the multiplier this single tile contributes to a player's attack
 * aura. `siege: true` signals the caller can short-circuit any further scan
 * because Siege is the strongest possible bonus.
 */
export const tileOutpostMult = (
  tile: OutpostAuraTileFacts,
  playerId: string
): { mult: number; siege: boolean } => {
  if (tile.ownerId !== playerId) return { mult: 1, siege: false };
  if (
    tile.siegeOutpost?.ownerId === playerId &&
    tile.siegeOutpost.status === "active"
  ) {
    return { mult: SIEGE_OUTPOST_ATTACK_MULT, siege: true };
  }
  if (
    tile.economicStructure?.ownerId === playerId &&
    tile.economicStructure.type === "LIGHT_OUTPOST" &&
    tile.economicStructure.status === "active"
  ) {
    return { mult: LIGHT_OUTPOST_ATTACK_MULT, siege: false };
  }
  return { mult: 1, siege: false };
};

/**
 * Scans a Chebyshev-distance-`OUTPOST_ATTACK_REACH` square around
 * `(originX, originY)` and returns the best attacker-side outpost multiplier
 * the player owns inside that area. Wraps around world edges. The caller
 * provides `getTile` which returns whatever it has on hand (parsed object,
 * decoded JSON, etc.) projected into `OutpostAuraTileFacts`.
 */
export const scanOutpostMult = (
  playerId: string,
  originX: number,
  originY: number,
  getTile: (x: number, y: number) => OutpostAuraTileFacts | undefined
): number => {
  let bestMult = 1;
  for (let dy = -OUTPOST_ATTACK_REACH; dy <= OUTPOST_ATTACK_REACH; dy += 1) {
    for (let dx = -OUTPOST_ATTACK_REACH; dx <= OUTPOST_ATTACK_REACH; dx += 1) {
      const wrappedX = ((originX + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
      const wrappedY = ((originY + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
      const tile = getTile(wrappedX, wrappedY);
      if (!tile) continue;
      const contribution = tileOutpostMult(tile, playerId);
      if (contribution.siege) return contribution.mult;
      if (contribution.mult > bestMult) bestMult = contribution.mult;
    }
  }
  return bestMult;
};
