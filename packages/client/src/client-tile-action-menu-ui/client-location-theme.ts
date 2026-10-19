import { WORLD_WIDTH, WORLD_HEIGHT, supportRingRadiusForTier } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

/**
 * A support tile is a plain owned tile within one of the player's own
 * (non-settlement) towns' support rings — there's no dedicated field for it.
 * Radius is tier-aware (supportRingRadiusForTier: 1 for most tiers, 2 for
 * GREAT_CITY/METROPOLIS) — a flat `dx <= 1 && dy <= 1` here used to silently
 * exclude a wide-ring town's distance-2 tiles, so this only ever played the
 * town location theme on the base 8, not the full ring.
 */
const isOwnedTownSupportTile = (state: ClientState, tile: Tile): boolean => {
  for (const candidate of state.tiles.values()) {
    if (!candidate.town || candidate.ownerId !== state.me || candidate.ownershipState !== "SETTLED") continue;
    if (candidate.town.populationTier === "SETTLEMENT") continue;
    const dx = Math.min(Math.abs(candidate.x - tile.x), WORLD_WIDTH - Math.abs(candidate.x - tile.x));
    const dy = Math.min(Math.abs(candidate.y - tile.y), WORLD_HEIGHT - Math.abs(candidate.y - tile.y));
    if (dx === 0 && dy === 0) continue;
    if (Math.max(dx, dy) <= supportRingRadiusForTier(candidate.town.populationTier)) return true;
  }
  return false;
};

export const locationThemeForTile = (state: ClientState, tile: Tile): "town" | "dock" | "wonder" | undefined => {
  if (tile.town) return "town";
  if (tile.dockId) return "dock";
  if (tile.naturalWonder) return "wonder";
  if (isOwnedTownSupportTile(state, tile)) return "town";
  return undefined;
};
