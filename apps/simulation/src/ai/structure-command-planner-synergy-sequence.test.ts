import { describe, expect, it } from "vitest";

import type { EconomicStructureType } from "@border-empires/shared";
import type { NeedVector } from "./build/build-need-vector.js";
import { connectedTownBonusFor } from "./build/economic-synergy-scoring.js";
import type { TownEconomyEntry } from "./build/town-economy-view.js";
import { chooseBestEconomicBuild, type StructurePlannerPlayer, type StructurePlannerTile } from "./structure-command-planner.js";

// Scenario check for docs/ai-economic-synergy-plan.md: two connected towns,
// coin need, the techs for all three coin buildings. Each pick is applied to
// the map and the town-economy view (as the runtime would after the build
// completes) and the planner is asked again. The AI should assemble the whole
// engine — Trade Nexus, Clearing House and stacked Manufactories — without
// ever duplicating a one-per-neighbourhood amplifier.

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

const TOWNS = [{ x: 10, y: 10 }, { x: 20, y: 10 }];

const buildWorld = (): Map<string, StructurePlannerTile> => {
  const tiles = new Map<string, StructurePlannerTile>();
  for (const { x, y } of TOWNS) {
    tiles.set(`${x},${y}`, { x, y, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", town: { populationTier: "TOWN", supportCurrent: 0, supportMax: 8 } });
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx !== 0 || dy !== 0) tiles.set(`${x + dx},${y + dy}`, { x: x + dx, y: y + dy, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" });
      }
    }
  }
  return tiles;
};

const initialView = (): TownEconomyEntry[] =>
  TOWNS.map(({ x, y }) => ({
    townKey: `${x},${y}`,
    baseGoldWeight: 1,
    baseManpowerCap: 300,
    manufactories: 0,
    ancillaryDepots: 0,
    hasAncillaryFactory: false,
    connectedTownCount: 1,
    connectedTownBonus: 0,
    tradeNexusInReach: false,
    clearingHouseInReach: false,
    neuralWorksInReach: false,
    reserveLatticeInReach: false,
    ancillaryFactoriesInReach: 0,
    depotTownsInReach: 0,
    amplifiersUnderConstruction: []
  }));

// Places the structure on the town's first open ring tile, like the runtime's
// firstAvailableTownSupportTile, and updates the view the way the next
// town-network rebuild would.
const apply = (tiles: Map<string, StructurePlannerTile>, view: TownEconomyEntry[], townKey: string, type: EconomicStructureType): void => {
  const [tx, ty] = townKey.split(",").map(Number) as [number, number];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const key = `${tx + dx},${ty + dy}`;
      const ring = tiles.get(key);
      if ((dx === 0 && dy === 0) || !ring || ring.economicStructure) continue;
      tiles.set(key, { ...ring, economicStructure: { ownerId: "ai-1", type, status: "active" } });
      dx = 2;
      dy = 2;
    }
  }
  for (const town of view) {
    if (type === "MANUFACTORY" && town.townKey === townKey) town.manufactories += 1;
    if (type === "TRADE_NEXUS") {
      town.tradeNexusInReach = true;
      town.connectedTownBonus = connectedTownBonusFor(town.connectedTownCount);
    }
    if (type === "CLEARING_HOUSE") town.clearingHouseInReach = true;
  }
};

describe("economic synergy build sequence", () => {
  it("assembles Trade Nexus + Clearing House + stacked Manufactories across two connected towns", () => {
    const tiles = buildWorld();
    const view = initialView();
    const picks: EconomicStructureType[] = [];
    for (let step = 0; step < 8; step += 1) {
      const player: StructurePlannerPlayer = {
        id: "ai-1",
        points: 10_000,
        manpower: 10_000,
        techIds: ["trade", "coinage", "ledger-keeping"],
        strategicResources: { FOOD: 1_000 },
        settledTileCount: 18,
        townCount: 2,
        incomePerMinute: 1,
        townEconomy: view.map((entry) => ({ ...entry }))
      };
      const all = [...tiles.values()];
      const pick = chooseBestEconomicBuild(player, all, tiles, all, NEED);
      if (!pick) break;
      picks.push(pick.structureType);
      apply(tiles, view, `${pick.tile.x},${pick.tile.y}`, pick.structureType);
    }

    expect(picks[0]).toBe("TRADE_NEXUS");
    expect(picks.filter((type) => type === "TRADE_NEXUS")).toHaveLength(1);
    expect(picks.filter((type) => type === "CLEARING_HOUSE")).toHaveLength(1);
    expect(picks.filter((type) => type === "MANUFACTORY").length).toBeGreaterThanOrEqual(4);
    // The Clearing House comes once there are Manufactories for it to lift.
    expect(picks.indexOf("CLEARING_HOUSE")).toBeGreaterThan(picks.indexOf("MANUFACTORY"));
  });
});
