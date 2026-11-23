// The forecast's town rows come from the same server figures the town screen shows.
import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { forecastInputForState, manpowerFullInMs, townReadyForecast } from "./client-visit-forecast-state.js";

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
    expect(input.planned).toBe(0);
  });

  // Review of #2944: entries past the server's queue of 20 live in this browser only.
  it("splits a long queue into what the server holds and what is only planned here", () => {
    const developmentQueue = Array.from({ length: 35 }, (_, i) => ({ label: "Fort", tileKey: `${i},0`, x: i, y: 0 }));
    const input = forecastInputForState(state({ developmentQueue }), [], NOW);
    expect([input.queued, input.planned]).toEqual([20, 15]);
  });

  it("names a rival whose name has not arrived", () => {
    const input = forecastInputForState(state({ seasonVictory: [{ id: "TOWN_CONTROL", name: "Town Control", leaderPlayerId: "k", leaderName: "", conditionMet: true, holdRemainingSeconds: 60 }] }), [], NOW);
    expect(input.holds[0]?.holderName).toBe("A rival");
  });
});

// Review of #2944: after spending from a full pool the next batch is small, so "full at the next batch" was 4h early.
describe("time until manpower is full", () => {
  const WINDOW = 4 * 3_600_000;
  const pool = { manpower: 550, manpowerCap: 750, manpowerRegenPerMinute: 1 };

  it("uses the server's figure for the first batch and full windows after it", () => {
    // Room 200, the batch brings 60, the remaining 140 needs one more window of 240.
    expect(manpowerFullInMs(pool, NOW + 3_600_000, 60, NOW)).toBe(3_600_000 + WINDOW);
    // A batch that covers the room fills the pool when it lands, whatever the current rate.
    expect(manpowerFullInMs({ ...pool, manpowerRegenPerMinute: 0.1 }, NOW + 3_600_000, 450, NOW)).toBe(3_600_000);
    expect(manpowerFullInMs({ ...pool, manpower: 750 }, NOW + 3_600_000, 60, NOW)).toBe(0);
    expect(manpowerFullInMs({ ...pool, manpowerRegenPerMinute: 0 }, NOW + 3_600_000, 60, NOW)).toBeUndefined();
  });

  it("falls back to full batches when the server's figure is not current", () => {
    expect(manpowerFullInMs(pool, NOW + 3_600_000, undefined, NOW)).toBe(3_600_000);
  });
});
