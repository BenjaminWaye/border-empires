import { resourceRevealCategory, resourceRevealedByTechs, type DomainPlayer } from "@border-empires/game-domain";
import { techEntryById } from "./tech-domain-bridge.js";

/**
 * Resource-reveal gating: FOOD (Farm/Fish) is always visible, but Iron,
 * Supply, and Crystal each stay hidden on the map until the player has
 * researched the tech that reveals them (tech-tree.json's `revealResource`
 * effect key). Checked per-viewing-player at tile-delta filter time, not
 * baked into the tile itself, since the same tile's resource type is
 * revealed/hidden independently for every player based on their own tech.
 */
// The raw-tile-type -> revealResource-category mapping and the reveal check
// itself live in game-domain (resourceRevealedByTechs) so the gateway's
// season-victory fallback applies the identical rule with its own catalog.
export const hasRevealedResourceForPlayer = (
  player: Pick<DomainPlayer, "techIds">,
  resource: string
): boolean => resourceRevealedByTechs(resource, player.techIds, revealResourceCategoryForTech);

/**
 * The `revealResource` category (e.g. "crystal") a tech grants, if any —
 * used by handleChooseTechCommand to know which already-visible tiles need
 * their stale (still-masked) resource delta re-sent once the tech lands. See
 * resourceRevealCategory (game-domain) for the raw-tile-type -> category
 * mapping that inverts this on the tile side.
 */
export const revealResourceCategoryForTech = (techId: string): string | undefined => {
  const category = techEntryById.get(techId)?.effects?.revealResource;
  return typeof category === "string" ? category : undefined;
};

/** True if `resource` (a raw tile.resource type, e.g. "GEMS") belongs to `category` (a revealResource value, e.g. "crystal"). */
export const tileResourceMatchesRevealCategory = (resource: string, category: string): boolean =>
  resourceRevealCategory(resource) === category;

// Single source of truth for "what resource value (if any) should this tile
// projection show this viewer" — every tile-wire-delta builder (streaming,
// login/full-export, fog-of-war first-exposure) must call this instead of
// re-deriving the same `resource && viewer && hasRevealedResourceForPlayer`
// check inline. Three separate builders each did that inline and each one
// individually forgot it at some point, which is what let unrevealed
// resources leak out on one path while another had already been fixed.
export const revealedResourceValueForPlayer = (
  resource: string | undefined,
  viewer: Pick<DomainPlayer, "techIds"> | undefined
): string | undefined => (resource && viewer && hasRevealedResourceForPlayer(viewer, resource) ? resource : undefined);
