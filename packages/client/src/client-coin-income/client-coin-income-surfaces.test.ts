// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { hudEconomyPanelHtml } from "../client-hud/client-hud-economy-panel.js";
import { resourceBarHtml } from "../client-hud-v2/client-hud-v2-resource-bar.js";
import { profileHtml } from "../client-hud-v2/client-hud-v2-profile.js";
import { empireCoinIncome } from "./client-coin-income.js";

const economyDeps = {
  prettyToken: (token: string) => token,
  resourceIconHtml: () => "",
  rateToneClass: () => "",
  resourceLabel: (resource: string) => resource,
  economicStructureName: (type: string) => type,
  hasRevealedResourceCategory: () => true
};

const text = (html: string, selector: string): string => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.querySelector(selector)?.textContent?.trim() ?? "";
};

const profileBase = {
  color: "#fff",
  career: undefined,
  holdings: undefined,
  pacts: undefined,
  truceBreaks: undefined,
  nameOf: () => undefined,
  nowMs: 0
} as const;

// Playtest (Henrik, day 3, after the shared coin breakdown landed): one empire's
// coin income read 24, 38 and 23 on different screens. The coin chip rounded net
// income to whole coin (24), Economy showed it to one decimal (23.6), and your own
// profile showed the leaderboard's periodic gross snapshot (38) as "Coin / day".
describe("coin income surfaces read one figure", () => {
  it("shows the same net coin per day on the coin chip, Economy and your own profile", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 500;
    state.incomePerMinute = 38 / 1440;
    state.upkeepPerMinute = { ...state.upkeepPerMinute, gold: 14.4 / 1440 };
    const staleEntry = { id: "me", name: "Me", tiles: 40, incomePerMinute: 38 / 1440, techs: 3, manpowerCap: 300, score: 100, rank: 1 };

    const chip = text(resourceBarHtml({
      gold: state.gold,
      netPerMinute: empireCoinIncome(state).netPerMinute,
      slotSupply: state.resourceSlots.supply,
      slotDemand: state.resourceSlots.demand,
      integrityPct: undefined
    }), ".hud-v2-chip-rate");
    const economy = text(hudEconomyPanelHtml(state, economyDeps), "[data-v2e-row='GOLD'] .v2e-status");
    const profile = profileHtml({
      ...profileBase, id: "me", name: "Me", relation: { kind: "self" }, entry: staleEntry,
      ownNetCoinPerMinute: empireCoinIncome(state).netPerMinute
    });

    expect(chip).toBe("+23.6/day");
    expect(economy).toBe("+23.6/day");
    expect(profile).toContain("Net coin / day");
    expect(text(profile, ".v2p-stat[title] b")).toBe("23.6");
    expect(profile).not.toContain("38.0");
  });

  it("labels a rival's leaderboard figure as gross income", () => {
    const html = profileHtml({
      ...profileBase, id: "p2", name: "Vasker", relation: { kind: "none" },
      entry: { id: "p2", name: "Vasker", tiles: 40, incomePerMinute: 38 / 1440, techs: 3, manpowerCap: 300, score: 100, rank: 2 }
    });
    expect(html).toContain("Gross coin / day");
    expect(html).toContain("38.0");
  });

  // Playtest: the chip rounded 11.6 coin up to "12", and a 12-coin trade then failed.
  it("shows the coin balance rounded down to what you can spend on the chip and in Economy", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 11.6;
    const chip = text(resourceBarHtml({
      gold: state.gold,
      netPerMinute: 0,
      slotSupply: state.resourceSlots.supply,
      slotDemand: state.resourceSlots.demand,
      integrityPct: undefined
    }), ".hud-v2-chip-value");
    expect(chip).toBe("11");
    expect(text(hudEconomyPanelHtml(state, economyDeps), "[data-v2e-row='GOLD'] .v2e-amount")).toBe("11");
  });
});
