/**
 * Regression tests for PR #440 follow-up fixes and for
 * docs/plans/2026-07-06-radius-yield-delivery.md Phase 4/5:
 * 1. Advanced converter yields now use their own (higher) constants —
 *    matching the server-side fix in tile-yield-view.ts — instead of the
 *    basic constants the sim previously fell back to.
 * 2. MINE/CAMP apply STRUCTURE_OUTPUT_MULT (x1.5) locally too.
 * 3. Income multiplier is not applied to enemy tiles (unit-level: multiplier=1 path)
 */

import { describe, expect, it } from "vitest";

import { deriveTileYieldRate, ensureTileYield } from "./yield-derivation.js";

describe("deriveTileYieldRate — advanced converter parity with corrected server constants", () => {
  it("returns the advanced UMBRITE constant (21.6) for ADVANCED_UMBRITE_SYNTHESIZER, not the basic one (18)", () => {
    const rate = deriveTileYieldRate({
      economicStructure: { type: "ADVANCED_UMBRITE_SYNTHESIZER", status: "active" }
    });
    expect(rate).toBeDefined();
    expect(rate!.strategicPerDay.UMBRITE).toBe(21.6);
  });

  it("returns the advanced TITANIUM constant (21.6) for ADVANCED_TITANIUM_WORKS, not the basic one (18)", () => {
    const rate = deriveTileYieldRate({
      economicStructure: { type: "ADVANCED_TITANIUM_WORKS", status: "active" }
    });
    expect(rate).toBeDefined();
    expect(rate!.strategicPerDay.TITANIUM).toBe(21.6);
  });

  it("returns the advanced CRYSTAL constant (14.4) for ADVANCED_CRYSTAL_SYNTHESIZER, not the basic one (12)", () => {
    const rate = deriveTileYieldRate({
      economicStructure: { type: "ADVANCED_CRYSTAL_SYNTHESIZER", status: "active" }
    });
    expect(rate).toBeDefined();
    expect(rate!.strategicPerDay.CRYSTAL).toBe(14.4);
  });

  it("inactive advanced converter contributes no yield", () => {
    const rate = deriveTileYieldRate({
      economicStructure: { type: "ADVANCED_UMBRITE_SYNTHESIZER", status: "building" }
    });
    // No town, no resource, no dock, inactive converter → undefined
    expect(rate).toBeUndefined();
  });
});

describe("deriveTileYieldRate — MINE/UMBRITE_RIG output multiplier (Phase 5 local fallback fix)", () => {
  it("applies STRUCTURE_OUTPUT_MULT (x1.5) to base TITANIUM output for an active MINE: 60 -> 90/day", () => {
    const rate = deriveTileYieldRate({
      resource: "TITANIUM",
      economicStructure: { type: "MINE", status: "active" }
    });
    expect(rate).toBeDefined();
    expect(rate!.strategicPerDay.TITANIUM).toBe(90);
  });

  it("applies STRUCTURE_OUTPUT_MULT (x1.5) to base UMBRITE output for an active UMBRITE_RIG: 60 -> 90/day", () => {
    const rate = deriveTileYieldRate({
      resource: "UMBRITE",
      economicStructure: { type: "UMBRITE_RIG", status: "active" }
    });
    expect(rate).toBeDefined();
    expect(rate!.strategicPerDay.UMBRITE).toBe(90);
  });
});

describe("deriveTileYieldRate — income multiplier (PR #440, Issue 1)", () => {
  // Expected values below rescaled for the gold rescope
  // (docs/manpower-economy-rewrite-plan.md §6.1): SETTLEMENT_BASE_GOLD_PER_MIN
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
      resource: "GEMS",
      sabotage: { endsAt: Date.now() + 60_000, outputMultiplier: 0 }
    });
    expect(rate!.goldPerMinute).toBe(0);
    expect(rate!.strategicPerDay.CRYSTAL).toBeUndefined();
  });
});

describe("ensureTileYield", () => {
  it("sets yieldRate and yieldCap on a bare tile", () => {
    const tile = {
      town: { populationTier: "SETTLEMENT" as const },
      resource: "UMBRITE" as const
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
