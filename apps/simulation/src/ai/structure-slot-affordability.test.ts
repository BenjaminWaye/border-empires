import { RELAY_BEACON_FREE_FOOD_SLOT_COUNT, TECH_REQUIREMENTS_BY_STRUCTURE } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { canAffordStructure } from "./structure-command-planner.js";

const player = {
  id: "ai-1", points: 10000, manpower: 100000,
  slotSupplyByResource: { FOOD: 1, CRYSTAL: 0 }, slotDemandByResource: { FOOD: 1, CRYSTAL: 0 }
};
const techs = new Set(Object.values(TECH_REQUIREMENTS_BY_STRUCTURE));

describe("AI economic resource-slot affordability", () => {
  it("rejects a FOOD consumer with no free FOOD slots before scoring", () => {
    expect(canAffordStructure(player, techs, "INCUBATION_ENGINE", 0)).toBe(false);
  });

  it("checks the required resource rather than treating every shortage as FOOD", () => {
    expect(canAffordStructure(player, techs, "SKY_DOCK", 0)).toBe(false);
  });

  it("keeps FOOD sources available during a FOOD deficit", () => {
    const deficit = { ...player, slotDemandByResource: { FOOD: 30 } };
    expect(canAffordStructure(deficit, techs, "HYDROGARDEN", 0)).toBe(true);
    expect(canAffordStructure(deficit, techs, "HYDROWORKS", 0)).toBe(true);
  });

  it("keeps synthesizers buildable without their output resource", () => {
    expect(canAffordStructure(player, techs, "AETHER_CONDENSER", 0)).toBe(true);
  });

  it("preserves the first five beacon exemption even during a deficit", () => {
    const deficit = { ...player, slotDemandByResource: { FOOD: 30 } };
    expect(canAffordStructure(deficit, techs, "RELAY_BEACON", RELAY_BEACON_FREE_FOOD_SLOT_COUNT - 1)).toBe(true);
    expect(canAffordStructure(deficit, techs, "RELAY_BEACON", RELAY_BEACON_FREE_FOOD_SLOT_COUNT)).toBe(false);
  });

  it("admits a paid beacon when enough FOOD capacity is available", () => {
    expect(canAffordStructure({ ...player, slotSupplyByResource: { FOOD: 2 } }, techs,
      "RELAY_BEACON", RELAY_BEACON_FREE_FOOD_SLOT_COUNT)).toBe(true);
  });

  it("preserves older callers that do not supply resource-slot totals", () => {
    expect(canAffordStructure({ id: "ai-1", points: 10000, manpower: 100000 }, techs, "INCUBATION_ENGINE", 0)).toBe(true);
  });
});
