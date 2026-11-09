// FOOD-slot relief tiers that sit around food-slot-relief.ts's core choosers:
//
// - chooseSurplusProducerToDisable: a MINE or UMBRITE_RIG costs a FOOD slot to
//   add a TITANIUM/CRYSTAL/UMBRITE slot. When that resource is already well in
//   surplus the FOOD slot buys nothing. Staging season-41: ai-10 ran 9 rigs
//   with UMBRITE 31 supply vs 1 demand while switching off 53 of its own Relay
//   Beacons for FOOD. Only gold and shards can be traded (diplomacy-terms.ts),
//   so a slot surplus has no other use.
// - chooseManuallyDisabledFoodConsumerToReenable: the inverse for any non-beacon
//   FOOD consumer relief switched off, once FOOD has headroom again.
import {
  BASE_SLOTS_BY_TILE_RESOURCE,
  ORE_REFINERY_MINE_SLOT_BONUS,
  TILE_SLOT_BOOST_STRUCTURES,
  structureSlotRequirements,
  type SlotResource,
  type SlotStructureType
} from "@border-empires/shared";
import type { AutomationPlannerTile } from "./automation-command-planner-types.js";
import type { FoodSlotReenableTarget, FoodSlotReliefPlan } from "./food-slot-relief.js";

/** Free slots (supply − demand) per non-FOOD slot resource. */
export type ResourceSlotHeadroom = Partial<Record<SlotResource, number>>;

// The most one producer can add: its own boost plus an Ore Refinery's bonus.
// Requiring at least this much headroom means switching it off can never push
// that resource into deficit.
const SURPLUS_PRODUCER_MIN_HEADROOM = 1 + ORE_REFINERY_MINE_SLOT_BONUS;

/** The slot resource a MINE/UMBRITE_RIG on this tile produces, if any. */
const producedSlotResource = (tile: AutomationPlannerTile): SlotResource | undefined => {
  const type = tile.economicStructure?.type;
  if (!type || !(type in TILE_SLOT_BOOST_STRUCTURES) || type === "HYDROGARDEN") return undefined;
  const produced = tile.resource ? BASE_SLOTS_BY_TILE_RESOURCE[tile.resource as keyof typeof BASE_SLOTS_BY_TILE_RESOURCE]?.slotResource : undefined;
  return produced && produced !== "FOOD" ? produced : undefined;
};

const usesFoodSlot = (type: string): boolean =>
  structureSlotRequirements(type as SlotStructureType).some((req) => req.resource === "FOOD");

const isSurplusProducer = (tile: AutomationPlannerTile, headroom: ResourceSlotHeadroom): boolean => {
  const produced = producedSlotResource(tile);
  return produced !== undefined && (headroom[produced] ?? 0) >= SURPLUS_PRODUCER_MIN_HEADROOM;
};

/** An active FOOD-using MINE/UMBRITE_RIG whose output resource is in surplus. Lowest x, then y. */
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

/**
 * A manually disabled non-beacon FOOD consumer worth switching back on.
 * Skips a producer whose resource is still in surplus (relief would just
 * switch it off again) and non-SETTLED tiles (the runtime refuses those).
 */
export const chooseManuallyDisabledFoodConsumerToReenable = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  headroom: ResourceSlotHeadroom | undefined
): FoodSlotReenableTarget | undefined => {
  let best: TTile | undefined;
  for (const tile of ownedTiles) {
    const structure = tile.economicStructure;
    if (!structure?.type || structure.ownerId !== playerId || structure.type === "RELAY_BEACON") continue;
    if (structure.status !== "inactive" || structure.inactiveReason !== "manual") continue;
    if (tile.ownershipState !== "SETTLED" || !usesFoodSlot(structure.type)) continue;
    if (headroom && isSurplusProducer(tile, headroom)) continue;
    if (!best || tile.x < best.x || (tile.x === best.x && tile.y < best.y)) best = tile;
  }
  return best ? { x: best.x, y: best.y } : undefined;
};

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
