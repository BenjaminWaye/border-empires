// Owner request 2026-11-25: a garrisoned town whose plots weren't all garrisoned showed only Raise flag;
// the bar now leads with a gold Garrison plots button.
import { describe, expect, it } from "vitest";
import { townScreenRegions } from "./client-hud-v2-town.js";
import type { Tile, TileMenuView } from "../client-types.js";

const town = { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { name: "Voltysfocus", type: "FARMING", populationTier: "CITY", population: 239_000 } } as Tile;
const view = { title: "Voltysfocus", subtitle: "", actions: [], buildings: [], crystal: [], tabs: ["actions"], overviewLines: [] } as unknown as TileMenuView;
const bar = (plotGarrison?: { count: number; cost: string; disabledReason?: string }): string =>
  townScreenRegions({ town, focus: town, townView: view, focusView: view, townIndex: 0, townCount: 1, buildSelection: undefined, category: undefined, plotGarrison }).bar;

describe("town screen Garrison plots button", () => {
  it("shows a gold Garrison plots button with its cost while plots are left", () => {
    const html = bar({ count: 3, cost: "3 plots · 150 coin, 75 manpower" });
    expect(html).toMatch(/<button type="button" class="v2t-act v2t-act-primary" data-v2-garrison-plots="0,0" title="Garrison 3 plots around the town">Garrison plots<small>3 plots · 150 coin, 75 manpower<\/small>/);
  });

  it("is disabled with the reason on it when it can't start", () => {
    expect(bar({ count: 1, cost: "1 plot", disabledReason: "Need 50 coin" })).toMatch(/data-v2-garrison-plots="0,0" disabled[^>]*>Garrison plots<small>Need 50 coin/);
  });

  it("is absent once every plot is garrisoned", () => {
    expect(bar()).not.toContain("data-v2-garrison-plots");
  });
});
