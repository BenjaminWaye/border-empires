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

  it("shows the active fort defense modifier from the real fort multiplier", () => {
    expect(
      tileOverviewModifiersForTile({
        x: 10,
        y: 12,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "FRONTIER",
        fort: {
          ownerId: "me",
          status: "active",
          variant: "FORT"
        }
      } satisfies Tile)
    ).toContainEqual({ reason: "Fort", effect: "2.5x defense", tone: "positive" });
  });

  it("labels upgraded fort defense modifiers by variant", () => {
    expect(
      tileOverviewModifiersForTile({
        x: 10,
        y: 12,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "FRONTIER",
        fort: {
          ownerId: "me",
          status: "active",
          variant: "IRON_BASTION"
        }
      } satisfies Tile)
    ).toContainEqual({ reason: "Iron Bastion", effect: "4x defense", tone: "positive" });

    expect(
      tileOverviewModifiersForTile({
        x: 10,
        y: 12,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "FRONTIER",
        fort: {
          ownerId: "me",
          status: "active",
          variant: "THUNDER_BASTION"
        }
      } satisfies Tile)
    ).toContainEqual({ reason: "Thunder Bastion", effect: "8x defense", tone: "positive" });
  });

  it("shows recently captured frontier towns as paused until settled", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));

    expect(
      tileOverviewModifiersForTile({
        x: 10,
        y: 12,
        terrain: "LAND",
        ownerId: "ai-1",
        ownershipState: "FRONTIER",
        town: {
          type: "MARKET",
          baseGoldPerMinute: 2,
          supportCurrent: 0,
          supportMax: 0,
          goldPerMinute: 0,
          cap: 0,
          isFed: false,
          population: 12_000,
          maxPopulation: 100_000,
          populationGrowthPerMinute: 0,
          populationTier: "TOWN",
          connectedTownCount: 0,
          connectedTownBonus: 0,
          hasMarket: false,
          marketActive: false,
          hasGranary: false,
          granaryActive: false,
          hasBank: false,
          bankActive: false,
          captureShockUntil: Date.now() + 60_000
        }
      } satisfies Tile)
    ).toContainEqual({
      reason: "Recently captured",
      effect: "town manpower and production paused until settled",
      tone: "negative"
    });

    vi.useRealTimers();
  });

  it("shows recently captured settled towns even when growth is already zero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));

    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        type: "MARKET",
        baseGoldPerMinute: 2,
        supportCurrent: 5,
        supportMax: 5,
        goldPerMinute: 12,
        cap: 300,
        isFed: true,
        population: 100_000,
        maxPopulation: 100_000,
        populationGrowthPerMinute: 0,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMarket: false,
        marketActive: false,
        hasGranary: false,
        granaryActive: false,
        hasBank: false,
        bankActive: false,
        captureShockUntil: Date.now() + 60_000,
        growthModifiers: [
          { label: "Recently captured", deltaPerMinute: 0 },
          { label: "Long time peace", deltaPerMinute: 12 }
        ]
      }
    } satisfies Tile);

    expect(modifiers).toContainEqual({
      reason: "Recently captured",
      effect: "population growth paused",
      tone: "negative"
    });
    expect(modifiers.filter((modifier) => modifier.reason === "Recently captured")).toHaveLength(1);

    vi.useRealTimers();
  });

  it("does not show long-term peace while capture shock is active", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));

    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        type: "MARKET",
        baseGoldPerMinute: 2,
        supportCurrent: 5,
        supportMax: 5,
        goldPerMinute: 12,
        cap: 300,
        isFed: true,
        population: 25_000,
        maxPopulation: 100_000,
        populationGrowthPerMinute: 0,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMarket: false,
        marketActive: false,
        hasGranary: false,
        granaryActive: false,
        hasBank: false,
        bankActive: false,
        captureShockUntil: Date.now() + 60_000,
        growthModifiers: [{ label: "Long time peace", deltaPerMinute: 12 }]
      }
    } satisfies Tile);

    expect(modifiers).toContainEqual({
      reason: "Recently captured",
      effect: "population growth paused",
      tone: "negative"
    });
    expect(modifiers.some((modifier) => modifier.reason === "Long-term peace")).toBe(false);

    vi.useRealTimers();
  });

  it("does not show nearby war while capture shock is active", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));

    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: {
        type: "MARKET",
        baseGoldPerMinute: 2,
        supportCurrent: 5,
        supportMax: 5,
        goldPerMinute: 12,
        cap: 300,
        isFed: true,
        population: 25_000,
        maxPopulation: 100_000,
        populationGrowthPerMinute: 0,
        populationTier: "TOWN",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMarket: false,
        marketActive: false,
        hasGranary: false,
        granaryActive: false,
        hasBank: false,
        bankActive: false,
        captureShockUntil: Date.now() + 60_000,
        growthModifiers: [{ label: "Nearby war", deltaPerMinute: -12 }]
      }
    } satisfies Tile);

    expect(modifiers).toContainEqual({
      reason: "Recently captured",
      effect: "population growth paused",
      tone: "negative"
    });
    expect(modifiers.some((modifier) => modifier.reason === "Nearby war")).toBe(false);

    vi.useRealTimers();
  });
});
