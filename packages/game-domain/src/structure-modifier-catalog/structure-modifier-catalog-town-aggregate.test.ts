import { describe, expect, it } from "vitest";
import { townModifierTotalsFromCounts } from "./structure-modifier-catalog-town-aggregate.js";

describe("townModifierTotalsFromCounts", () => {
  it("groups a single building type under a '<count> <Building>' heading", () => {
    const groups = townModifierTotalsFromCounts({ GARRISON_HALL: 3 });
    expect(groups).toContainEqual({
      heading: "3 Garrison Halls",
      modifiers: [{ statLabel: "Manpower cap", valueText: "+450", tone: "positive" }]
    });
  });

  it("uses the singular label for a single active copy", () => {
    const groups = townModifierTotalsFromCounts({ LOGISTICS_GUILD: 1 });
    expect(groups).toContainEqual({
      heading: "1 Logistics Guild",
      modifiers: [{ statLabel: "Manpower/min empire-wide", valueText: "+0.05", tone: "positive" }]
    });
  });

  // Regression: Weapons Workshop, Titanium Weapons Factory, and Umbrite
  // Weapons Factory used to be merged into ONE combined "Empire attack" /
  // "Empire defense" total with no indication of which building(s) actually
  // contributed. Each building type now gets its own heading and its own
  // total instead.
  it("gives Weapons Workshop and Titanium Weapons Factory separate headings instead of merging their Empire attack totals", () => {
    const groups = townModifierTotalsFromCounts({ WEAPONS_WORKSHOP: 2, TITANIUM_WEAPONS_FACTORY: 1 });
    const workshop = groups.find((g) => g.heading === "2 Weapons Workshops");
    const factory = groups.find((g) => g.heading === "1 Titanium Weapons Factory");
    expect(workshop?.modifiers.find((m) => m.statLabel === "Empire attack")).toBeDefined();
    expect(factory?.modifiers.find((m) => m.statLabel === "Empire attack")).toBeDefined();
    expect(groups).toHaveLength(2);
  });

  it("stacks Mintworks nonlinearly (Clearing House aware) under one heading", () => {
    const groups = townModifierTotalsFromCounts({ MINTWORKS: 6 }, { clearingHouseActive: true });
    const mintworks = groups.find((g) => g.heading === "6 Mintworks");
    expect(mintworks?.modifiers).toContainEqual({ statLabel: "Gold production", valueText: "+210%", tone: "positive" });
  });

  it("omits a building type entirely when its count is 0", () => {
    const groups = townModifierTotalsFromCounts({ GARRISON_HALL: 0, MINTWORKS: 2 });
    expect(groups.some((g) => g.heading.includes("Garrison"))).toBe(false);
  });

  it("returns an empty array when no aggregate-eligible buildings are present", () => {
    expect(townModifierTotalsFromCounts({})).toEqual([]);
  });
});
