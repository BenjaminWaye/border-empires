// The forecast's town rows come from the same server figures the town screen shows.
import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { forecastInputForState, townReadyForecast } from "./client-visit-forecast-state.js";

const NOW = 1_000_000;

const townTile = (town: Partial<NonNullable<Tile["town"]>>, extra: Partial<Tile> = {}): Tile => ({
  x: 4, y: 9, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
  town: {
    name: "Rivergate", populationTier: "TOWN", population: 40_000, maxPopulation: 10_000_000, populationGrowthPerMinute: 100, isFed: true,
    nextPopulationTierUpgrade: { targetTier: "CITY", requiredPopulation: 100_000, goldCost: 500, available: false },
    ...town
  },
  ...extra
} as Tile);

describe("town forecast rows", () => {
  it("estimates when a growing town reaches the population its next tier needs", () => {
    expect(townReadyForecast(townTile({}), "me", NOW)).toEqual({ name: "Rivergate", x: 4, y: 9, nextTier: "City", readyInMs: 600 * 60_000 });
  });

  it("promises nothing for a town that is ready already, paused, unfed, not garrisoned, a rival's, or a Settlement", () => {
    const upgrade = { targetTier: "CITY" as const, requiredPopulation: 100_000, goldCost: 500, available: true };
    expect(townReadyForecast(townTile({ nextPopulationTierUpgrade: upgrade }), "me", NOW)).toBeUndefined();
    expect(townReadyForecast(townTile({ populationGrowthPerMinute: 0 }), "me", NOW)).toBeUndefined();
    expect(townReadyForecast(townTile({ isFed: false }), "me", NOW)).toBeUndefined();
    expect(townReadyForecast(townTile({ nearbyWarPausedUntil: NOW + 60_000 }), "me", NOW)).toBeUndefined();
    expect(townReadyForecast(townTile({}, { ownershipState: "FRONTIER" }), "me", NOW)).toBeUndefined();
    expect(townReadyForecast(townTile({}, { ownerId: "konrad" }), "me", NOW)).toBeUndefined();
    const settlement = townTile({ populationTier: "SETTLEMENT" });
    delete settlement.town?.nextPopulationTierUpgrade;
    expect(townReadyForecast(settlement, "me", NOW)).toBeUndefined();
  });
});

describe("forecast input from client state", () => {
  const state = (extra: Record<string, unknown> = {}): Parameters<typeof forecastInputForState>[0] => ({
    me: "me", tiles: new Map(), settleProgressByTile: new Map(), developmentQueue: [], activeDevelopmentProcessCount: 0, developmentProcessLimit: 3,
    waypoint: [], manpower: 300, manpowerCap: 750, manpowerRegenPerMinute: 1, nextManpowerBatchAmount: undefined, nextManpowerBatchAmountAt: undefined,
    seasonVictory: [], activeTruces: [], ...extra
  } as unknown as Parameters<typeof forecastInputForState>[0]);

  it("reads manpower, expansions, running holds and live truces", () => {
    const input = forecastInputForState(state({
      waypoint: [{ target: { x: 1, y: 1 }, pausedForManpower: true }, { target: { x: 2, y: 2 } }],
      seasonVictory: [
        { id: "TOWN_CONTROL", name: "Town Control", leaderPlayerId: "konrad", leaderName: "Konrad", conditionMet: true, holdRemainingSeconds: 3_600 },
        { id: "MARITIME_SUPREMACY", name: "Maritime Supremacy", leaderPlayerId: "me", leaderName: "Me", conditionMet: false, holdRemainingSeconds: 86_400 },
        { id: "RESOURCE_MONOPOLY", name: "Resource Monopoly", leaderPlayerId: "me", leaderName: "Me", conditionMet: true }
      ],
      activeTruces: [{ otherPlayerId: "kara", otherPlayerName: "Kara", startedAt: 0, endsAt: NOW + 7_200_000, createdByPlayerId: "me" }, { otherPlayerId: "old", otherPlayerName: "Old", startedAt: 0, endsAt: NOW - 1, createdByPlayerId: "me" }]
    }), [townTile({})], NOW);
    expect(input.expansions).toEqual({ total: 2, paused: 1 });
    expect(input.holds).toEqual([{ pathName: "Town Control", holderName: "Konrad", mine: false, remainingMs: 3_600_000 }]);
    expect(input.truces).toEqual([{ name: "Kara", endsInMs: 7_200_000 }]);
    expect(input.towns.map((town) => town.name)).toEqual(["Rivergate"]);
    // 450 short at 240 per 4h batch is two batches: the next one, plus one full window.
    expect(input.manpower.current).toBe(300);
    expect(input.manpower.nextBatchInMs).toBeGreaterThan(0);
    expect(input.manpower.fullInMs).toBe((input.manpower.nextBatchInMs ?? 0) + 4 * 3_600_000);
    expect(input.manpower.nextBatchGain).toBeUndefined();
  });

  it("counts garrisons in progress and queued work", () => {
    const input = forecastInputForState(state({
      settleProgressByTile: new Map([["3,3", { startAt: Date.now() - 1_000, resolvesAt: Date.now() + 60_000, target: { x: 3, y: 3 } }]]),
      developmentQueue: [{ label: "Fort", tileKey: "5,5", x: 5, y: 5 }, { label: "Garrison", tileKey: "6,6", x: 6, y: 6 }]
    }), [], NOW);
    expect(input.active.map((slot) => [slot.label, slot.x, slot.y])).toEqual([["Garrisoning", 3, 3]]);
    expect(input.queued).toBe(2);
  });
});
