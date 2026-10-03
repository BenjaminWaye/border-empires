import { describe, expect, it } from "vitest";
import { isTownSupportPlacementStructure, structureRequiresTownOrSupportTile } from "./structure-placement.js";

describe("structureRequiresTownOrSupportTile", () => {
  it("is true for one-per-town support-ring structures", () => {
    expect(structureRequiresTownOrSupportTile("CARAVANARY")).toBe(true);
    expect(structureRequiresTownOrSupportTile("GRANARY")).toBe(true);
  });

  // Mintworks / Garrison Hall / the two Weapons Factories are placementMode
  // "same_tile" so they can stack per town, but are still support-ring-only.
  it("is true for stacking same_tile structures that are still support-ring-only", () => {
    for (const type of ["MINTWORKS", "GARRISON_HALL", "TITANIUM_WEAPONS_FACTORY", "UMBRITE_WEAPONS_FACTORY"] as const) {
      expect(isTownSupportPlacementStructure(type)).toBe(false);
      expect(structureRequiresTownOrSupportTile(type)).toBe(true);
    }
  });

  it("is false for structures buildable on any owned settled tile", () => {
    for (const type of ["OBSERVATORY", "RELAY_BEACON", "WATERWORKS", "AIRPORT", "FOUNDRY", "GOVERNORS_OFFICE"] as const) {
      expect(structureRequiresTownOrSupportTile(type)).toBe(false);
    }
  });

  it("is false for resource-tile structures", () => {
    expect(structureRequiresTownOrSupportTile("MINE")).toBe(false);
  });
});
