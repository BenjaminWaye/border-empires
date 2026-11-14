import { describe, expect, it, vi } from "vitest";
import { setWorldSeed } from "@border-empires/shared";

import { tileOverviewModifiersForTile } from "./client-tile-overview-modifiers.js";
import type { Tile } from "../client-types.js";

// A real hills tile (isHillsTileAt true) under seed 1 — same known-good
// coordinate used by apps/simulation/src/vision-footprint-table.test.ts.
// Keep both files' coordinate in sync if this moves again.
const KNOWN_HILLS_TILE = { x: 100, y: 150 };

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
          hasManufactory: false,
          manufactoryActive: false,
          hasIncubationEngine: false,
          incubationEngineActive: false,
          growthModifiers: [{ label: "Nearby war", deltaPerMinute: -12 }]
        }
      } satisfies Tile)
    ).toContainEqual({ reason: "Nearby war", effect: "-100% population growth", tone: "negative" });
  });

  // Regression test: this used to recompute a Manufactory "Gold production"
  // line here from tile.town.manufactoryCount, which duplicated the identical
  // stat already shown from tile.town.townModifierTotals (the single source
  // of truth for town-wide aggregates — see menuOverviewForTile in
  // client-tile-menu-view.ts) whenever a town's own tile was clicked. Any
  // active Manufactory must produce exactly one "Gold production" line, and it
  // must come from townModifierTotals, not from here.
  it("does not derive a Manufactory Gold production line from manufactoryCount (would duplicate townModifierTotals)", () => {
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
        hasManufactory: true,
        manufactoryActive: true,
        manufactoryCount: 5,
        hasIncubationEngine: false,
        incubationEngineActive: false
      }
    } satisfies Tile);
    expect(modifiers.some((m) => m.reason === "Coin production" || m.reason.includes("Coin production"))).toBe(false);
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

    expect(modifiers.some((modifier) => modifier.reason === "Defense")).toBe(false);
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
    ).toContainEqual({ reason: "Defense", effect: "2.5x", tone: "positive" });
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
          variant: "TITANIUM_BASTION"
        }
      } satisfies Tile)
    ).toContainEqual({ reason: "Defense", effect: "4x", tone: "positive" });

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
    ).toContainEqual({ reason: "Defense", effect: "6.5x", tone: "positive" });
  });

  it("shows recently captured frontier towns as paused until garrisoned", () => {
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
          hasManufactory: false,
          manufactoryActive: false,
          hasIncubationEngine: false,
          incubationEngineActive: false,
          captureShockUntil: Date.now() + 60_000
        }
      } satisfies Tile)
    ).toContainEqual({
      reason: "Recently captured",
      effect: "town manpower and production paused until garrisoned",
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
        hasManufactory: false,
        manufactoryActive: false,
        hasIncubationEngine: false,
        incubationEngineActive: false,
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
        hasManufactory: false,
        manufactoryActive: false,
        hasIncubationEngine: false,
        incubationEngineActive: false,
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
        hasManufactory: false,
        manufactoryActive: false,
        hasIncubationEngine: false,
        incubationEngineActive: false,
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

  it("shows a plain 'Vision' modifier for a real hills tile with no other modifier to disambiguate from", () => {
    setWorldSeed(1);
    const modifiers = tileOverviewModifiersForTile({
      x: KNOWN_HILLS_TILE.x,
      y: KNOWN_HILLS_TILE.y,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER"
    } satisfies Tile);
    expect(modifiers).toContainEqual({ reason: "Vision", effect: "+1", tone: "positive" });
    expect(modifiers).toContainEqual({ reason: "Defense", effect: "+20% when garrisoned", tone: "positive" });
    expect(modifiers.some((m) => m.reason === "Hills")).toBe(false);
  });

  // Regression: a bare hills tile shows an unlabeled "Vision: +1" line
  // (nothing else to disambiguate from), but once the tile already has
  // another modifier — e.g. a Relay Beacon's own vision line — the hills
  // contribution is named "Hills:" so the two vision lines aren't confused
  // for each other.
  it("names 'Hills' as the source when the tile already has another modifier", () => {
    setWorldSeed(1);
    const modifiers = tileOverviewModifiersForTile({
      x: KNOWN_HILLS_TILE.x,
      y: KNOWN_HILLS_TILE.y,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
    } satisfies Tile);
    expect(modifiers).toContainEqual({ reason: "Relay Beacon — Local vision", effect: "+5", tone: "positive" });
    expect(modifiers).toContainEqual({ reason: "Hills", effect: "vision +1", tone: "positive" });
    expect(modifiers.some((m) => m.reason === "Vision")).toBe(false);
    expect(modifiers).toContainEqual({ reason: "Hills", effect: "defense +20% when garrisoned", tone: "positive" });
  });

  it("does not show a Hills modifier for a non-hills land tile", () => {
    setWorldSeed(1);
    const modifiers = tileOverviewModifiersForTile({
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER"
    } satisfies Tile);
    expect(modifiers.some((m) => m.reason === "Hills")).toBe(false);
    expect(modifiers.some((m) => m.reason === "Vision")).toBe(false);
  });
});
