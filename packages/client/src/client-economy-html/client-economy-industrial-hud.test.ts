import { expect, it } from "vitest";
import { EMPIRE_STORAGE_FLOOR, emptyNetworkSiteCounts } from "@border-empires/shared";
import { emptyEconomyBreakdown } from "../client-economy-model.js";
import { renderEconomyPanelHtml, type EconomyPanelArgs } from "./client-economy-html.js";
it("shows industrial supply, occupied slots and bonuses in the Economy panel", () => {
  const amounts = { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 };
  const slots = { FOOD: 6, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 };
  const args: EconomyPanelArgs = {
    focus: "ALL", gold: 0, me: "me", incomePerMinute: 0, strategicResources: amounts,
    storageCap: EMPIRE_STORAGE_FLOOR, strategicProductionPerMinute: amounts,
    upkeepPerMinute: { gold: 0, food: 0, titanium: 0, crystal: 0, umbrite: 0 },
    upkeepLastTick: {}, activeRevealTargetsCount: 0, tiles: [], economyBreakdown: emptyEconomyBreakdown(),
    prettyToken: value => value, resourceIconHtml: () => "", rateToneClass: () => "",
    resourceLabel: value => value, economicStructureName: value => value, dormantStructures: [],
    resourceSlots: { supply: slots, demand: slots, sources: {
      FOOD: [{ kind: "TILE", id: "FARM", slots: 5, count: 5 }, { kind: "TRADE_IMPORT", id: "", slots: 3, count: 1 }, { kind: "TRADE_EXPORT", id: "", slots: -2, count: 1 }],
      TITANIUM: [], CRYSTAL: [], UMBRITE: []
    }, bonusSupply: {
      supply: { ...emptyNetworkSiteCounts(), LUXURY_BIOTA: 2, PRECURSOR_SALVAGE: 1 },
      used: { ...emptyNetworkSiteCounts(), LUXURY_BIOTA: 1, PRECURSOR_SALVAGE: 1 }
    } }
  };
  const html = renderEconomyPanelHtml(args);
  expect(html).toContain('class="v2e"');
  expect(html).toContain("Luxury biota");
  expect(html).toContain("4 biota slots");
  expect(html).toContain("+1% attack and defense");
  for (const markup of [html, renderEconomyPanelHtml({ ...args, focus: "FOOD" })]) {
    expect(markup).toContain("Trade imports");
    expect(markup).toContain("Committed exports");
    expect(markup).toContain("−2");
    expect(markup).not.toContain("+-2");
  }
});
