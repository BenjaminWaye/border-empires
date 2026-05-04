import { describe, expect, it } from "vitest";

import { enrichSnapshotTilesForGlobalVisibility } from "./live-snapshot-view.js";

describe("enrichSnapshotTilesForGlobalVisibility", () => {
  it("does not expose owner-only town economy fields in shared full-visibility tiles", () => {
    const tiles = enrichSnapshotTilesForGlobalVisibility({
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "BlackFang",
            type: "MARKET",
            populationTier: "CITY",
            baseGoldPerMinute: 2,
            supportCurrent: 3,
            supportMax: 4,
            goldPerMinute: 5,
            cap: 20,
            isFed: true,
            population: 5,
            maxPopulation: 8,
            connectedTownCount: 1,
            connectedTownBonus: 0.2,
            hasMarket: true,
            marketActive: true,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          }),
          townType: "MARKET",
          townName: "BlackFang",
          townPopulationTier: "CITY"
        }
      ],
      players: [
        {
          id: "player-2",
          name: "BlackFang",
          points: 5,
          manpower: 3,
          techIds: [],
          domainIds: [],
          strategicResources: { FOOD: 10, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10"]
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    });

    const town = JSON.parse(String(tiles[0]?.townJson));
    expect(town.name).toBe("BlackFang");
    expect(town.type).toBe("MARKET");
    expect(town.populationTier).toBe("CITY");
    expect(town).not.toHaveProperty("isFed");
    expect(town).not.toHaveProperty("supportCurrent");
    expect(town).not.toHaveProperty("supportMax");
    expect(town).not.toHaveProperty("hasMarket");
    expect(town).not.toHaveProperty("goldPerMinute");
  });
});
