import { afterEach, expect, it } from "vitest";
import { EMPIRE_STORAGE_FLOOR, emptyNetworkSiteCounts } from "@border-empires/shared";
import { emptyEconomyBreakdown } from "../client-economy-model.js";
import { setHudV2Driving } from "../client-hud-v2/client-hud-v2-flag.js";
import { renderEconomyPanelHtml, type EconomyPanelArgs } from "./client-economy-html.js";

afterEach(() => setHudV2Driving(false));
it("shows industrial supply, occupied slots and bonuses through the desktop HUD v2 branch", () => {
  setHudV2Driving(true);
  const amounts = { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 };
  const slots = { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 };
  const args: EconomyPanelArgs = {
    focus: "ALL", gold: 0, me: "me", incomePerMinute: 0, strategicResources: amounts,
    storageCap: EMPIRE_STORAGE_FLOOR, strategicProductionPerMinute: amounts,
    upkeepPerMinute: { gold: 0, food: 0, titanium: 0, crystal: 0, umbrite: 0 },
    upkeepLastTick: {}, activeRevealTargetsCount: 0, tiles: [], economyBreakdown: emptyEconomyBreakdown(),
    isMobile: false, prettyToken: value => value, resourceIconHtml: () => "", rateToneClass: () => "",
    resourceLabel: value => value, economicStructureName: value => value, dormantStructures: [],
    resourceSlots: { supply: slots, demand: slots, bonusSupply: {
      supply: { ...emptyNetworkSiteCounts(), NEURAL_RESIN: 2, PRECURSOR_SALVAGE: 1 },
      used: { ...emptyNetworkSiteCounts(), NEURAL_RESIN: 1, PRECURSOR_SALVAGE: 1 }
    } }
  };
  const html = renderEconomyPanelHtml(args);
  expect(html).toContain('class="v2e"');
  expect(html).toContain("Neural resin");
  expect(html).toContain("1 / 2 slots used · +12 Ancillaries/batch");
  expect(html).toContain("1 / 1 slots used · +1.5 Coin/day");
  expect(html).toContain("1 free");
});
