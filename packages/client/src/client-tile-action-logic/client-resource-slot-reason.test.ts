import { describe, expect, it } from "vitest";
import { RELAY_BEACON_FREE_FOOD_SLOT_COUNT } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { createInitialState } from "../client-state/client-state.js";
import { missingResourceSlotReason } from "./client-resource-slot-gate.js";
import { resourceSlotReasonText } from "./client-resource-slot-reason.js";
import { missingRelayBeaconSlotReason } from "../client-relay-beacon-food-slot/client-relay-beacon-food-slot.js";

const slots = (food: [number, number], umbrite: [number, number] = [0, 0]) => ({
  supply: { FOOD: food[0], TITANIUM: 0, CRYSTAL: 0, UMBRITE: umbrite[0] },
  demand: { FOOD: food[1], TITANIUM: 0, CRYSTAL: 0, UMBRITE: umbrite[1] }
});

const stateWith = (resourceSlots: ReturnType<typeof slots>) => {
  const s = createInitialState();
  s.me = "me";
  s.resourceSlots = resourceSlots;
  return s;
};

// Playtest 2026-11-19: 8 FOOD used against 3 produced. "Need 6 FOOD" read as the building costing 6.
describe("missing resource slot reason", () => {
  it("keeps the requirement and adds the deficit when supply is below demand", () => {
    expect(missingResourceSlotReason(stateWith(slots([3, 8])), "MANUFACTORY")).toBe("Need a free FOOD slot · 5 short");
    // Past the free outposts, the Relay Beacon's own gate words it the same way.
    const beacons = stateWith(slots([3, 8]));
    for (let x = 0; x < RELAY_BEACON_FREE_FOOD_SLOT_COUNT; x += 1) {
      beacons.tiles.set(`${x},0`, { x, y: 0, terrain: "LAND", ownerId: "me", economicStructure: { type: "RELAY_BEACON", ownerId: "me", status: "active" } } as unknown as Tile);
    }
    expect(missingRelayBeaconSlotReason(beacons)).toBe("Need a free FOOD slot · 5 short");
  });

  it("stays the plain requirement with no deficit", () => {
    expect(missingResourceSlotReason(stateWith(slots([3, 3])), "MANUFACTORY")).toBe("Need a free FOOD slot");
    expect(missingResourceSlotReason(stateWith(slots([4, 3])), "MANUFACTORY")).toBeUndefined();
  });

  it("uses the same pattern for the other slot resources and multi-slot requirements", () => {
    expect(resourceSlotReasonText("UMBRITE", 1, -2)).toBe("Need a free UMBRITE slot · 2 short");
    expect(resourceSlotReasonText("UMBRITE", 2, 1)).toBe("Need 2 free UMBRITE slots (have 1)");
    expect(resourceSlotReasonText("UMBRITE", 3, 0)).toBe("Need 3 free UMBRITE slots (have 0)");
    expect(resourceSlotReasonText("CRYSTAL", 2, -1)).toBe("Need 2 free CRYSTAL slots · 1 short");
  });

  it("never names a fix", () => {
    expect(resourceSlotReasonText("FOOD", 1, -5)).not.toMatch(/farm|plot|garrison|→/i);
  });
});
