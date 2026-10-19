import { describe, expect, it } from "vitest";
import { structureModifiersFor } from "./structure-modifier-catalog.js";

describe("structureModifiersFor", () => {
  it("returns a static, context-free entry for a fixed-effect building (Hydrogarden)", () => {
    const modifiers = structureModifiersFor("HYDROGARDEN");
    expect(modifiers).toEqual([
      { statLabel: "FOOD slot", valueText: "+2", tone: "positive", isTownWide: false }
    ]);
    expect(modifiers.every((m) => m.isTownWide === false)).toBe(true);
  });

  it("falls back to a representative per-copy rate for Manufactory with no tile context", () => {
    const modifiers = structureModifiersFor("MANUFACTORY");
    const stacked = modifiers.find((m) => m.statLabel === "Coin production");
    expect(stacked?.valueText).toBe("+10% town coin production per Manufactory");
    expect(modifiers.every((m) => m.isTownWide === true)).toBe(true);
  });

  it("derives the real stacked percentage for Manufactory when tile context is supplied", () => {
    const modifiers = structureModifiersFor("MANUFACTORY", { tile: { town: { manufactoryCount: 3, clearingHouseActive: false } } });
    const stacked = modifiers.find((m) => m.statLabel === "Coin production");
    expect(stacked?.valueText).toBe("+30% town coin production");
  });

  it("boosts the stacked Manufactory percentage when a Clearing House is active", () => {
    const modifiers = structureModifiersFor("MANUFACTORY", { tile: { town: { manufactoryCount: 2, clearingHouseActive: true } } });
    const stacked = modifiers.find((m) => m.statLabel === "Coin production");
    expect(stacked?.valueText).toBe("+70% town coin production");
  });

  it("marks a sample of support-tile buildings as town-wide and tile-local buildings as not", () => {
    expect(structureModifiersFor("ANCILLARY_DEPOT").every((m) => m.isTownWide === true)).toBe(true);
    expect(structureModifiersFor("MANUFACTORY").every((m) => m.isTownWide === true)).toBe(true);
    expect(structureModifiersFor("FORT").every((m) => m.isTownWide === false)).toBe(true);
    expect(structureModifiersFor("OBSERVATORY").every((m) => m.isTownWide === false)).toBe(true);
    expect(structureModifiersFor("UMBRITE_RIG").every((m) => m.isTownWide === false)).toBe(true);
  });

  it("only carries rawValue on flat, additive-per-copy numbers", () => {
    const ancillaryDepot = structureModifiersFor("ANCILLARY_DEPOT");
    expect(ancillaryDepot[0]?.rawValue).toBe(150);
    const manufactory = structureModifiersFor("MANUFACTORY");
    const stackedPercent = manufactory.find((m) => m.statLabel === "Coin production");
    expect(stackedPercent?.rawValue).toBeUndefined();
  });

  it("returns an empty array for a monument component with no numeric effect", () => {
    expect(structureModifiersFor("CENSUS_DIRECTORATE_PART_1")).toEqual([]);
  });

  it("marks Weapons Workshop family attack/defense as percent-per-copy rawValue for town aggregation", () => {
    for (const type of ["WEAPONS_WORKSHOP", "TITANIUM_WEAPONS_FACTORY", "UMBRITE_WEAPONS_FACTORY"] as const) {
      const modifiers = structureModifiersFor(type);
      const attack = modifiers.find((m) => m.statLabel === "Empire attack");
      const defense = modifiers.find((m) => m.statLabel === "Empire defense");
      expect(typeof attack?.rawValue).toBe("number");
      expect(attack?.unit).toBe("percent");
      expect(typeof defense?.rawValue).toBe("number");
      expect(defense?.unit).toBe("percent");
    }
  });

  it("carries an already-aggregated rawValue for Manufactory gold production once a live count is supplied", () => {
    const modifiers = structureModifiersFor("MANUFACTORY", { tile: { town: { manufactoryCount: 3, clearingHouseActive: false } } });
    const stacked = modifiers.find((m) => m.statLabel === "Coin production");
    expect(stacked?.rawValue).toBe(30);
    expect(stacked?.unit).toBe("percent");
    expect(stacked?.alreadyAggregated).toBe(true);
  });

  // Relay Beacon is vision-only (no attack bonus); confirms the catalog
  // surfaces its vision bonus (RELAY_BEACON_VISION_BONUS) and nothing else.
  it("includes vision, and no offense, for Relay Beacon", () => {
    const modifiers = structureModifiersFor("RELAY_BEACON");
    expect(modifiers).toContainEqual({ statLabel: "Local vision", valueText: "+5", tone: "positive", isTownWide: false });
    expect(modifiers.some((m) => m.statLabel === "Offense")).toBe(false);
  });

  // Regression: a converter structure (Aether Condenser / AETHER_CONDENSER
  // etc.) in EXCHANGE (Sell Off) mode still showed "Refine mode supplies:
  // +1 CRYSTAL slot" -- synthesizerModifiers had no way to see the live
  // converterMode, so the Modifiers panel contradicted the structure's own
  // status line ("selling off its slot... No gold upkeep while selling off").
  it("shows the Refine-mode slot modifier only in SYNTHESIZE mode, and omits it in EXCHANGE mode", () => {
    const synth = structureModifiersFor("AETHER_CONDENSER", { tile: { converterMode: "SYNTHESIZE" } });
    expect(synth).toContainEqual({ statLabel: "Refine mode supplies", valueText: "+1 CRYSTAL slot", tone: "positive", isTownWide: false });

    const exchange = structureModifiersFor("AETHER_CONDENSER", { tile: { converterMode: "EXCHANGE" } });
    expect(exchange.find((m) => m.statLabel === "Refine mode supplies")).toBeUndefined();
  });

  // Regression: switching an Aether Condenser (or any converter) to Sell Off
  // (EXCHANGE) mode produced real gold (EXCHANGE_GOLD_PER_SLOT_PER_DAY,
  // player-update-economy.ts) but the Modifiers panel showed nothing at all
  // for it -- synthesizerModifiers returned [] for EXCHANGE mode instead of
  // surfacing the payout, so neither the structure's own tile nor the town
  // overview ever displayed a "gold production" line for Sell Off mode.
  it("shows a Sell Off gold modifier with the real per-day payout in EXCHANGE mode", () => {
    // rawValue (added for town-support attribution — see
    // townModifierTotalsFromCounts/CONVERTER_TOWN_MODIFIER_AGGREGATE_TYPES)
    // is the flat per-instance gold/day figure, matching the payout named in
    // valueText.
    expect(structureModifiersFor("AETHER_CONDENSER", { tile: { converterMode: "EXCHANGE" } }))
      .toContainEqual({ statLabel: "Sell Off coin", valueText: "+10/day", tone: "positive", isTownWide: true, rawValue: 10 });
    expect(structureModifiersFor("HIGH_YIELD_AETHER_CONDENSER", { tile: { converterMode: "EXCHANGE" } }))
      .toContainEqual({ statLabel: "Sell Off coin", valueText: "+15/day", tone: "positive", isTownWide: true, rawValue: 15 });
    expect(structureModifiersFor("TITANIUM_WORKS", { tile: { converterMode: "EXCHANGE" } }))
      .toContainEqual({ statLabel: "Sell Off coin", valueText: "+8/day", tone: "positive", isTownWide: true, rawValue: 8 });
    expect(structureModifiersFor("UMBRITE_WORKS", { tile: { converterMode: "EXCHANGE" } }))
      .toContainEqual({ statLabel: "Sell Off coin", valueText: "+8/day", tone: "positive", isTownWide: true, rawValue: 8 });
  });

  it("defaults to showing the Refine-mode slot modifier when no converterMode is supplied (back-compat)", () => {
    const modifiers = structureModifiersFor("UMBRITE_WORKS");
    expect(modifiers).toContainEqual({ statLabel: "Refine mode supplies", valueText: "+1 UMBRITE slot", tone: "positive", isTownWide: false });
  });
});
