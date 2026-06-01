/**
 * Regression tests for PR #440 follow-up fixes:
 * 1. Advanced converter yields match sim's current behavior (basic constants)
 * 2. Income multiplier is not applied to enemy tiles (unit-level: multiplier=1 path)
 */

import { describe, expect, it } from "vitest";

import { deriveTileYieldRate, ensureTileYield } from "./yield-derivation.js";

describe("deriveTileYieldRate — advanced converter parity (PR #440, Issue 2)", () => {
  it("returns basic SUPPLY=18 for ADVANCED_FUR_SYNTHESIZER to match sim's current behavior", () => {
    const rate = deriveTileYieldRate({
      economicStructure: { type: "ADVANCED_FUR_SYNTHESIZER", status: "active" }
    });
    expect(rate).toBeDefined();
    expect(rate!.strategicPerDay.SUPPLY).toBe(18);
  });

  it("returns basic IRON=18 for ADVANCED_IRONWORKS to match sim's current behavior", () => {
    const rate = deriveTileYieldRate({
      economicStructure: { type: "ADVANCED_IRONWORKS", status: "active" }
    });
    expect(rate).toBeDefined();
    expect(rate!.strategicPerDay.IRON).toBe(18);
  });

  it("returns basic CRYSTAL=12 for ADVANCED_CRYSTAL_SYNTHESIZER to match sim's current behavior", () => {
    const rate = deriveTileYieldRate({
      economicStructure: { type: "ADVANCED_CRYSTAL_SYNTHESIZER", status: "active" }
    });
    expect(rate).toBeDefined();
    expect(rate!.strategicPerDay.CRYSTAL).toBe(12);
  });

  it("inactive advanced converter contributes no yield", () => {
    const rate = deriveTileYieldRate({
      economicStructure: { type: "ADVANCED_FUR_SYNTHESIZER", status: "building" }
    });
    // No town, no resource, no dock, inactive converter → undefined
    expect(rate).toBeUndefined();
  });
});

describe("deriveTileYieldRate — income multiplier (PR #440, Issue 1)", () => {
  it("produces correct yield with incomeMultiplier=1 (enemy-tile path)", () => {
    // Settlement fallback: 1 * 1.0 * 1.0 = 1.0
    const rate = deriveTileYieldRate(
      { town: { populationTier: "SETTLEMENT" } },
      1.0
    );
    expect(rate!.goldPerMinute).toBe(1.0);
  });

  it("applies incomeMultiplier to settlement fallback gold for own tiles", () => {
    // Settlement fallback: 1 * 1.25 * 1.0 = 1.25
    const rate = deriveTileYieldRate(
      { town: { populationTier: "SETTLEMENT" } },
      1.25
    );
    expect(rate!.goldPerMinute).toBe(1.25);
  });

  it("applies incomeMultiplier to dock gold for own tiles", () => {
    // Dock: 0.5 * 1.0 * 1.25 = 0.625
    const rate = deriveTileYieldRate(
      { dockId: "dock-abc" },
      1.25
    );
    expect(rate!.goldPerMinute).toBe(0.625);
  });

  it("combines settlement fallback and dock gold with income multiplier", () => {
    // Settlement: 1 * 1.25 * 1.0 = 1.25
    // Dock: 0.5 * 1.0 * 1.25 = 0.625
    // Total: 1.875
    const rate = deriveTileYieldRate(
      { town: { populationTier: "SETTLEMENT" }, dockId: "dock-abc" },
      1.25
    );
    expect(rate!.goldPerMinute).toBe(1.875);
  });

  it("does not apply incomeMultiplier to persisted town.goldPerMinute", () => {
    // Persisted goldPerMinute already includes sim-computed bonuses
    const rate = deriveTileYieldRate(
      { town: { goldPerMinute: 100, populationTier: "CITY" } },
      2.0
    );
    expect(rate!.goldPerMinute).toBe(100);
  });
});

describe("ensureTileYield", () => {
  it("sets yieldRate and yieldCap on a bare tile", () => {
    const tile = {
      town: { populationTier: "SETTLEMENT" as const },
      resource: "FUR" as const
    };
    const result = ensureTileYield(tile);
    expect((result as Record<string, unknown>).yieldRate).toBeDefined();
    expect((result as Record<string, unknown>).yieldCap).toBeDefined();
    expect((result as Record<string, unknown>).yieldRate).toBeDefined();
  });

  it("does not recompute yieldRate if already present", () => {
    const existingRate = { goldPerMinute: 999, strategicPerDay: {} };
    const tile = { yieldRate: existingRate };
    const result = ensureTileYield(tile);
    expect(result.yieldRate).toBe(existingRate);
  });
});
