import { describe, expect, it } from "vitest";

import type { Tile } from "../client-types.js";
import { openBuildSlotsForTown } from "./client-town-list-slots.js";
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

const mapOf = (list: Tile[]): Map<string, Tile> => new Map(list.map((tile) => [`${tile.x},${tile.y}`, tile]));

const tiles = mapOf([
  townTile(1, "Ashford", 2, 4000),
  townTile(2, "Brimvale", 0.5, 9000),
  townTile(3, "Cogsworth", 5, 1000),
  townTile(4, "Enemy Keep", 9, 20000, { ownerId: "rival" }),
  townTile(5, "Fogged", 9, 20000, { fogged: true })
]);

const rowsOf = (map: Map<string, Tile>) => deriveTownListRows(map.values(), "me", map);

const plain = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...overrides });

describe("town list", () => {
  // Playtest 2026-11-12: Towns said 17,135 / 10,000,000 (the hard cap) while
  // the town's own screen said 17,135 / 100,000 (growth to City).
  it("shows the next tier's population, like the town screen, not the hard cap", () => {
    const map = mapOf([townTile(1, "Durndelve", 1, 17_135, { town: { ...townTile(1, "Durndelve", 1, 17_135).town!, maxPopulation: 10_000_000 } })]);
    expect(rowsOf(map)[0]?.maxPopulation).toBe(100_000);
    expect(townListCardHtml(map, "me")).toContain("17,135<small>/ 100,000</small>");
  });

  it("labels the income column Coin/day, like every other screen", () => {
    expect(townListCardHtml(tiles, "me")).toContain("Coin/day");
    expect(townListCardHtml(tiles, "me")).not.toContain("Gold");
  });

  it("lists only the viewer's visible towns", () => {
    expect(rowsOf(tiles).map((row) => row.name)).toEqual(["Ashford", "Brimvale", "Cogsworth"]);
  });

  it("sorts by gold, population and growth in either direction", () => {
    const rows = rowsOf(tiles);
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
    const sabotaged = townTile(1, "Ashford", 2, 4000, { sabotage: { ownerId: "rival", endsAt: Date.now() + 60_000, outputMultiplier: 0.5 } });
    expect(rowsOf(mapOf([sabotaged]))[0]?.goldPerMinute).toBe(1);
    const dock = townTile(2, "Brimvale", 2, 4000, { dockId: "d1", yieldRate: { goldPerMinute: 3 } });
    expect(rowsOf(mapOf([dock]))[0]?.goldPerMinute).toBe(3);
  });

  // Playtest day 1: every town read 0.0 coin/day here while its own screen showed +21/day. A tile-detail
  // reply had cached yieldRate 0 from before the town was garrisoned, and the later town summary that
  // raised town.goldPerMinute did not clear it.
  it("matches the town screen when a cached yield rate is stale", () => {
    const stale = townTile(1, "Ashford", 21 / 1440, 4000, { yieldRate: { goldPerMinute: 0 } });
    expect(rowsOf(mapOf([stale]))[0]?.goldPerMinute).toBeCloseTo(21 / 1440, 4);
    expect(townListCardHtml(mapOf([stale]), "me")).toContain(">21.0<");
  });

  it("reads missing economy fields as zero and fed instead of NaN and unfed", () => {
    const partial = townTile(1, "Ashford", 2, 4000);
    const town = partial.town as unknown as Record<string, unknown>;
    delete town.goldPerMinute;
    delete town.isFed;
    delete town.populationGrowthPerMinute;
    const html = townListCardHtml(mapOf([partial]), "me");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Unfed");
    expect(rowsOf(mapOf([partial]))[0]).toMatchObject({ goldPerMinute: 0, growthPerMinute: 0, isFed: true });
  });

  it("escapes town names", () => {
    expect(townListCardHtml(mapOf([townTile(1, "<b>x</b>", 1, 1000)]), "me")).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("counts open build slots: owned, settled, empty support tiles assigned to the town", () => {
    const town = townTile(10, "Hub", 1, 4000, { y: 10 });
    const map = mapOf([
      town,
      plain(9, 9),
      plain(10, 9),
      plain(11, 9, { economicStructure: { ownerId: "me", type: "MANUFACTORY", status: "active" } as NonNullable<Tile["economicStructure"]> }),
      plain(9, 10, { ownershipState: "FRONTIER" }),
      plain(11, 10, { ownerId: "rival" }),
      plain(9, 11, { fort: { ownerId: "me", status: "active" } as NonNullable<Tile["fort"]> })
    ]);
    expect(openBuildSlotsForTown(map, town, "me")).toBe(2);
    const row = rowsOf(map).find((entry) => entry.name === "Hub");
    expect(row?.openSlots).toBe(2);
    expect(townListCardHtml(map, "me")).toContain('title="Open build slots">2<');
  });

  it("shows no slots for settlements and sorts by open slots", () => {
    const settlement = townTile(20, "Outpost", 1, 100, { y: 20 });
    if (settlement.town) settlement.town.populationTier = "SETTLEMENT";
    const roomy = townTile(30, "Roomy", 1, 4000, { y: 30 });
    const map = mapOf([settlement, roomy, plain(31, 30), plain(29, 30), townTile(40, "Packed", 1, 4000, { y: 40 })]);
    const rows = rowsOf(map);
    expect(rows.find((entry) => entry.name === "Outpost")?.openSlots).toBeUndefined();
    expect(sortTownListRows(rows, { key: "slots", descending: true }).map((entry) => entry.name)).toEqual(["Roomy", "Packed", "Outpost"]);
    expect(sortTownListRows(rows, { key: "slots", descending: false }).map((entry) => entry.name)).toEqual(["Packed", "Roomy", "Outpost"]);
    expect(townListCardHtml(map, "me")).toContain("—");
  });

  it("counts a tile two towns share only for the lowest (x, y) town", () => {
    const west = townTile(50, "West", 1, 4000, { y: 50 });
    const east = townTile(52, "East", 1, 4000, { y: 50 });
    const map = mapOf([west, east, plain(51, 50)]);
    expect(openBuildSlotsForTown(map, west, "me")).toBe(1);
    expect(openBuildSlotsForTown(map, east, "me")).toBe(0);
  });

  it("reaches the second ring for a Great City", () => {
    const city = townTile(60, "Capital", 1, 4000, { y: 60 });
    if (city.town) city.town.populationTier = "GREAT_CITY";
    const map = mapOf([city, plain(62, 62), plain(61, 60)]);
    expect(openBuildSlotsForTown(map, city, "me")).toBe(2);
  });

  it("skips tiles inside an AFC or relic footprint", () => {
    const town = townTile(70, "Shrine", 1, 4000, { y: 70 });
    const map = mapOf([town, plain(71, 70), plain(69, 70), plain(68, 70, { naturalWonder: {} as NonNullable<Tile["naturalWonder"]> })]);
    expect(openBuildSlotsForTown(map, town, "me")).toBe(1);
  });
});
