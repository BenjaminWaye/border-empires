import { describe, expect, it } from "vitest";

import { computeSeasonWinnerStats } from "./season-winner-stats.js";

describe("computeSeasonWinnerStats", () => {
  it("pulls production rates off the winner's player summary and sums population/monuments across their tiles only", () => {
    const runtimeState = {
      players: [
        {
          id: "player-1",
          incomePerMinute: 42,
          strategicProductionPerMinute: { FOOD: 10, IRON: 20, CRYSTAL: 3, SUPPLY: 7, SHARD: 0 }
        },
        {
          id: "player-2",
          incomePerMinute: 999,
          strategicProductionPerMinute: { FOOD: 999, IRON: 999, CRYSTAL: 999, SUPPLY: 999, SHARD: 0 }
        }
      ],
      tiles: [
        {
          x: 0,
          y: 0,
          ownerId: "player-1",
          townJson: JSON.stringify({ population: 100 }),
          economicStructureJson: JSON.stringify({ type: "WORLD_ENGINE", status: "active", ownerId: "player-1" })
        },
        {
          x: 1,
          y: 0,
          ownerId: "player-1",
          townJson: JSON.stringify({ population: 250 })
        },
        {
          // Another completed monument, same type, should accumulate the count.
          x: 2,
          y: 0,
          ownerId: "player-1",
          economicStructureJson: JSON.stringify({ type: "WORLD_ENGINE", status: "active", ownerId: "player-1" })
        },
        {
          // Still under construction — must not count.
          x: 3,
          y: 0,
          ownerId: "player-1",
          economicStructureJson: JSON.stringify({ type: "AEGIS_DOME", status: "under_construction", ownerId: "player-1" })
        },
        {
          // Not a monument at all.
          x: 4,
          y: 0,
          ownerId: "player-1",
          economicStructureJson: JSON.stringify({ type: "BANK", status: "active", ownerId: "player-1" })
        },
        {
          // Belongs to the other player — must be excluded entirely.
          x: 5,
          y: 0,
          ownerId: "player-2",
          townJson: JSON.stringify({ population: 10_000 }),
          economicStructureJson: JSON.stringify({ type: "IMPERIAL_EXCHANGE", status: "active", ownerId: "player-2" })
        }
      ]
    } as unknown as Parameters<typeof computeSeasonWinnerStats>[0];

    expect(computeSeasonWinnerStats(runtimeState, "player-1")).toEqual({
      ironPerMinute: 20,
      goldPerMinute: 42,
      supplyPerMinute: 7,
      foodPerMinute: 10,
      crystalPerMinute: 3,
      totalPopulation: 350,
      monumentalBuildings: { WORLD_ENGINE: 2 }
    });
  });

  it("returns zeroed stats when the winner has no player summary or tiles", () => {
    const runtimeState = { players: [], tiles: [] } as unknown as Parameters<typeof computeSeasonWinnerStats>[0];

    expect(computeSeasonWinnerStats(runtimeState, "ghost")).toEqual({
      ironPerMinute: 0,
      goldPerMinute: 0,
      supplyPerMinute: 0,
      foodPerMinute: 0,
      crystalPerMinute: 0,
      totalPopulation: 0,
      monumentalBuildings: {}
    });
  });

  it("skips tiles with malformed townJson/economicStructureJson instead of throwing", () => {
    const runtimeState = {
      players: [{ id: "player-1", incomePerMinute: 5, strategicProductionPerMinute: { FOOD: 1, IRON: 1, CRYSTAL: 1, SUPPLY: 1, SHARD: 0 } }],
      tiles: [
        { x: 0, y: 0, ownerId: "player-1", townJson: "{not valid json", economicStructureJson: "also not valid json" },
        { x: 1, y: 0, ownerId: "player-1", townJson: JSON.stringify({ population: 40 }) }
      ]
    } as unknown as Parameters<typeof computeSeasonWinnerStats>[0];

    expect(computeSeasonWinnerStats(runtimeState, "player-1")).toEqual({
      ironPerMinute: 1,
      goldPerMinute: 5,
      supplyPerMinute: 1,
      foodPerMinute: 1,
      crystalPerMinute: 1,
      totalPopulation: 40,
      monumentalBuildings: {}
    });
  });
});
