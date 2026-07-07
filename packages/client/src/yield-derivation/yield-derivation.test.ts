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
  it("returns the advanced SUPPLY constant (21.6) for ADVANCED_FUR_SYNTHESIZER, not the basic one (18)", () => {
    const rate = deriveTileYieldRate({
      economicStructure: { type: "ADVANCED_FUR_SYNTHESIZER", status: "active" }
    });
    expect(rate).toBeDefined();
    expect(rate!.strategicPerDay.SUPPLY).toBe(21.6);
  });

  it("returns the advanced IRON constant (21.6) for ADVANCED_IRONWORKS, not the basic one (18)", () => {
    const rate = deriveTileYieldRate({
      economicStructure: { type: "ADVANCED_IRONWORKS", status: "active" }
    });
    expect(rate).toBeDefined();
    expect(rate!.strategicPerDay.IRON).toBe(21.6);
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
      economicStructure: { type: "ADVANCED_FUR_SYNTHESIZER", status: "building" }
    });
    // No town, no resource, no dock, inactive converter → undefined
    expect(rate).toBeUndefined();
  });
});

describe("deriveTileYieldRate — MINE/CAMP output multiplier (Phase 5 local fallback fix)", () => {
  it("applies STRUCTURE_OUTPUT_MULT (x1.5) to base IRON output for an active MINE: 60 -> 90/day", () => {
    const rate = deriveTileYieldRate({
      resource: "IRON",
      economicStructure: { type: "MINE", status: "active" }
    });
    expect(rate).toBeDefined();
    expect(rate!.strategicPerDay.IRON).toBe(90);
  });

  it("applies STRUCTURE_OUTPUT_MULT (x1.5) to base SUPPLY output for an active CAMP: 60 -> 90/day", () => {
    const rate = deriveTileYieldRate({
      resource: "WOOD",
      economicStructure: { type: "CAMP", status: "active" }
    });
    expect(rate).toBeDefined();
    expect(rate!.strategicPerDay.SUPPLY).toBe(90);
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
