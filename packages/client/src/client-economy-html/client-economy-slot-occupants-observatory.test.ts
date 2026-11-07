import { describe, expect, it } from "vitest";

import { EMPIRE_STORAGE_FLOOR } from "@border-empires/shared";
import { renderEconomyPanelHtml } from "./client-economy-html.js";

/** One resource's row in the Economy panel. */
const rowOf = (html: string, resource: string): string => html.match(new RegExp(`<section[^>]*data-v2e-row="${resource}"[\\s\\S]*?</section>`))?.[0] ?? "";

// Regression: slotOccupantsForResource only inspected tile.fort,
// tile.siegeBattery, and tile.economicStructure — Observatory ("Aether
// Tower" in the UI) lives on its own tile.observatory field (mirroring
// fort/siegeBattery), so it was never counted in the "Occupied by" CRYSTAL
// breakdown even though it bills 1 CRYSTAL slot per instance
// (structure-slots.ts OBSERVATORY entry). This left the breakdown's total
// visibly short of the authoritative resourceSlots.demand figure.
describe("renderEconomyPanelHtml — Observatory counts toward Used by", () => {
  const baseArgs = {
    focus: "CRYSTAL" as const,
    gold: 0,
    me: "me",
    incomePerMinute: 0,
    strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
    storageCap: EMPIRE_STORAGE_FLOOR,
    dormantStructures: [],
    strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
    upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
    upkeepLastTick: { foodCoverage: 1 },
    activeRevealTargetsCount: 0,
    economyBreakdown: undefined,
    prettyToken: (value: string) => value,
    resourceIconHtml: (resource: string) => resource,
    rateToneClass: () => "positive",
    resourceLabel: (resource: string) => resource,
    economicStructureName: () => "Aether Condenser"
  };

  it("lists an active Observatory as \"Aether Tower\" under Used by", () => {
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
    expect(rowOf(html, "CRYSTAL")).toMatch(/Used by[\s\S]*Aether Tower/);
    expect(rowOf(html, "CRYSTAL")).not.toContain("Nothing yet");
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

    expect(rowOf(html, "CRYSTAL")).toMatch(/Aether Tower[\s\S]*<b>2<\/b>/);
  });

  it("excludes a removing or inactive Observatory from Used by", () => {
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

    expect(rowOf(html, "CRYSTAL")).toContain("Nothing yet");
  });
});
