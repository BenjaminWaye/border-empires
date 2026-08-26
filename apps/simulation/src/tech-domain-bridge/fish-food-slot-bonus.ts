// Agrarian Works ("agriculture") — flat +1 FOOD slot on every owned settled
// FISH tile, independent of any structure. Passed as resourceSlotSupplyForPlayer's
// fishFoodSlotBonus argument (resource-slot-view.ts). Split out of
// tech-domain-bridge.ts (already over the repo's 500-line file cap) rather
// than growing that file further. Accepts either the live DomainPlayer's
// Set<string> techIds or a wire-format player's string[] techIds — both
// call-site shapes appear across the runtime/snapshot paths.
import { AGRICULTURE_FISH_FOOD_SLOT_BONUS } from "@border-empires/shared";

export const techGrantedFishFoodSlotBonus = (player: { techIds: Iterable<string> }): number =>
  new Set(player.techIds).has("agriculture") ? AGRICULTURE_FISH_FOOD_SLOT_BONUS : 0;
