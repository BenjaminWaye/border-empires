import type { DomainPlayer } from "@border-empires/game-domain";
import { techEntryById } from "./tech-domain-bridge.js";

/**
 * Resource-reveal gating: FOOD (Farm/Fish) is always visible, but Iron,
 * Supply, and Crystal each stay hidden on the map until the player has
 * researched the tech that reveals them (tech-tree.json's `revealResource`
 * effect key). Checked per-viewing-player at tile-delta filter time, not
 * baked into the tile itself, since the same tile's resource type is
 * revealed/hidden independently for every player based on their own tech.
 */
// tile.resource (FARM/FISH/TITANIUM/GEMS/UMBRITE) is a raw terrain-resource
// type, not the strategic category tech-tree.json's revealResource values
// use (food/iron/crystal/supply) — mirrors client-map-display.ts's
// strategicResourceKeyForTile. UMBRITE feeds UMBRITE; GEMS feeds
// CRYSTAL. Without this mapping, comparing the raw tile type directly
// against revealResource only ever happened to match for TITANIUM (whose raw
// type and category name are spelled the same) — UMBRITE and CRYSTAL tiles
// stayed masked forever, tech or no tech.
const REVEAL_CATEGORY_BY_TILE_RESOURCE: Record<string, string> = {
  farm: "food",
  fish: "food",
  titanium: "titanium",
  gems: "crystal",
  umbrite: "umbrite"
};

export const hasRevealedResourceForPlayer = (
  player: Pick<DomainPlayer, "techIds">,
  resource: string
): boolean => {
  const category = REVEAL_CATEGORY_BY_TILE_RESOURCE[resource.toLowerCase()] ?? resource.toLowerCase();
  if (category === "food") return true;
  for (const techId of player.techIds) {
    if (techEntryById.get(techId)?.effects?.revealResource === category) return true;
  }
  return false;
};

/**
 * The `revealResource` category (e.g. "crystal") a tech grants, if any —
 * used by handleChooseTechCommand to know which already-visible tiles need
 * their stale (still-masked) resource delta re-sent once the tech lands. See
 * REVEAL_CATEGORY_BY_TILE_RESOURCE for the raw-tile-type -> category mapping
 * that inverts this on the tile side.
 */
export const revealResourceCategoryForTech = (techId: string): string | undefined => {
  const category = techEntryById.get(techId)?.effects?.revealResource;
  return typeof category === "string" ? category : undefined;
};

/** True if `resource` (a raw tile.resource type, e.g. "GEMS") belongs to `category` (a revealResource value, e.g. "crystal"). */
export const tileResourceMatchesRevealCategory = (resource: string, category: string): boolean =>
  (REVEAL_CATEGORY_BY_TILE_RESOURCE[resource.toLowerCase()] ?? resource.toLowerCase()) === category;

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
