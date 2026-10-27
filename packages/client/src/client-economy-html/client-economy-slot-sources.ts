import {
  BASE_SLOTS_BY_TILE_RESOURCE,
  TILE_SLOT_BOOST_STRUCTURES,
  HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS,
  ORE_REFINERY_MINE_SLOT_BONUS,
  isSlotSourceConverter,
  converterModeOf,
  structureSlotRequirements,
  wrappedChebyshevDistance,
  type ChosenTrickleResource,
  type SlotResource
} from "@border-empires/shared";
import { ORE_REFINERY_RADIUS, HYDROWORKS_RADIUS } from "../client-structure-effects/client-structure-effects.js";
import type { EconomyBucket } from "../client-economy-model.js";
import type { Tile } from "../client-types.js";
import type { DomainInfo } from "../client-tech-info-types.js";
import type { EconomyPanelArgs } from "./client-economy-html.js";

// Mirrors resourceSlotSupplyForPlayer (apps/simulation/src/resource-slot-view/
// resource-slot-view.ts): base slots per owned settled resource tile, +1 for
// a same-tile boost structure (Hydrogarden/Mine/Umbrite Rig), +2 for a Hydrogarden
// within Hydroworks radius or a Mine within Ore Refinery radius, plus +1 per active
// SYNTHESIZE-mode converter of this resource. This is a client-side re-derivation
// (same tradeoff as slotOccupantsForResource in client-economy-html.ts). The
// installed AFC upgrade's chosen-resource grant is named when the caller passes
// it (args.domainSlotGrant); any other gap between this breakdown's total and
// the authoritative args.resourceSlots.supply (waystations, siphons, Foundry
// Heart, tiles not loaded on this client) is folded into a trailing "Other
// bonuses" row so the two never visibly disagree.
const isWithinRadiusOfActiveStructure = (
  tiles: Iterable<Tile>,
  ownerId: string,
  target: Tile,
  structureType: NonNullable<Tile["economicStructure"]>["type"],
  radius: number
): boolean => {
  for (const candidate of tiles) {
    const structure = candidate.economicStructure;
    if (!structure || structure.ownerId !== ownerId || structure.type !== structureType || structure.status !== "active") continue;
    if (wrappedChebyshevDistance(candidate.x, candidate.y, target.x, target.y) <= radius) return true;
  }
  return false;
};

export const slotSourcesForResource = (args: EconomyPanelArgs, resource: SlotResource): EconomyBucket[] => {
  const buckets = new Map<string, EconomyBucket>();
  const add = (label: string, count: number): void => {
    if (count <= 0) return;
    const current = buckets.get(label);
    if (current) {
      current.amountPerMinute += count;
      current.count += 1;
      return;
    }
    buckets.set(label, { label, amountPerMinute: count, count: 1 });
  };
  const tiles = [...args.tiles];
  let total = 0;
  for (const tile of tiles) {
    if (tile.ownerId !== args.me || tile.terrain !== "LAND" || tile.ownershipState !== "SETTLED") continue;
    if (tile.fogged) continue;
    const structure = tile.economicStructure;
    const isActiveStructure = structure?.status === "active" && structure?.inactiveReason !== "manual";
    const structureType = isActiveStructure ? structure!.type : undefined;
    if (structureType && isSlotSourceConverter(structureType, converterModeOf(structure))) {
      for (const req of structureSlotRequirements(structureType)) {
        if (req.resource !== resource) continue;
        add(args.economicStructureName(structureType), req.count);
        total += req.count;
      }
    }
    if (!tile.resource) continue;
    const base = BASE_SLOTS_BY_TILE_RESOURCE[tile.resource as keyof typeof BASE_SLOTS_BY_TILE_RESOURCE];
    if (!base || base.slotResource !== resource) continue;
    let slots = base.baseSlots;
    const label = `${args.prettyToken(args.resourceLabel(tile.resource))} sites`;
    const boostBlockedOnFish = structureType === "HYDROGARDEN" && tile.resource !== "FARM";
    const boost = structureType && !boostBlockedOnFish ? TILE_SLOT_BOOST_STRUCTURES[structureType] : undefined;
    if (boost) slots += boost;
    if (structureType === "HYDROGARDEN" && tile.resource === "FARM" && isWithinRadiusOfActiveStructure(tiles, args.me, tile, "HYDROWORKS", HYDROWORKS_RADIUS)) {
      slots += HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS;
    }
    if (structureType === "MINE" && isWithinRadiusOfActiveStructure(tiles, args.me, tile, "ORE_REFINERY", ORE_REFINERY_RADIUS)) {
      slots += ORE_REFINERY_MINE_SLOT_BONUS;
    }
    add(label, slots);
    total += slots;
  }
  const supply = args.resourceSlots.supply[resource];
  const grant = args.domainSlotGrant;
  if (grant && grant.resource === resource && grant.count > 0) {
    const granted = Math.min(grant.count, Math.max(0, supply - total));
    add(grant.label, granted);
    total += granted;
  }
  if (supply > total + 0.5) add("Other bonuses", supply - total);
  return [...buckets.values()].sort((a, b) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label));
};

/**
 * The installed AFC upgrade that grants slots of the player's chosen trickle
 * resource, mirroring the sim's domainGrantedResourceSlots (tech-domain-
 * bridge.ts) so the panel can name it instead of "Other bonuses".
 */
export const domainSlotGrantFor = (
  domainCatalog: readonly DomainInfo[],
  domainIds: readonly string[],
  chosenTrickleResource: ChosenTrickleResource | undefined
): EconomyPanelArgs["domainSlotGrant"] => {
  if (!chosenTrickleResource) return undefined;
  for (const id of domainIds) {
    const domain = domainCatalog.find((entry) => entry.id === id);
    const count = domain?.effects?.chosenResourceSlotGrant;
    if (domain && typeof count === "number" && count > 0) return { label: domain.name, resource: chosenTrickleResource, count };
  }
  return undefined;
};
