import { describe, expect, it, vi } from "vitest";

import { tileOverviewModifiersForTile } from "./client-tile-overview-modifiers.js";
import type { Tile } from "./client-types.js";

describe("tileOverviewModifiersForTile", () => {
  it("shows nearby war as a negative town growth modifier", () => {
    expect(
      tileOverviewModifiersForTile({
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
          hasMarket: false,
          marketActive: false,
          hasGranary: false,
          granaryActive: false,
          hasBank: false,
          bankActive: false,
          growthModifiers: [{ label: "Nearby war", deltaPerMinute: -12 }]
        }
      } satisfies Tile)
    ).toContainEqual({ reason: "Nearby war", effect: "-100% population growth", tone: "negative" });
  });

  it("hides fort defense while a captured fort is in recovery", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));

    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER",
      fort: {
        ownerId: "me",
        status: "active",
        disabledUntil: Date.now() + 60_000
      }
    } satisfies Tile);

    expect(modifiers.some((modifier) => modifier.reason === "Fort")).toBe(false);
    vi.useRealTimers();
  });
});
