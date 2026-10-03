import { describe, expect, it } from "vitest";

import { EMPIRE_STORAGE_FLOOR } from "@border-empires/shared";
import { emptyEconomyBreakdown } from "../client-economy-model.js";
import { renderEconomyPanelHtml } from "./client-economy-html.js";

describe("renderEconomyPanelHtml gold display", () => {
  it("does not show a storage cap beside gold, even when storageCap.GOLD holds a stale floor", () => {
    const html = renderEconomyPanelHtml({
      focus: "GOLD",
      gold: 24.5,
      me: "me",
      incomePerMinute: 1,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      storageCap: EMPIRE_STORAGE_FLOOR,
      resourceSlots: {
        supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
      },
      dormantStructures: [],
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
      upkeepLastTick: { foodCoverage: 1, gold: { contributors: [] } },
      activeRevealTargetsCount: 0,
      tiles: [],
      economyBreakdown: emptyEconomyBreakdown(),
      isMobile: true,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(html).toContain("24.5 in reserve");
    expect(html).not.toMatch(/24\.5\s*(<[^>]*>\s*)*\/\s*\d/);
  });
});
