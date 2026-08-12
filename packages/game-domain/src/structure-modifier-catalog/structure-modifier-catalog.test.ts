import { describe, expect, it } from "vitest";
import { structureModifiersFor } from "./structure-modifier-catalog.js";

describe("structureModifiersFor", () => {
  it("returns a static, context-free entry for a fixed-effect building (Farmstead)", () => {
    const modifiers = structureModifiersFor("FARMSTEAD");
    expect(modifiers).toEqual([
      { statLabel: "Farm food", valueText: "+50%", tone: "positive", isTownWide: false },
      { statLabel: "FOOD slot", valueText: "+1", tone: "positive", isTownWide: false }
    ]);
    expect(modifiers.every((m) => m.isTownWide === false)).toBe(true);
  });

  it("falls back to a representative per-copy rate for Mintworks with no tile context", () => {
    const modifiers = structureModifiersFor("MINTWORKS");
    const stacked = modifiers.find((m) => m.statLabel === "Gold production");
    expect(stacked?.valueText).toBe("+10% town gold production per Mintworks");
    expect(modifiers.every((m) => m.isTownWide === true)).toBe(true);
  });

  it("derives the real stacked percentage for Mintworks when tile context is supplied", () => {
    const modifiers = structureModifiersFor("MINTWORKS", { tile: { town: { mintworksCount: 3, clearingHouseActive: false } } });
    const stacked = modifiers.find((m) => m.statLabel === "Gold production");
    expect(stacked?.valueText).toBe("+30% town gold production");
  });

  it("boosts the stacked Mintworks percentage when a Clearing House is active", () => {
    const modifiers = structureModifiersFor("MINTWORKS", { tile: { town: { mintworksCount: 2, clearingHouseActive: true } } });
    const stacked = modifiers.find((m) => m.statLabel === "Gold production");
    expect(stacked?.valueText).toBe("+70% town gold production");
  });

  it("marks a sample of support-tile buildings as town-wide and tile-local buildings as not", () => {
    expect(structureModifiersFor("GARRISON_HALL").every((m) => m.isTownWide === true)).toBe(true);
    expect(structureModifiersFor("MINTWORKS").every((m) => m.isTownWide === true)).toBe(true);
    expect(structureModifiersFor("FORT").every((m) => m.isTownWide === false)).toBe(true);
    expect(structureModifiersFor("OBSERVATORY").every((m) => m.isTownWide === false)).toBe(true);
    expect(structureModifiersFor("UMBRITE_RIG").every((m) => m.isTownWide === false)).toBe(true);
  });

  it("only carries rawValue on flat, additive-per-copy numbers", () => {
    const garrisonHall = structureModifiersFor("GARRISON_HALL");
    expect(garrisonHall[0]?.rawValue).toBe(150);
    const mintworks = structureModifiersFor("MINTWORKS");
    const stackedPercent = mintworks.find((m) => m.statLabel === "Gold production");
    expect(stackedPercent?.rawValue).toBeUndefined();
  });

  it("returns an empty array for a monument component with no numeric effect", () => {
    expect(structureModifiersFor("POPULATION_BUREAU_PART_1")).toEqual([]);
  });
});
