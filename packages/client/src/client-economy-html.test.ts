import { describe, expect, it } from "vitest";

import { emptyEconomyBreakdown } from "./client-economy-model.js";
import { renderEconomyPanelHtml } from "./client-economy-html.js";

describe("renderEconomyPanelHtml", () => {
  it("renders shared server breakdown counts and upkeep without depending on cached tiles", () => {
    const economyBreakdown = emptyEconomyBreakdown();
    economyBreakdown.GOLD.sources = [
      { label: "Docks", amountPerMinute: 6.5, count: 9 },
      { label: "Towns", amountPerMinute: 10, count: 10 }
    ];
    economyBreakdown.GOLD.sinks = [{ label: "Fur Synthesizer upkeep", amountPerMinute: 1.4, count: 2 }];

    const html = renderEconomyPanelHtml({
      focus: "GOLD",
      gold: 24.5,
      me: "me",
      incomePerMinute: 32.6,
      strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
      strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
      upkeepPerMinute: { food: 0, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 1.4 },
      upkeepLastTick: { foodCoverage: 1, gold: { contributors: economyBreakdown.GOLD.sinks } },
      activeRevealTargetsCount: 0,
      tiles: [],
      economyBreakdown,
      isMobile: true,
      prettyToken: (value) => value,
      resourceIconForKey: (resource) => resource,
      rateToneClass: () => "positive",
      resourceLabel: (resource) => resource,
      economicStructureName: (type) => type
    });

    expect(html).toContain("Towns · 10");
    expect(html).toContain("+10.00/m");
    expect(html).toContain("Fur Synthesizer upkeep · 2");
    expect(html).toContain("-1.40/m");
    expect(html).not.toContain("No upkeep on this resource");
  });
});
