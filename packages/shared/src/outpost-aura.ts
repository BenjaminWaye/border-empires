import {
  DREAD_TOWER_ATTACK_MULT,
  LIGHT_OUTPOST_ATTACK_MULT,
  SIEGE_OUTPOST_ATTACK_MULT,
  SIEGE_TOWER_ATTACK_MULT,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "./config.js";

/** Radius for target-based aura scan (all four outpost-family variants). */
export const OUTPOST_AURA_RADIUS = 5;

/**
 * Minimal tile shape needed to evaluate outpost aura contribution. Both the
 * simulation runtime (parsed `DomainTileState`) and the realtime gateway
 * preview (JSON-decoded structure blobs) project their tiles into this shape
 * so the per-tile rule lives in one place.
 */
export type OutpostAuraTileFacts = {
  ownerId?: string | undefined;
  siegeOutpost?: { ownerId?: string | undefined; status?: string | undefined; variant?: string | undefined } | undefined;
  economicStructure?: { ownerId?: string | undefined; type?: string | undefined; status?: string | undefined } | undefined;
};

/**
 * Returns the multiplier this single tile contributes to a player's attack
 * aura, accounting for per-variant multipliers.
 */
export const tileOutpostMult = (
  tile: OutpostAuraTileFacts,
  playerId: string
): { mult: number } => {
  if (tile.ownerId !== playerId) return { mult: 1 };
  if (
    tile.siegeOutpost?.ownerId === playerId &&
    tile.siegeOutpost.status === "active"
  ) {
    const variant = tile.siegeOutpost.variant;
    if (variant === "SIEGE_TOWER") return { mult: SIEGE_TOWER_ATTACK_MULT };
    if (variant === "DREAD_TOWER") return { mult: DREAD_TOWER_ATTACK_MULT };
    // Default: SIEGE_OUTPOST (or undefined variant → treat as SIEGE_OUTPOST)
    return { mult: SIEGE_OUTPOST_ATTACK_MULT };
  }
  if (
    tile.economicStructure?.ownerId === playerId &&
    tile.economicStructure.type === "LIGHT_OUTPOST" &&
    tile.economicStructure.status === "active"
  ) {
    return { mult: LIGHT_OUTPOST_ATTACK_MULT };
  }
  return { mult: 1 };
};

/**
 * Scans a Chebyshev-distance-`OUTPOST_AURA_RADIUS` square around
 * `(targetX, targetY)` and returns the best attacker-side outpost multiplier
 * the player owns inside that area. The bonus applies based on whether the
 * **target tile** is within radius of a friendly outpost-family structure.
 * Wraps around world edges. Multiple overlapping auras: max multiplier wins.
 *
 * The caller provides `getTile` which returns whatever it has on hand
 * (parsed object, decoded JSON, etc.) projected into `OutpostAuraTileFacts`.
 */
export const scanOutpostMult = (
  playerId: string,
  targetX: number,
  targetY: number,
  getTile: (x: number, y: number) => OutpostAuraTileFacts | undefined
): number => {
  let bestMult = 1;
  for (let dy = -OUTPOST_AURA_RADIUS; dy <= OUTPOST_AURA_RADIUS; dy += 1) {
    for (let dx = -OUTPOST_AURA_RADIUS; dx <= OUTPOST_AURA_RADIUS; dx += 1) {
      const wrappedX = ((targetX + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
      const wrappedY = ((targetY + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
      const tile = getTile(wrappedX, wrappedY);
      if (!tile) continue;
      const contribution = tileOutpostMult(tile, playerId);
      if (contribution.mult > bestMult) bestMult = contribution.mult;
    }
  }
  return bestMult;
};
