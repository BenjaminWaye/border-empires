import { describe, expect, it } from "vitest";
import type { TechInfo } from "../client-types.js";
import { manifestCostAfterCommission, manifestDetailHtml, manifestHeadRightHtml } from "./client-hud-v2-manifest.js";

const tech = (id: string, gold: number): TechInfo => ({
  id, name: id, tier: 1, branch: "economy", prereqIds: [], description: "", mods: {},
  requirements: { gold, resources: {}, canResearch: true }
});

describe("Manifest price escalation is shown before you commission", () => {
  // Playtest (oldphone, optimiser): 10 → 40 → 70 → 100 with no warning that each commission raises the next price.
  it("follows the server's price table: +30 per commission at first", () => {
    expect(manifestCostAfterCommission(new Set(["a"]))).toBe(70);
    expect(manifestCostAfterCommission(new Set(["a", "b"]))).toBe(100);
  });

  it("puts the next price beside an available Manifest's Commission button", () => {
    const tooling = tech("tooling", 40);
    const html = manifestDetailHtml({ techs: [tech("seed", 10), tooling], owned: new Set(["seed"]), selectedId: tooling.id, closedLanes: new Set(), gold: 50, choices: new Set([tooling.id]), afcTier: 0 });
    expect(html).toContain("Commission · 40 Coin");
    expect(html).toContain("Next after this: 70 Coin");
  });

  // Playtest 2026-11-16: the Calculating Engine's 10% never showed in the Manifest prices.
  it("shows the Calculating Engine discount on the price and the next price", () => {
    const discounted = (id: string): TechInfo => ({ ...tech(id, 36), requirements: { gold: 36, goldBeforeDiscount: 40, goldDiscountFraction: 0.1, resources: {}, canResearch: true } });
    const tooling = discounted("tooling");
    const input = { techs: [tech("seed", 10), tooling], owned: new Set(["seed"]), selectedId: tooling.id, closedLanes: new Set<string>(), gold: 50, choices: new Set([tooling.id]), afcTier: 0 };
    const html = manifestDetailHtml(input);
    expect(html).toContain("Commission · 36 Coin");
    expect(html).toContain("Price 36 Coin (40 − 10% Calculating Engine)");
    expect(html).toContain("Next after this: 63 Coin");
    expect(manifestHeadRightHtml(input)).toContain("Next <b>36 Coin</b> (40 − 10% Calculating Engine)");
  });

  it("does not show it on a commissioned Manifest", () => {
    const seed = tech("seed", 10);
    const html = manifestDetailHtml({ techs: [seed], owned: new Set(["seed"]), selectedId: seed.id, closedLanes: new Set(), gold: 50, choices: new Set(), afcTier: 0 });
    expect(html).not.toContain("Next after this");
  });

  // Playtest 2026-11-18: a greyed Commission button was a dead end; say when coin covers it, in coin per day.
  it("says how much more coin an unaffordable Manifest needs and when it arrives", () => {
    const tooling = { ...tech("tooling", 40), requirements: { gold: 40, resources: {}, canResearch: false } };
    const input = { techs: [tech("seed", 10), tooling], owned: new Set(["seed"]), selectedId: tooling.id, closedLanes: new Set<string>(), gold: 10, choices: new Set([tooling.id]), afcTier: 0 };
    expect(manifestDetailHtml({ ...input, netPerMinute: 24 / 1440 })).toContain("Need 30 more Coin · +24.0/day · ready in 30h");
    expect(manifestDetailHtml({ ...input, netPerMinute: 0 })).toContain("Need 30 more Coin · +0.0/day · feed a town for Coin");
    expect(manifestDetailHtml({ ...input, gold: 50, netPerMinute: 1 })).not.toContain("v2m-coin-short");
  });
});
