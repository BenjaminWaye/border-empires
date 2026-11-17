import { describe, expect, it } from "vitest";
import { terrainAdjustedTownManpower } from "@border-empires/shared";
import type { Tile, TileMenuView } from "../client-types.js";
import { townScreenRegions } from "./client-hud-v2-town.js";

const view = { title: "Lumenwake", actions: [], buildings: [] } as unknown as TileMenuView;
const city = {
  x: 4, y: 4, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
  town: {
    name: "Lumenwake", type: "MARKET", baseGoldPerMinute: 2, supportCurrent: 8, supportMax: 8, goldPerMinute: 5, cap: 0,
    isFed: true, population: 168_585, maxPopulation: 1_000_000, populationTier: "CITY", connectedTownCount: 0, connectedTownBonus: 0,
    hasManufactory: false, manufactoryActive: false, hasIncubationEngine: false, incubationEngineActive: false
  }
} as unknown as Tile;
const left = (biota?: { received: number; needed: number; manpowerTier: "TOWN" | "CITY" }) =>
  townScreenRegions({
    town: city, focus: city, townView: view, focusView: view, townIndex: 0, townCount: 1, buildSelection: undefined, category: undefined,
    ...(biota ? { biota: { tileKey: "4,4", ...biota } } : {})
  }).left;
const cap = (tier: "TOWN" | "CITY") => `+${Math.round(terrainAdjustedTownManpower(tier, undefined, false).cap).toLocaleString("en-US")}`;

// Playtest 2026-11-17: an unruly City's town screen never mentioned biota and
// showed the City's full manpower cap while it was giving a Town's.
describe("HUD v2 town screen luxury biota", () => {
  it("shows an unruly town's biota shortfall and the manpower it actually gives", () => {
    const html = left({ received: 0, needed: 1, manpowerTier: "TOWN" });
    expect(html).toContain("Unruly · luxury biota");
    expect(html).toContain("○ 0 of 1 · Cultivation Estate supplies 2");
    expect(html).toContain("Unruly · working as a Town");
    expect(html).toContain(cap("TOWN"));
    expect(cap("TOWN")).not.toBe(cap("CITY"));
  });

  it("shows a supplied town as full manpower", () => {
    const html = left({ received: 1, needed: 1, manpowerTier: "CITY" });
    expect(html).toContain("● 1 of 1 · Full manpower");
    expect(html).toContain(cap("CITY"));
    expect(html).not.toContain("Unruly");
  });

  it("leaves biota out for a town that needs none", () => {
    expect(left()).not.toContain("biota");
  });
});
