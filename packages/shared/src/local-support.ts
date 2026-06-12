import { WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";
import { wrapX, wrapY } from "./math.js";
import { isSeaTerrain, type PlayerId, type Terrain } from "./types.js";

export type TileFacts = {
  x: number;
  y: number;
  ownerId?: PlayerId;
};

// Return-type props carry `| undefined` so a raw `Map<string, DomainTileState>.get`
// closure (whose tile fields are `string | undefined`) is assignable under
// exactOptionalPropertyTypes without a projecting wrapper.
export type NeighbourLookup = (
  x: number,
  y: number
) => { terrain?: string | undefined; ownerId?: string | undefined; ownershipState?: string | undefined } | undefined;

// Re-uses the same structural shape as AllyLookup in exposure.ts.
// Kept here to avoid importing from exposure.ts (would add an unlisted dep).
type LocalAllyLookup = (playerId: PlayerId, maybeAllyId: PlayerId) => boolean;

const cardinalOffsets = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
] as const;

const isBarrier = (terrain: Terrain): boolean =>
  isSeaTerrain(terrain) || terrain === "MOUNTAIN";

/**
 * Returns 0..4: the number of cardinal sides of `center` that are "backed" —
 * either a barrier terrain (sea/mountain) or a friendly-settled tile owned by
 * the same player (or an ally).  Used to compute the local-support defense
 * multiplier for the local-support Phase 1 model.
 */
export const friendlySettledSupport = (
  center: TileFacts,
  getTile: NeighbourLookup,
  isAlly: LocalAllyLookup
): number => {
  if (!center.ownerId) return 0;
  const ownerId = center.ownerId;
  let backed = 0;
  for (const [dx, dy] of cardinalOffsets) {
    const nx = wrapX(center.x + dx, WORLD_WIDTH);
    const ny = wrapY(center.y + dy, WORLD_HEIGHT);
    const neighbour = getTile(nx, ny);
    if (!neighbour) continue;
    if (neighbour.terrain != null && isBarrier(neighbour.terrain as Terrain)) {
      backed += 1;
      continue;
    }
    const nOwnerId = neighbour.ownerId;
    if (
      nOwnerId != null &&
      (nOwnerId === ownerId || isAlly(ownerId, nOwnerId)) &&
      neighbour.ownershipState === "SETTLED"
    ) {
      backed += 1;
    }
  }
  return backed;
};
