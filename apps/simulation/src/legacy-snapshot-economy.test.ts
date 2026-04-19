import { describe, expect, it } from "vitest";

import { buildLegacySnapshotPlayerEconomies } from "./legacy-snapshot-economy.js";

describe("buildLegacySnapshotPlayerEconomies", () => {
  it("derives strategic income from legacy daily resource rates instead of buffered tile yield", () => {
    const economies = buildLegacySnapshotPlayerEconomies({
      world: { width: 8, height: 8 },
      playersSection: {
        players: [
          {
            id: "player-1",
            name: "Tester",
            points: 0,
            manpower: 100,
            territoryTiles: ["1,1"],
            techIds: [],
            domainIds: [],
            allies: [],
            mods: { attack: 1, defense: 1, income: 1, vision: 1 }
          }
        ]
      },
      territory: {
        ownership: [["1,1", "player-1"]],
        ownershipState: [["1,1", "SETTLED"]],
        towns: [],
        docks: []
      },
      economy: {
        tileYield: [["1,1", { gold: 0, strategic: { IRON: 6 } }]]
      },
      systems: {
        economicStructures: [],
        observatories: []
      }
    });

    const playerEconomy = economies.get("player-1");
    expect(playerEconomy).toBeDefined();
    expect(playerEconomy?.strategicProductionPerMinute.IRON).toBeCloseTo(60 / 1440, 4);
    expect(playerEconomy?.economyBreakdown.IRON.sources[0]?.amountPerMinute).toBeCloseTo(60 / 1440, 4);
  });
});
