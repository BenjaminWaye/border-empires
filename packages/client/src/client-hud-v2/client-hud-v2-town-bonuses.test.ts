import { describe, expect, it } from "vitest";
import type { Tile, TileMenuView } from "../client-types.js";
import { townScreenRegions } from "./client-hud-v2-town.js";

const view = { title: "Avalon", actions: [], buildings: [] } as unknown as TileMenuView;

// Regression: the HUD town screen's "Town bonuses" list only showed terrain,
// never the connected-town coin bonus or whose Trade Nexus enables it.
describe("HUD v2 town screen bonuses", () => {
  it("lists the connected-town bonus and its Trade Nexus town", () => {
    const tile = {
      x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
      town: {
        name: "Bryn", type: "MARKET", baseGoldPerMinute: 2, supportCurrent: 4, supportMax: 4, goldPerMinute: 5, cap: 0,
        isFed: true, population: 20_000, maxPopulation: 50_000, populationTier: "TOWN",
        connectedTownCount: 1, connectedTownBonus: 0.5, tradeNexusTownNames: ["Avalon"],
        hasManufactory: false, manufactoryActive: false, hasIncubationEngine: false, incubationEngineActive: false
      }
    } as unknown as Tile;
    const { left } = townScreenRegions({ town: tile, focus: tile, townView: view, focusView: view, townIndex: 0, townCount: 1, buildSelection: undefined, category: undefined });
    expect(left).toContain("1 connected town");
    expect(left).toContain("Coin +50% (Trade Nexus in Avalon)");
  });

  // Regression: every effect was prefixed with "Coin ", giving "Coin coin production stopped".
  it("does not double the Coin prefix on worded effects", () => {
    const tile = {
      x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
      town: {
        name: "Bryn", type: "MARKET", baseGoldPerMinute: 2, supportCurrent: 4, supportMax: 4, goldPerMinute: 0, cap: 0,
        isFed: false, population: 20_000, maxPopulation: 50_000, populationTier: "TOWN", connectedTownCount: 0, connectedTownBonus: 0,
        hasManufactory: false, manufactoryActive: false, hasIncubationEngine: false, incubationEngineActive: false
      }
    } as unknown as Tile;
    const { left } = townScreenRegions({ town: tile, focus: tile, townView: view, focusView: view, townIndex: 0, townCount: 1, buildSelection: undefined, category: undefined });
    expect(left).toContain(">coin production stopped<");
    expect(left).not.toContain("Coin coin");
  });
});
