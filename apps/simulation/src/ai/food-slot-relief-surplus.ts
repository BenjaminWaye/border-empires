// FOOD-slot relief tiers that sit around food-slot-relief.ts's core choosers:
//
// - chooseSurplusProducerToDisable: a town refinery costs a FOOD slot to
//   add TITANIUM/CRYSTAL/UMBRITE slots on its field. When that resource is already well in
//   surplus the FOOD slot buys nothing. Staging season-41: ai-10 ran 9 rigs
//   with UMBRITE 31 supply vs 1 demand while switching off 53 of its own Relay
//   Beacons for FOOD. Only gold and shards can be traded (diplomacy-terms.ts),
//   so a slot surplus has no other use.
// - chooseManuallyDisabledFoodConsumerToReenable: the inverse for any non-beacon
//   FOOD consumer relief switched off, once FOOD has headroom again.
import {
  BASE_SLOTS_BY_TILE_RESOURCE,
  REFINERY_BOOSTER_SLOTS_PER_TILE,
  REFINERY_FIELD_RESOURCE_BY_TYPE,
  REFINERY_SLOTS_PER_TILE,
  isRefineryType,
  structureSlotRequirements,
  type SlotResource,
  type SlotStructureType
} from "@border-empires/shared";
import type { AutomationPlannerTile } from "./automation-command-planner-types.js";
import type { FoodSlotReenableTarget, FoodSlotReliefPlan } from "./food-slot-relief.js";

/** Free slots (supply − demand) per non-FOOD slot resource. */
export type ResourceSlotHeadroom = Partial<Record<SlotResource, number>>;

// The planner tile does not say how many field tiles a refinery processes, so
// assume the most one can add: the largest worldgen field (8 tiles) at the
// boosted rate. Requiring at least this much headroom means switching it off
// can never push that resource into deficit. The refinery builder
// (build/refinery-build-planner.ts) refuses any build that would lift free
// slots to this threshold, so building and switching off cannot loop.
const LARGEST_WORLDGEN_FIELD_TILES = 8;
export const SURPLUS_PRODUCER_MIN_HEADROOM = LARGEST_WORLDGEN_FIELD_TILES * (REFINERY_SLOTS_PER_TILE + REFINERY_BOOSTER_SLOTS_PER_TILE);

/** The slot resource the refinery on this tile produces, if any. */
const producedSlotResource = (tile: AutomationPlannerTile): SlotResource | undefined => {
  const type = tile.economicStructure?.type;
  if (!isRefineryType(type)) return undefined;
  return BASE_SLOTS_BY_TILE_RESOURCE[REFINERY_FIELD_RESOURCE_BY_TYPE[type]]?.slotResource;
};

const usesFoodSlot = (type: string): boolean =>
  structureSlotRequirements(type as SlotStructureType).some((req) => req.resource === "FOOD");

const isSurplusProducer = (tile: AutomationPlannerTile, headroom: ResourceSlotHeadroom): boolean => {
  const produced = producedSlotResource(tile);
  return produced !== undefined && (headroom[produced] ?? 0) >= SURPLUS_PRODUCER_MIN_HEADROOM;
};

/** An active FOOD-using refinery whose output resource is in surplus. Lowest x, then y. */
export const chooseSurplusProducerToDisable = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  headroom: ResourceSlotHeadroom | undefined
): FoodSlotReliefPlan | undefined => {
  if (!headroom) return undefined;
  let best: TTile | undefined;
  for (const tile of ownedTiles) {
    const structure = tile.economicStructure;
    if (!structure?.type || structure.ownerId !== playerId || structure.status !== "active") continue;
    if (!usesFoodSlot(structure.type) || !isSurplusProducer(tile, headroom)) continue;
    if (!best || tile.x < best.x || (tile.x === best.x && tile.y < best.y)) best = tile;
  }
  return best ? { x: best.x, y: best.y, kind: "disable" } : undefined;
};

