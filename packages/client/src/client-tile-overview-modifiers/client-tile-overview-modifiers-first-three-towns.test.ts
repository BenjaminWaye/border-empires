import { describe, expect, it } from "vitest";

import { tileOverviewModifiersForTile } from "./client-tile-overview-modifiers.js";
import type { Tile } from "../client-types.js";

// Regression: Mercantile Charter's firstThreeTownGoldMult/
// firstThreeTownPopGrowthMult were already folded into a town's
// goldPerMinute/populationGrowthPerMinute, but never shown as a modifier
// line — a player who bought the domain had no way to see it was doing
// anything to their first three towns. Split out of
// client-tile-overview-modifiers.test.ts to keep that file under the
// repo's 500-line cap.
describe("tileOverviewModifiersForTile — first-three-towns (Mercantile Charter)", () => {
  it("shows a 'Mercantile Charter' line for gold and population growth when the wire carries the Mercantile Charter multipliers", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        type: "MARKET",
        baseGoldPerMinute: 2,
        supportCurrent: 8,
        supportMax: 8,
        goldPerMinute: 18,
        cap: 300,
        isFed: true,
        population: 18_400,
        maxPopulation: 100_000,
        populationGrowthPerMinute: 15,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
        firstThreeTownGoldMult: 1.5,
        firstThreeTownPopGrowthMult: 1.25
      }
    } satisfies Tile);
    expect(modifiers).toContainEqual({ reason: "Mercantile Charter", effect: "+50% gold production", tone: "positive" });
    expect(modifiers).toContainEqual({ reason: "Mercantile Charter", effect: "+25% population growth", tone: "positive" });
  });

  it("shows no 'Mercantile Charter' line when the wire carries no Mercantile Charter multipliers", () => {
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        type: "MARKET",
        baseGoldPerMinute: 2,
        supportCurrent: 8,
        supportMax: 8,
        goldPerMinute: 12,
        cap: 300,
        isFed: true,
        population: 18_400,
        maxPopulation: 100_000,
        populationGrowthPerMinute: 12,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false
      }
    } satisfies Tile);
    expect(modifiers.some((m) => m.reason === "Mercantile Charter")).toBe(false);
  });
});
