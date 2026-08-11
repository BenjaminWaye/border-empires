import type { DomainPlayer } from "@border-empires/game-domain";
import { RELAY_BEACON_FREE_FOOD_SLOT_COUNT } from "@border-empires/shared";
import { emptySlotWaivers, type SlotWaivers } from "../resource-slot-view/resource-slot-view.js";
import { domainEntryById, techEntryById } from "./tech-domain-bridge.js";

// Split out of tech-domain-bridge.ts (already over the repo's 500-line soft
// cap; see scripts/check-file-line-limits.mjs).
//
// Like additiveEffectForPlayer/multiplicativeEffectForPlayer in
// tech-domain-bridge.ts, but combines multiple sources via max rather than
// sum/product — the right combination rule for §23.2's count-based waivers,
// where a later-tier domain "extends" an earlier one's exemption count
// rather than stacking on top of it (e.g. Fortress Realm's 5-Fort waiver
// supersedes Dwarf Kingdom's 3, giving 5 total if a player owns both, not 8).
export const maxEffectForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">,
  effectKey: string
): number => {
  let max = 0;
  for (const techId of player.techIds) {
    const value = techEntryById.get(techId)?.effects?.[effectKey];
    if (typeof value === "number" && Number.isFinite(value)) max = Math.max(max, value);
  }
  for (const domainId of player.domainIds ?? []) {
    const value = domainEntryById.get(domainId)?.effects?.[effectKey];
    if (typeof value === "number" && Number.isFinite(value)) max = Math.max(max, value);
  }
  return max;
};

// §23.2: the player's current resource-slot waivers (Dwarf Kingdom/Fortress
// Realm/Supply State/Treasury State/Enduring Realm), read from their owned
// techs/domains and handed to resource-slot-view.ts's demand/dormancy
// functions. relayBeaconFoodSlotWaiverCount is built-in (always
// RELAY_BEACON_FREE_FOOD_SLOT_COUNT), not tech/domain-gated.
export const slotWaiversForPlayer = (player: Pick<DomainPlayer, "techIds" | "domainIds">): SlotWaivers => ({
  fortTitaniumSlotWaiverCount: maxEffectForPlayer(player, "fortTitaniumSlotWaiverCount"),
  outpostUmbriteSlotWaiverCount: maxEffectForPlayer(player, "outpostUmbriteSlotWaiverCount"),
  relayBeaconFoodSlotWaiverCount: RELAY_BEACON_FREE_FOOD_SLOT_COUNT,
  firstTownsFoodSlotWaiverCount: maxEffectForPlayer(player, "firstTownsFoodSlotWaiverCount"),
  allTownsFoodSlotWaiverPerTown: maxEffectForPlayer(player, "allTownsFoodSlotWaiverPerTown")
});

export { emptySlotWaivers };
