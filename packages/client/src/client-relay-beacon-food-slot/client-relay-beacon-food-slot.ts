// RELAY_BEACON-specific FOOD-slot gate — split out of
// client-tile-action-logic.ts (already over the repo's 500-line soft cap;
// see scripts/check-file-line-limits.mjs).
//
// The player's first RELAY_BEACON_FREE_FOOD_SLOT_COUNT outposts need zero
// FOOD slots (server-side waiver, apps/simulation/src/tech-domain-bridge/
// slot-waivers.ts). The generic hasFreeResourceSlots/missingResourceSlotReason
// gate in client-tile-action-logic.ts only knows the current aggregate FOOD
// supply/demand, not "is this build one of my first N" — so a would-be Light
// Outpost needs its own count-based gate ahead of the generic FOOD-slot
// check, which only actually applies from the 6th outpost onward.
import { RELAY_BEACON_FREE_FOOD_SLOT_COUNT } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

export const ownedRelayBeaconCount = (state: ClientState): number => {
  let count = 0;
  for (const t of state.tiles.values()) {
    if (t.economicStructure?.type === "RELAY_BEACON" && t.economicStructure.ownerId === state.me) count++;
  }
  return count;
};

export const hasFreeResourceSlotsForRelayBeacon = (state: ClientState): boolean =>
  ownedRelayBeaconCount(state) < RELAY_BEACON_FREE_FOOD_SLOT_COUNT ||
  (state.resourceSlots?.supply.FOOD ?? 0) - (state.resourceSlots?.demand.FOOD ?? 0) >= 1;

export const missingRelayBeaconSlotReason = (state: ClientState): string | undefined =>
  hasFreeResourceSlotsForRelayBeacon(state) ? undefined : "Need a free FOOD slot";
