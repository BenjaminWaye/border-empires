import { describe, expect, it } from "vitest";

import type { NeedVector } from "./build/build-need-vector.js";
import type { TownEconomyEntry } from "./build/town-economy-view.js";
import {
  chooseBestEconomicBuild,
  type StructurePlannerPlayer,
  type StructurePlannerTile
} from "./structure-command-planner.js";

// Regression for docs/ai-economic-synergy-plan.md Phases 3–4: the planner
// never proposed a Clearing House or Neural Works, proposed a Trade Nexus in
// towns where it does nothing, and scored every Manufactory a flat 54.

const tile = (x: number, y: number, overrides: Partial<StructurePlannerTile> = {}): StructurePlannerTile => ({
  x,
  y,
  terrain: "LAND",
  ...overrides
});

const NEED: NeedVector = {
  MANPOWER_THROUGHPUT: 0,
  MANPOWER_CEILING: 0,
  FOOD_SLOTS: 0,
  TITANIUM_SLOTS: 0,
  UMBRITE_SLOTS: 0,
  CRYSTAL_SLOTS: 0,
  GOLD: 1,
  DEFENSE: 0,
  OFFENSE: 0,
  VICTORY: 0
};

const entry = (townKey: string, overrides: Partial<TownEconomyEntry> = {}): TownEconomyEntry => ({
  townKey,
  baseGoldWeight: 1,
  baseManpowerCap: 300,
  manufactories: 0,
  ancillaryDepots: 0,
  hasAncillaryFactory: false,
  connectedTownCount: 0,
  connectedTownBonus: 0,
  tradeNexusInReach: false,
  clearingHouseInReach: false,
  neuralWorksInReach: false,
  reserveLatticeInReach: false,
  ancillaryFactoriesInReach: 0,
  depotTownsInReach: 0,
  amplifiersUnderConstruction: [],
  ...overrides
});

const player = (townEconomy: TownEconomyEntry[], extraTech: string[] = []): StructurePlannerPlayer => ({
  id: "ai-1",
  points: 10_000,
  manpower: 10_000,
  techIds: ["trade", "pottery", "coinage", "ledger-keeping", "remade-concordat", ...extraTech],
  strategicResources: { FOOD: 1_000 },
  settledTileCount: 10,
  townCount: townEconomy.length,
  incomePerMinute: 20,
  townEconomy
});

// A town at (cx,cy) with one open SETTLED support tile to its west and the
// rest of its ring FRONTIER, so exactly one build site is available.
const townSite = (cx: number, cy: number, populationTier: "TOWN" | "METROPOLIS" = "TOWN"): StructurePlannerTile[] => {
  const ring: StructurePlannerTile[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      ring.push(tile(cx + dx, cy + dy, { ownerId: "ai-1", ownershipState: dx === -1 && dy === 0 ? "SETTLED" : "FRONTIER" }));
    }
  }
  return [tile(cx, cy, { ownerId: "ai-1", ownershipState: "SETTLED", town: { populationTier, supportCurrent: 0, supportMax: 8 } }), ...ring];
};

const plan = (p: StructurePlannerPlayer, tiles: StructurePlannerTile[], need: NeedVector = NEED) =>
  chooseBestEconomicBuild(p, tiles, new Map(tiles.map((t) => [`${t.x},${t.y}`, t] as const)), tiles, need);

describe("chooseBestEconomicBuild — economic synergy", () => {
  it("proposes a Clearing House once a town has two Manufactories", () => {
    const tiles = townSite(10, 10);
    const result = plan(player([entry("10,10", { manufactories: 2 })]), tiles);
    expect(result?.structureType).toBe("CLEARING_HOUSE");
  });

  it("does not propose a Trade Nexus in an isolated town, even with an acute coin need", () => {
    const tiles = townSite(10, 10);
    const result = plan(player([entry("10,10")]), tiles);
    expect(result?.structureType).toBe("MANUFACTORY");
  });

  it("proposes a Trade Nexus for a connected town with none in reach", () => {
    const tiles = townSite(10, 10);
    const result = plan(player([entry("10,10", { connectedTownCount: 1 })]), tiles);
    expect(result?.structureType).toBe("TRADE_NEXUS");
  });

  it("proposes Neural Works once two Ancillary Factories share a network", () => {
    const tiles = townSite(10, 10);
    const result = plan(
      player([entry("10,10", { hasAncillaryFactory: true, ancillaryFactoriesInReach: 2 })]),
      tiles,
      { ...NEED, GOLD: 0, MANPOWER_THROUGHPUT: 1 }
    );
    expect(result?.structureType).toBe("NEURAL_WORKS");
  });

  it("puts the Manufactory in the richer town", () => {
    const tiles = [...townSite(10, 10), ...townSite(30, 30, "METROPOLIS")];
    const result = plan(player([entry("10,10"), entry("30,30", { baseGoldWeight: 2.1 })]), tiles);
    expect(result?.structureType).toBe("MANUFACTORY");
    expect(`${result?.tile.x},${result?.tile.y}`).toBe("30,30");
  });

  it("holds back a Clearing House while one is still under construction in another town", () => {
    // The connected town's network entry only lists active Clearing Houses,
    // so without the empire-wide hold both towns would build one.
    const tiles = [...townSite(10, 10), ...townSite(30, 30)];
    const result = plan(
      player([entry("10,10", { manufactories: 2 }), entry("30,30", { amplifiersUnderConstruction: ["CLEARING_HOUSE"] })]),
      tiles
    );
    expect(result?.structureType).not.toBe("CLEARING_HOUSE");
  });

  it("reports the winning score for diagnostics", () => {
    const tiles = townSite(10, 10);
    expect(plan(player([entry("10,10", { connectedTownCount: 1 })]), tiles)?.score).toBeGreaterThan(54);
  });
});
