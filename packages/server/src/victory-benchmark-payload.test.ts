import { describe, expect, it } from "vitest";

import { buildVictoryBenchmarkPayload } from "./victory-benchmark-payload.js";

describe("victory benchmark payload", () => {
  it("marks quarter-victory once any path crosses 25% progress", () => {
    const payload = buildVictoryBenchmarkPayload({
      at: 123,
      townsTarget: 12,
      settledTilesTarget: 120,
      economicIncomeTarget: 200,
      economyLeadMult: 1.33,
      totalIslands: 8,
      totalResourceCounts: { IRON: 6, WOOD: 10 },
      metrics: [
        {
          playerId: "ai-1",
          name: "AI One",
          isAi: true,
          controlledTowns: 3,
          settledTiles: 18,
          incomePerMinute: 42,
          controlledResources: { IRON: 2 },
          continentQualifiedCount: 1
        },
        {
          playerId: "ai-2",
          name: "AI Two",
          isAi: true,
          controlledTowns: 1,
          settledTiles: 10,
          incomePerMinute: 18,
          controlledResources: { WOOD: 1 },
          continentQualifiedCount: 0
        }
      ]
    });

    expect(payload.players[0]?.playerId).toBe("ai-1");
    expect(payload.players[0]?.strongestPathId).toBe("RESOURCE_MONOPOLY");
    expect(payload.players[0]?.quarterVictoryReached).toBe(true);
    expect(payload.players[0]?.progress.find((entry) => entry.id === "TOWN_CONTROL")?.progressRatio).toBe(0.25);
  });

  it("uses the strongest competing income when scoring economic progress", () => {
    const payload = buildVictoryBenchmarkPayload({
      at: 123,
      townsTarget: 10,
      settledTilesTarget: 100,
      economicIncomeTarget: 200,
      economyLeadMult: 1.33,
      totalIslands: 4,
      totalResourceCounts: { GEMS: 4 },
      metrics: [
        {
          playerId: "leader",
          name: "Leader",
          isAi: true,
          controlledTowns: 0,
          settledTiles: 0,
          incomePerMinute: 90,
          controlledResources: {},
          continentQualifiedCount: 0
        },
        {
          playerId: "runner",
          name: "Runner",
          isAi: true,
          controlledTowns: 0,
          settledTiles: 0,
          incomePerMinute: 80,
          controlledResources: {},
          continentQualifiedCount: 0
        }
      ]
    });

    const leaderEconomy = payload.players.find((entry) => entry.playerId === "leader")?.progress.find((entry) => entry.id === "ECONOMIC_HEGEMONY");
    expect(leaderEconomy?.requiredValue).toBe(200);
    expect(leaderEconomy?.progressRatio).toBeCloseTo(0.45, 4);

    const runnerEconomy = payload.players.find((entry) => entry.playerId === "runner")?.progress.find((entry) => entry.id === "ECONOMIC_HEGEMONY");
    expect(runnerEconomy?.requiredValue).toBe(200);
    expect(runnerEconomy?.progressRatio).toBeCloseTo(0.4, 4);
  });
});
