import { describe, expect, it } from "vitest";

import { computePlayerGrowth, buildEconomyBoom, buildManpowerSurge, GROWTH_BASELINE_ROLL_INTERVAL_MS } from "./player-growth.js";
import { InMemoryPlayerGrowthBaselineStore } from "../player-growth-baseline-store/player-growth-baseline-store.js";

const nameFor = (id: string): string => `Name(${id})`;

const player = (overrides: Partial<{ id: string; incomePerMinute: number; manpowerCap: number }> = {}) => ({
  id: "p1",
  name: "Alice",
  tiles: 10,
  incomePerMinute: 5,
  techs: 1,
  manpowerCap: 1000,
  score: 100,
  rank: 1,
  ...overrides
});

describe("computePlayerGrowth", () => {
  it("returns no delta and seeds a baseline the first time a player is seen", async () => {
    const store = new InMemoryPlayerGrowthBaselineStore();
    const deltas = await computePlayerGrowth(store, [player()], nameFor, 1_000);
    expect(deltas).toEqual([]);
    expect(await store.get("p1")).toEqual({ playerId: "p1", incomePerMinute: 5, manpowerCap: 1000, recordedAt: 1_000 });
  });

  it("diffs against the stored baseline without rolling it forward before 24h has passed", async () => {
    const store = new InMemoryPlayerGrowthBaselineStore();
    await store.set({ playerId: "p1", incomePerMinute: 4, manpowerCap: 900, recordedAt: 0 });
    const almostADayLater = GROWTH_BASELINE_ROLL_INTERVAL_MS - 1;
    const deltas = await computePlayerGrowth(store, [player({ incomePerMinute: 5, manpowerCap: 1000 })], nameFor, almostADayLater);
    expect(deltas).toEqual([
      { playerId: "p1", playerName: "Name(p1)", incomePerMinute: 5, incomePerMinuteDelta: 1, manpowerCap: 1000, manpowerCapDelta: 100, baselineAt: 0 }
    ]);
    // Still diffing against the original baseline -- not rolled forward yet.
    expect(await store.get("p1")).toEqual({ playerId: "p1", incomePerMinute: 4, manpowerCap: 900, recordedAt: 0 });
  });

  it("rolls the baseline forward to today's values once 24h has passed, using the pre-roll baseline for this response's delta", async () => {
    const store = new InMemoryPlayerGrowthBaselineStore();
    await store.set({ playerId: "p1", incomePerMinute: 4, manpowerCap: 900, recordedAt: 0 });
    const deltas = await computePlayerGrowth(store, [player({ incomePerMinute: 5, manpowerCap: 1000 })], nameFor, GROWTH_BASELINE_ROLL_INTERVAL_MS);
    expect(deltas[0]!.incomePerMinuteDelta).toBe(1);
    expect(await store.get("p1")).toEqual({ playerId: "p1", incomePerMinute: 5, manpowerCap: 1000, recordedAt: GROWTH_BASELINE_ROLL_INTERVAL_MS });
  });
});

describe("buildEconomyBoom", () => {
  it("narrates the player with the largest positive income growth, converted to gold per day", () => {
    const event = buildEconomyBoom([
      { playerId: "p1", playerName: "Alice", incomePerMinute: 5, incomePerMinuteDelta: 0.1, manpowerCap: 1000, manpowerCapDelta: 0, baselineAt: 0 }
    ]);
    expect(event).toEqual({
      type: "ECONOMY_BOOM",
      headline: "Economy Boom",
      text: "Alice's economy is booming — gold income is up 144 per day since yesterday.",
      significance: 144,
      players: ["Alice"]
    });
  });

  it("returns nothing when nobody's income actually grew", () => {
    expect(
      buildEconomyBoom([{ playerId: "p1", playerName: "Alice", incomePerMinute: 5, incomePerMinuteDelta: -0.1, manpowerCap: 1000, manpowerCapDelta: 0, baselineAt: 0 }])
    ).toBeUndefined();
    expect(buildEconomyBoom([])).toBeUndefined();
  });
});

describe("buildManpowerSurge", () => {
  it("narrates the player whose manpower cap grew the most", () => {
    const event = buildManpowerSurge([
      { playerId: "p1", playerName: "Alice", incomePerMinute: 5, incomePerMinuteDelta: 0, manpowerCap: 1200, manpowerCapDelta: 320, baselineAt: 0 }
    ]);
    expect(event).toEqual({
      type: "MANPOWER_SURGE",
      headline: "Manpower Surge",
      text: "Alice's manpower cap has grown by 320 since yesterday.",
      significance: 320,
      players: ["Alice"]
    });
  });

  it("returns nothing when nobody's manpower cap actually grew", () => {
    expect(
      buildManpowerSurge([{ playerId: "p1", playerName: "Alice", incomePerMinute: 5, incomePerMinuteDelta: 0, manpowerCap: 900, manpowerCapDelta: -100, baselineAt: 0 }])
    ).toBeUndefined();
  });
});
