import { describe, expect, it } from "vitest";

import type { Tile } from "../client-types.js";
import { deriveTownListRows, nextTownListSort, sortTownListRows, townListCardHtml } from "./client-town-list.js";

const townTile = (x: number, name: string, goldPerMinute: number, population: number, overrides: Partial<Tile> = {}): Tile => ({
  x,
  y: 0,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  town: {
    name,
    type: "MARKET",
    baseGoldPerMinute: goldPerMinute,
    supportCurrent: 0,
    supportMax: 0,
    goldPerMinute,
    cap: 0,
    isFed: true,
    population,
    maxPopulation: population * 2,
    populationGrowthPerMinute: population / 1000,
    populationTier: "TOWN",
    connectedTownCount: 0,
    connectedTownBonus: 0,
    hasManufactory: false,
    manufactoryActive: false,
    hasIncubationEngine: false,
    incubationEngineActive: false
  },
  ...overrides
});

const tiles = [
  townTile(1, "Ashford", 2, 4000),
  townTile(2, "Brimvale", 0.5, 9000),
  townTile(3, "Cogsworth", 5, 1000),
  townTile(4, "Enemy Keep", 9, 20000, { ownerId: "rival" }),
  townTile(5, "Fogged", 9, 20000, { fogged: true })
];

describe("town list", () => {
  it("lists only the viewer's visible towns", () => {
    expect(deriveTownListRows(tiles, "me").map((row) => row.name)).toEqual(["Ashford", "Brimvale", "Cogsworth"]);
  });

  it("sorts by gold, population and growth in either direction", () => {
    const rows = deriveTownListRows(tiles, "me");
    expect(sortTownListRows(rows, { key: "gold", descending: true }).map((row) => row.name)).toEqual(["Cogsworth", "Ashford", "Brimvale"]);
    expect(sortTownListRows(rows, { key: "gold", descending: false }).map((row) => row.name)).toEqual(["Brimvale", "Ashford", "Cogsworth"]);
    expect(sortTownListRows(rows, { key: "population", descending: true }).map((row) => row.name)).toEqual(["Brimvale", "Ashford", "Cogsworth"]);
    expect(sortTownListRows(rows, { key: "growth", descending: false }).map((row) => row.name)).toEqual(["Cogsworth", "Ashford", "Brimvale"]);
  });

  it("flips direction on the active column and starts a new column highest-first", () => {
    expect(nextTownListSort({ key: "gold", descending: true }, "gold")).toEqual({ key: "gold", descending: false });
    expect(nextTownListSort({ key: "gold", descending: false }, "population")).toEqual({ key: "population", descending: true });
  });

  it("renders rows in sort order with gold per day and jump targets", () => {
    const html = townListCardHtml(tiles, "me", { key: "gold", descending: false });
    expect(html).toContain("3 towns");
    expect(html.indexOf("Brimvale")).toBeLessThan(html.indexOf("Cogsworth"));
    expect(html).toContain('data-town-list-jump="2,0"');
    expect(html).toContain("720.0");
    expect(html).not.toContain("Enemy Keep");
  });

  it("shows the same gold as the map label, including sabotage and docks", () => {
    const sabotaged = townTile(1, "Ashford", 2, 4000, { yieldRate: { goldPerMinute: 1 } });
    expect(deriveTownListRows([sabotaged], "me")[0]?.goldPerMinute).toBe(1);
  });

  it("reads missing economy fields as zero and fed instead of NaN and unfed", () => {
    const partial = townTile(1, "Ashford", 2, 4000);
    const town = partial.town as unknown as Record<string, unknown>;
    delete town.goldPerMinute;
    delete town.isFed;
    delete town.populationGrowthPerMinute;
    const html = townListCardHtml([partial], "me");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Unfed");
    expect(deriveTownListRows([partial], "me")[0]).toMatchObject({ goldPerMinute: 0, growthPerMinute: 0, isFed: true });
  });

  it("escapes town names", () => {
    expect(townListCardHtml([townTile(1, "<b>x</b>", 1, 1000)], "me")).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