// Non-FOOD slots a structure needs (e.g. NEURAL_WORKS's CRYSTAL) must have
// room too, or the runtime refuses the re-enable and the planner retries it.
const otherSlotsFit = (type: string, headroom: ResourceSlotHeadroom | undefined): boolean =>
  structureSlotRequirements(type as SlotStructureType).every((req) =>
    req.resource === "FOOD" || headroom === undefined || (headroom[req.resource] ?? 0) >= req.count);

const lowerXY = (a: { x: number; y: number }, b: { x: number; y: number } | undefined): boolean =>
  !b || a.x < b.x || (a.x === b.x && a.y < b.y);

/**
 * One owned-tile pass for both re-enable kinds, beacons first (reach is the
 * priority): a manually disabled RELAY_BEACON when `beacons`, else a
 * manually disabled non-beacon FOOD consumer when `consumers`. Consumers skip
 * a producer whose resource is still in surplus (relief would switch it off
 * again), one still in overload recovery (`disabledUntil`), and one whose
 * other slots don't fit. Only SETTLED tiles (the runtime refuses others).
 */
export const chooseManuallyDisabledToReenable = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  want: { beacons: boolean; consumers: boolean },
  headroom: ResourceSlotHeadroom | undefined,
  nowMs: number
): FoodSlotReenableTarget | undefined => {
  let beacon: TTile | undefined;
  let consumer: TTile | undefined;
  for (const tile of ownedTiles) {
    const structure = tile.economicStructure;
    if (!structure?.type || structure.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
    if (structure.status !== "inactive" || structure.inactiveReason !== "manual") continue;
    if (structure.type === "RELAY_BEACON") {
      if (want.beacons && lowerXY(tile, beacon)) beacon = tile;
      continue;
    }
    if (!want.consumers || !usesFoodSlot(structure.type) || (structure.disabledUntil ?? 0) > nowMs) continue;
    if ((headroom && isSurplusProducer(tile, headroom)) || !otherSlotsFit(structure.type, headroom)) continue;
    if (lowerXY(tile, consumer)) consumer = tile;
  }
  const best = beacon ?? consumer;
  return best ? { x: best.x, y: best.y } : undefined;
};

/** Consumer-only form of chooseManuallyDisabledToReenable. */
export const chooseManuallyDisabledFoodConsumerToReenable = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  headroom: ResourceSlotHeadroom | undefined,
  nowMs = Date.now()
): FoodSlotReenableTarget | undefined =>
  chooseManuallyDisabledToReenable(ownedTiles, playerId, { beacons: false, consumers: true }, headroom, nowMs);

/** Headroom for the non-FOOD slot resources, from the planner's supply/demand maps. */
export const resourceSlotHeadroomFrom = (
  supply: Partial<Record<SlotResource, number>> | undefined,
  demand: Partial<Record<SlotResource, number>> | undefined
): ResourceSlotHeadroom | undefined => {
  if (!supply) return undefined;
  const headroom: ResourceSlotHeadroom = {};
  for (const resource of ["TITANIUM", "CRYSTAL", "UMBRITE"] as const) {
    headroom[resource] = (supply[resource] ?? 0) - (demand?.[resource] ?? 0);
  }
  return headroom;
};

/**
 * Same player with one extra FOOD slot of supply — used to ask "would a Relay
 * Beacon site exist if FOOD weren't full?". At exactly-full FOOD the beacon
 * planner already drops every site as unaffordable, so without this the
 * relief step can't tell a beacon is waiting on a FOOD slot.
 */
export const withOneSpareFoodSlot = <TPlayer extends { slotSupplyByResource?: Partial<Record<SlotResource, number>> | undefined }>(
  player: TPlayer
): TPlayer =>
  player.slotSupplyByResource
    ? { ...player, slotSupplyByResource: { ...player.slotSupplyByResource, FOOD: (player.slotSupplyByResource.FOOD ?? 0) + 1 } }
    : player;
