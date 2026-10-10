import type { ResourceType } from "@border-empires/shared";

// tile.resource (FARM/FISH/TITANIUM/GEMS/UMBRITE) is a raw terrain-resource
// type, not the strategic category tech-tree.json's revealResource values
// use (food/titanium/crystal/umbrite). GEMS feeds CRYSTAL; FARM and FISH are
// FOOD, which is always visible.
const REVEAL_CATEGORY_BY_TILE_RESOURCE: Record<string, string> = {
  farm: "food",
  fish: "food",
  titanium: "titanium",
  gems: "crystal",
  umbrite: "umbrite"
};

/** The revealResource category a raw tile.resource type belongs to (e.g. "GEMS" -> "crystal"). */
export const resourceRevealCategory = (resource: string): string =>
  REVEAL_CATEGORY_BY_TILE_RESOURCE[resource.toLowerCase()] ?? resource.toLowerCase();

/**
 * True if `resource` is visible to a player holding `techIds`: FOOD always is,
 * every other category needs a tech whose revealResource effect names it.
 * `revealCategoryForTech` looks up that effect in whichever tech catalog the
 * caller has loaded (simulation and gateway each load their own).
 */
export const resourceRevealedByTechs = (
  resource: string,
  techIds: Iterable<string>,
  revealCategoryForTech: (techId: string) => string | undefined
): boolean => {
  const category = resourceRevealCategory(resource);
  if (category === "food") return true;
  for (const techId of techIds) {
    if (revealCategoryForTech(techId) === category) return true;
  }
  return false;
};

export type VictoryResourceTally = {
  totalResourceCounts: Record<ResourceType, number>;
  ownedResourceCountsByPlayerId: Map<string, Record<ResourceType, number>>;
};

export const emptyResourceCounts = (): Record<ResourceType, number> => ({ FARM: 0, TITANIUM: 0, GEMS: 0, FISH: 0, UMBRITE: 0 });

export const createVictoryResourceTally = (): VictoryResourceTally => ({
  totalResourceCounts: emptyResourceCounts(),
  ownedResourceCountsByPlayerId: new Map()
});

/**
 * Adds one tile to the RESOURCE_MONOPOLY tally. Every resource tile counts
 * toward the world total; it counts toward its owner only when the tile is
 * SETTLED (frontier claims are not control) and the owner has revealed that
 * resource (a masked resource can't be controlled knowingly). Pass
 * `ownerTechIds: undefined` for owners outside the competitive set.
 */
export const tallyVictoryResourceTile = (
  tally: VictoryResourceTally,
  tile: { resource?: string | undefined; ownerId?: string | undefined; ownershipState?: string | undefined },
  ownerTechIds: Iterable<string> | undefined,
  revealCategoryForTech: (techId: string) => string | undefined
): void => {
  if (!tile.resource) return;
  const resource = tile.resource as ResourceType;
  tally.totalResourceCounts[resource] = (tally.totalResourceCounts[resource] ?? 0) + 1;
  if (!tile.ownerId || tile.ownershipState !== "SETTLED" || !ownerTechIds) return;
  if (!resourceRevealedByTechs(resource, ownerTechIds, revealCategoryForTech)) return;
  const owned = tally.ownedResourceCountsByPlayerId.get(tile.ownerId) ?? emptyResourceCounts();
  owned[resource] = (owned[resource] ?? 0) + 1;
  tally.ownedResourceCountsByPlayerId.set(tile.ownerId, owned);
};
