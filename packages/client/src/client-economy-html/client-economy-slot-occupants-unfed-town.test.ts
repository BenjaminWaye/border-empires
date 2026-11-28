import { describe, expect, it } from "vitest";

import { EMPIRE_STORAGE_FLOOR } from "@border-empires/shared";
import { renderEconomyPanelHtml } from "./client-economy-html.js";

const rowOf = (html: string, resource: string): string => html.match(new RegExp(`<section[^>]*data-v2e-row="${resource}"[\\s\\S]*?</section>`))?.[0] ?? "";

// First-15 playtest 2026-11-28: Economy read "Short 2" while the town screen read "Fed" and nothing in Economy said
// which town the shortage left unfed. "Used by" now tags an unfed town from the same isFed the town screen reads.
describe("renderEconomyPanelHtml — unfed towns in FOOD Used by", () => {
  const args = (isFed: boolean) => ({
    focus: "FOOD" as const,
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
    economicStructureName: () => "Manufactory",
    resourceSlots: { supply: { FOOD: 2, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 4, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } },
    tiles: [
      { x: 0, y: 0, terrain: "LAND" as const, ownerId: "me", ownershipState: "SETTLED" as const, town: { type: "MARKET" as const, populationTier: "TOWN" as const, population: 1, maxPopulation: 2, isFed, foodSlotDemand: 4 } }
    ]
  });

  it("says the town is unfed next to Short 2", () => {
    const food = rowOf(renderEconomyPanelHtml(args(false) as never), "FOOD");
    expect(food).toContain("Short 2");
    expect(food).toMatch(/Town support · 1 unfed/);
  });

  it("adds no warning to a fed town", () => {
    expect(rowOf(renderEconomyPanelHtml(args(true) as never), "FOOD")).not.toContain("unfed");
  });
});
