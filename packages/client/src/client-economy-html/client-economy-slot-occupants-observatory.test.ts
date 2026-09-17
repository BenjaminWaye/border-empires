import { describe, expect, it } from "vitest";

import { EMPIRE_STORAGE_FLOOR } from "@border-empires/shared";
import { renderEconomyPanelHtml } from "./client-economy-html.js";

// Regression: slotOccupantsForResource only inspected tile.fort,
// tile.siegeOutpost, and tile.economicStructure — Observatory ("Aether
// Tower" in the UI) lives on its own tile.observatory field (mirroring
// fort/siegeOutpost), so it was never counted in the "Occupied by" CRYSTAL
// breakdown even though it bills 1 CRYSTAL slot per instance
// (structure-slots.ts OBSERVATORY entry). This left the breakdown's total
// visibly short of the authoritative resourceSlots.demand figure.
describe("renderEconomyPanelHtml — Observatory counts toward Occupied by", () => {
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

  it("lists an active Observatory as \"Aether Tower\" under Occupied by", () => {
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
          observatory: { ownerId: "me", status: "active" }
        }
      ]
    });

    expect(html).toContain("Aether Tower");
    expect(html).toMatch(/Occupied by[\s\S]*Aether Tower/);
    expect(html).not.toContain("No structures using a CRYSTAL slot yet");
  });

  it("sums two Observatories into a single 2-slot Aether Tower row", () => {
    const html = renderEconomyPanelHtml({
      ...baseArgs,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 2, UMBRITE: 0 }
      },
      tiles: [
        {
          x: 0,
          y: 0,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          observatory: { ownerId: "me", status: "active" }
        },
        {
          x: 1,
          y: 0,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          observatory: { ownerId: "me", status: "active" }
        }
      ]
    });

    expect(html).toMatch(/Aether Tower[\s\S]*2 slots/);
  });

  it("excludes a removing or inactive Observatory from Occupied by", () => {
    const html = renderEconomyPanelHtml({
      ...baseArgs,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
      },
      tiles: [
        {
          x: 0,
          y: 0,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          observatory: { ownerId: "me", status: "removing" }
        },
        {
          x: 1,
          y: 0,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          observatory: { ownerId: "me", status: "inactive" }
        }
      ]
    });

    expect(html).toContain("No structures using a CRYSTAL slot yet");
  });
});
