import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { townGoldBonuses, townManpowerBonuses, townModifierGroupsOutsideStatCards } from "./client-town-stat-bonuses.js";
import { townStatGridHtml } from "../client-town-stat-grid/client-town-stat-grid.js";

type Town = NonNullable<Tile["town"]>;

const town = (overrides: Partial<Town> = {}): Town => ({
  type: "MARKET",
  baseGoldPerMinute: 2,
  supportCurrent: 6,
  supportMax: 6,
  goldPerMinute: 7,
  cap: 100,
  isFed: true,
  population: 60_000,
  maxPopulation: 200_000,
  populationTier: "CITY",
  connectedTownCount: 2,
  connectedTownBonus: 0.9,
  hasManufactory: false,
  manufactoryActive: false,
  hasIncubationEngine: false,
  incubationEngineActive: false,
  ...overrides
} as Town);

// Regression: the town stat cards only listed terrain/coastal modifiers, so
// the connected-town bonus (and whose Trade Nexus powers it) was invisible.
describe("townGoldBonuses", () => {
  it("lists the connected-town bonus with the Trade Nexus town that enables it", () => {
    const bonuses = townGoldBonuses(town({ tradeNexusTownNames: ["Avalon"] }));
    expect(bonuses).toContainEqual({ label: "2 connected towns", effect: "+90% (Trade Nexus in Avalon)", tone: "positive" });
    expect(bonuses).toContainEqual({ label: "City tier", effect: "+25%", tone: "positive" });
  });

  it("explains a 0% connected-town bonus as a missing Trade Nexus", () => {
    const bonuses = townGoldBonuses(town({ connectedTownBonus: 0 }));
    expect(bonuses.find((b) => b.label === "2 connected towns")?.effect).toContain("build a Trade Nexus");
  });

  it("includes support shortfall, Mercantile Charter and per-building coin lines", () => {
    const bonuses = townGoldBonuses(town({
      supportCurrent: 3,
      firstThreeTownGoldMult: 1.2,
      townModifierTotals: [{ heading: "2 Manufactories", modifiers: [{ statLabel: "Coin production", valueText: "+70%", tone: "positive" }] }]
    }));
    expect(bonuses).toContainEqual({ label: "Support 3/6", effect: "−50%", tone: "negative" });
    expect(bonuses).toContainEqual({ label: "Mercantile Charter", effect: "+20%", tone: "positive" });
    expect(bonuses).toContainEqual({ label: "2 Manufactories", effect: "Coin production +70%", tone: "positive" });
    expect(townGoldBonuses(town(), { includeBuildings: false }).some((b) => b.label === "2 Manufactories")).toBe(false);
  });

  it("reports an unfed town's coin as stopped", () => {
    expect(townGoldBonuses(town({ isFed: false }))).toEqual([{ label: "Unfed", effect: "coin production stopped", tone: "negative" }]);
  });
});

describe("townManpowerBonuses / townModifierGroupsOutsideStatCards", () => {
  const withBuildings = town({
    townModifierTotals: [
      { heading: "3 Ancillary Depots", modifiers: [{ statLabel: "Manpower cap", valueText: "+450", tone: "positive" }] },
      { heading: "1 Weapons Workshop", modifiers: [{ statLabel: "Empire attack", valueText: "+5%", tone: "positive" }] }
    ]
  });

  it("moves manpower building lines into the manpower card and keeps other groups below", () => {
    expect(townManpowerBonuses(withBuildings)).toEqual([{ label: "3 Ancillary Depots", effect: "Manpower cap +450", tone: "positive" }]);
    expect(townModifierGroupsOutsideStatCards(withBuildings).map((g) => g.heading)).toEqual(["1 Weapons Workshop"]);
  });

  it("renders the bonus lines inside the Coin and Manpower cards", () => {
    const html = townStatGridHtml({
      population: 1, maxPopulation: 2, populationTierLabel: "City", growthText: "", growthTone: "neutral",
      goldPerDayLabel: "10", manpowerCapLabel: "100", manpowerRegenLabel: "",
      goldBonuses: townGoldBonuses(town({ tradeNexusTownNames: ["Avalon"] })),
      manpowerBonuses: townManpowerBonuses(withBuildings)
    });
    expect(html).toContain("Trade Nexus in Avalon");
    expect(html).toContain("Manpower cap +450");
  });
});
