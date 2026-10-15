import { describe, expect, it } from "vitest";

import { snapshotTownGrowth, type SnapshotTownGrowthInput } from "./tile-detail-town-growth.js";

const NOW = 1_800_000_000_000;

const input = (town: Partial<NonNullable<SnapshotTownGrowthInput["parsedTown"]>>): SnapshotTownGrowthInput => ({
  parsedTown: { population: 20_000, maxPopulation: 100_000, ...town },
  isFed: true,
  populationTier: "TOWN",
  hasIncubationEngine: false,
  firstThreeTownPopGrowthMult: 1,
  nowMs: NOW
});

describe("snapshotTownGrowth", () => {
  // Regression: the tile-detail builder discarded the sim's rate and
  // recomputed one without empire integrity or long peace, so a tap showed a
  // different number than the growth tick's own deltas.
  it("trusts the growth tick's stamped rate", () => {
    expect(snapshotTownGrowth(input({ populationGrowthPerMinute: 3.21 })).populationGrowthPerMinute).toBe(3.21);
  });

  it("recomputes when no rate has been stamped yet", () => {
    expect(snapshotTownGrowth(input({})).populationGrowthPerMinute).toBeGreaterThan(0);
  });

  // Regression: during a nearby-war pause this path still reported positive
  // growth and fabricated a "Long time peace" modifier.
  it("reports 0 growth and a Nearby war modifier while a nearby-war pause is active", () => {
    const growth = snapshotTownGrowth(input({ populationGrowthPerMinute: 3.21, nearbyWarPausedUntil: NOW + 60_000, nearbyWarLastAt: NOW }));
    expect(growth.populationGrowthPerMinute).toBe(0);
    expect(growth.growthModifiers).toHaveLength(1);
    expect(growth.growthModifiers[0]?.label).toBe("Nearby war");
    expect(growth.growthModifiers[0]?.deltaPerMinute).toBeLessThan(0);
  });

  it("reports 0 growth and a Recently captured modifier during capture shock", () => {
    const growth = snapshotTownGrowth(input({ populationGrowthPerMinute: 3.21, captureShockUntil: NOW + 60_000 }));
    expect(growth.populationGrowthPerMinute).toBe(0);
    expect(growth.growthModifiers.map((modifier) => modifier.label)).toEqual(["Recently captured"]);
  });

  it("omits the long-peace modifier after a recent nearby war", () => {
    const growth = snapshotTownGrowth(input({ populationGrowthPerMinute: 3.21, nearbyWarPausedUntil: NOW - 1, nearbyWarLastAt: NOW - 60_000 }));
    expect(growth.populationGrowthPerMinute).toBe(3.21);
    expect(growth.growthModifiers).toEqual([]);
  });

  it("reports 0 growth with no modifiers for an unfed town", () => {
    expect(snapshotTownGrowth({ ...input({ populationGrowthPerMinute: 3.21 }), isFed: false })).toEqual({ populationGrowthPerMinute: 0, growthModifiers: [] });
  });
});
