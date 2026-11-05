import { TECH_REQUIREMENTS_BY_STRUCTURE } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { canAffordStructure } from "./structure-command-planner.js";

const techs = new Set(Object.values(TECH_REQUIREMENTS_BY_STRUCTURE));

describe("AI build affordability with AFC manpower discounts", () => {
  // First-tier beacon costs 50 manpower; Relay Fabrication Line (×1/3) makes it 17.
  const poorPlayer = { id: "ai-1", points: 10_000, manpower: 20 };

  it("rejects a beacon the player cannot pay full price for", () => {
    expect(canAffordStructure(poorPlayer, techs, "RELAY_BEACON", 0)).toBe(false);
  });

  it("admits the same beacon once the AFC discount brings it within reach", () => {
    expect(canAffordStructure({ ...poorPlayer, domainIds: ["afc-dominion-1"] }, techs, "RELAY_BEACON", 0)).toBe(true);
  });
});
