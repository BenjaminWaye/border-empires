/**
 * Regression tests for client-side yieldRate derivation:
 * 1. Tiles only carry a derived gold rate — resource/converter tiles no longer
 *    get an invented per-day strategic production (FOOD/TITANIUM/...) that the
 *    server retired in favour of slot-based supply.
 * 2. Income multiplier is not applied to enemy tiles (unit-level: multiplier=1 path)
 */

import { describe, expect, it } from "vitest";

import { deriveTileYieldRate, ensureTileYield } from "./yield-derivation.js";

describe("deriveTileYieldRate — no per-tile strategic production", () => {
  it("derives nothing for a bare resource tile (was FOOD 48/day before strategic yield retired)", () => {
    expect(deriveTileYieldRate({ resource: "FARM" } as Parameters<typeof deriveTileYieldRate>[0])).toBeUndefined();
  });

  it("derives nothing for an active converter tile with no town or dock", () => {
    const tile = { economicStructure: { type: "HIGH_YIELD_UMBRITE_WORKS", status: "active" } };
    expect(deriveTileYieldRate(tile as Parameters<typeof deriveTileYieldRate>[0])).toBeUndefined();
  });

  it("returns only a gold rate", () => {
    const rate = deriveTileYieldRate({ town: { goldPerMinute: 3, populationTier: "CITY" } });
    expect(rate).toEqual({ goldPerMinute: 3 });
  });
});

describe("deriveTileYieldRate — income multiplier (PR #440, Issue 1)", () => {
  // Expected values below rescaled for the gold rescope:
  // SETTLEMENT_BASE_GOLD_PER_MIN
  // and DOCK_INCOME_PER_MIN are now cut 288x, then rounded to 4dp
  // (roundPositive, yield-derivation.ts) same as before.
  it("produces correct yield with incomeMultiplier=1 (enemy-tile path)", () => {
    // Settlement fallback: (2/288) * 1.0 * 1.0 ≈ 0.0069
    const rate = deriveTileYieldRate(
      { town: { populationTier: "SETTLEMENT" } },
      1.0
    );
    expect(rate!.goldPerMinute).toBe(0.0069);
  });

  it("applies incomeMultiplier to settlement fallback gold for own tiles", () => {
    // Settlement fallback: (2/288) * 1.25 * 1.0 ≈ 0.0087
    const rate = deriveTileYieldRate(
      { town: { populationTier: "SETTLEMENT" } },
      1.25
    );
    expect(rate!.goldPerMinute).toBe(0.0087);
  });

  it("applies incomeMultiplier to dock gold for own tiles", () => {
    // Dock: (0.5/288) * 1.0 * 1.25 ≈ 0.0022
    const rate = deriveTileYieldRate(
      { dockId: "dock-abc" },
      1.25
    );
    expect(rate!.goldPerMinute).toBe(0.0022);
  });

  it("combines settlement fallback and dock gold with income multiplier", () => {
    // Settlement: (2/288) * 1.25 * 1.0 ≈ 0.0087
    // Dock: (0.5/288) * 1.0 * 1.25 ≈ 0.0022
    // Total: 0.0109
    const rate = deriveTileYieldRate(
      { town: { populationTier: "SETTLEMENT" }, dockId: "dock-abc" },
      1.25
    );
    expect(rate!.goldPerMinute).toBe(0.0109);
  });

  it("does not apply incomeMultiplier to persisted town.goldPerMinute", () => {
    // Persisted goldPerMinute already includes sim-computed bonuses
    const rate = deriveTileYieldRate(
      { town: { goldPerMinute: 100, populationTier: "CITY" } },
      2.0
    );
    expect(rate!.goldPerMinute).toBe(100);
  });

  it("suppresses visible yield while Siphon is active", () => {
    const rate = deriveTileYieldRate({
      town: { goldPerMinute: 4, populationTier: "CITY" },
      sabotage: { endsAt: Date.now() + 60_000, outputMultiplier: 0 }
    });
    expect(rate).toBeUndefined();
  });
});

describe("ensureTileYield", () => {
  it("sets only yieldRate on a bare tile — no stored-yield cap", () => {
    const tile = { town: { populationTier: "SETTLEMENT" as const } };
    const result = ensureTileYield(tile);
    expect((result as Record<string, unknown>).yieldRate).toBeDefined();
    expect((result as Record<string, unknown>).yieldCap).toBeUndefined();
  });

  it("does not recompute yieldRate if already present", () => {
    const existingRate = { goldPerMinute: 999 };
    const tile = { yieldRate: existingRate };
    const result = ensureTileYield(tile);
    expect(result.yieldRate).toBe(existingRate);
  });
});
