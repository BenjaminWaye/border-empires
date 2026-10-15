import { describe, expect, it } from "vitest";
import { buildTownSummary } from "./live-town-summary.js";
import { keyFor } from "./snapshot-tile-cache.js";

// Growth-rate tests for buildTownSummary, split from live-town-summary.test.ts
// (support-ring modifier coverage) to keep each file focused.
type FixtureTile = Record<string, unknown> & { x: number; y: number };

const townTile = (town: Record<string, unknown>): FixtureTile => ({
  x: 10,
  y: 10,
  terrain: "LAND",
  ownerId: "p1",
  ownershipState: "SETTLED",
  townType: "MARKET",
  townPopulationTier: "TOWN",
  townJson: JSON.stringify({ type: "MARKET", populationTier: "TOWN", population: 20_000, maxPopulation: 100_000, ...town })
});

const summarize = (tile: FixtureTile, nearbyWarTownKeys: ReadonlySet<string> = new Set()) =>
  buildTownSummary(
    tile as never,
    undefined,
    new Map([[keyFor(tile.x, tile.y), tile as never]]),
    new Set([keyFor(tile.x, tile.y)]),
    true,
    undefined,
    undefined,
    nearbyWarTownKeys
  );

describe("buildTownSummary — population growth rate", () => {
  // Regression: this path recomputed growth without the owner's
  // empire-integrity multiplier, so below 100% integrity the overview
  // disagreed with the population-growth tick (and flipped between the two
  // as tile deltas and tile-detail fetches alternated). The tick stamps the
  // rate it actually applied; a growing town must report that rate.
  it("reports the growth tick's applied rate for a growing town", () => {
    const summary = summarize(townTile({ populationGrowthPerMinute: 3.21 }));
    expect(summary?.populationGrowthPerMinute).toBe(3.21);
  });

  it("falls back to a recompute when the tick hasn't stamped a positive rate yet", () => {
    expect(summarize(townTile({}))?.populationGrowthPerMinute).toBeGreaterThan(0);
    expect(summarize(townTile({ populationGrowthPerMinute: 0 }))?.populationGrowthPerMinute).toBeGreaterThan(0);
  });

  // Regression: a nearby-war pause stops growth in the tick, but this path
  // still reported the full positive rate next to the "Nearby war" modifier.
  it("reports 0 growth with a Nearby war modifier while a nearby-war pause is active", () => {
    const tile = townTile({ populationGrowthPerMinute: 3.21, nearbyWarPausedUntil: Date.now() + 60_000, nearbyWarLastAt: Date.now() });
    const summary = summarize(tile, new Set([keyFor(tile.x, tile.y)]));
    expect(summary?.populationGrowthPerMinute).toBe(0);
    expect(summary?.growthModifiers).toEqual([expect.objectContaining({ label: "Nearby war" })]);
    expect(summary?.growthModifiers?.[0]?.deltaPerMinute).toBeLessThan(0);
  });
});
