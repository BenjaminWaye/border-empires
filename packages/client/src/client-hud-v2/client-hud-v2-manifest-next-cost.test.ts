import { describe, expect, it } from "vitest";
import type { TechInfo } from "../client-types.js";
import { manifestCostAfterCommission, manifestDetailHtml } from "./client-hud-v2-manifest.js";

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

  it("does not show it on a commissioned Manifest", () => {
    const seed = tech("seed", 10);
    const html = manifestDetailHtml({ techs: [seed], owned: new Set(["seed"]), selectedId: seed.id, closedLanes: new Set(), gold: 50, choices: new Set(), afcTier: 0 });
    expect(html).not.toContain("Next after this");
  });
});
