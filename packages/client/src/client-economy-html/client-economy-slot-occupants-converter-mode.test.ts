import { describe, expect, it } from "vitest";

import { EMPIRE_STORAGE_FLOOR } from "@border-empires/shared";
import { renderEconomyPanelHtml } from "./client-economy-html.js";

// Regression: a converter in SYNTHESIZE/Refine mode is a slot SOURCE for its
// own family resource (listed under "Slot Sources"), not an occupant — it
// only starts occupying the slot once it's flipped to EXCHANGE/Sell Off mode.
// slotOccupantsForResource used to add it to "Occupied by" unconditionally,
// so an Aether Condenser in Refine mode showed up in both columns at once.
// Mirrors buildDemandContributors's `!isSourceConverter` gate
// (apps/simulation/src/resource-slot-view/resource-slot-view.ts).
describe("renderEconomyPanelHtml — converter mode gates slot occupancy", () => {
  const baseArgs = {
    focus: "CRYSTAL" as const,
    gold: 0,
    me: "me",
    incomePerMinute: 0,
    strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
    storageCap: EMPIRE_STORAGE_FLOOR,
    dormantStructures: [],
    strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
    upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
    upkeepLastTick: { foodCoverage: 1 },
    activeRevealTargetsCount: 0,
    economyBreakdown: undefined,
    isMobile: true,
    prettyToken: (value: string) => value,
    resourceIconForKey: (resource: string) => resource,
    rateToneClass: () => "positive",
    resourceLabel: (resource: string) => resource,
    economicStructureName: () => "Aether Condenser"
  };

  it("omits a Refine-mode Aether Condenser from Occupied by", () => {
    const html = renderEconomyPanelHtml({
      ...baseArgs,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 1, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
      },
      tiles: [
        {
          x: 0,
          y: 0,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          economicStructure: { ownerId: "me", type: "CRYSTAL_SYNTHESIZER", status: "active", converterMode: "SYNTHESIZE" }
        }
      ]
    });

    expect(html).toContain("No structures using a CRYSTAL slot yet");
    expect(html).not.toMatch(/Occupied by[\s\S]*Aether Condenser/);
  });

  it("lists a Sell Off-mode Aether Condenser under Occupied by", () => {
    const html = renderEconomyPanelHtml({
      ...baseArgs,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 1, UMBRITE: 0 }
      },
      tiles: [
        {
          x: 0,
          y: 0,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          economicStructure: { ownerId: "me", type: "CRYSTAL_SYNTHESIZER", status: "active", converterMode: "EXCHANGE" }
        }
      ]
    });

    expect(html).toContain("Aether Condenser");
    expect(html).toContain("1 slot");
    expect(html).not.toContain("No structures using a CRYSTAL slot yet");
  });
});
