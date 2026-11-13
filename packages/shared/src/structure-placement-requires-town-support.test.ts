import { describe, expect, it } from "vitest";
import { isTownSupportPlacementStructure, structureRequiresTownOrSupportTile } from "./structure-placement.js";

describe("structureRequiresTownOrSupportTile", () => {
  it("is true for one-per-town support-ring structures", () => {
    expect(structureRequiresTownOrSupportTile("TRADE_NEXUS")).toBe(true);
    for (const type of ["TITANIUM_SMELTER", "UMBRITE_DISTILLERY", "CRYSTAL_CUTTER"] as const) {
      expect(structureRequiresTownOrSupportTile(type)).toBe(true);
      expect(isTownSupportPlacementStructure(type)).toBe(true);
    }
    expect(structureRequiresTownOrSupportTile("INCUBATION_ENGINE")).toBe(true);
  });

  // Manufactory / Ancillary Depot / the two Weapons Factories are placementMode
  // "same_tile" so they can stack per town, but are still support-ring-only.
  it("is true for stacking same_tile structures that are still support-ring-only", () => {
    for (const type of ["MANUFACTORY", "ANCILLARY_DEPOT", "TITANIUM_WEAPONS_FACTORY", "UMBRITE_WEAPONS_FACTORY", "TITANIUM_REFINERY", "UMBRITE_REFINERY", "CRYSTAL_REFINERY"] as const) {
      expect(isTownSupportPlacementStructure(type)).toBe(false);
      expect(structureRequiresTownOrSupportTile(type)).toBe(true);
    }
  });

  it("is false for structures buildable on any owned settled tile", () => {
    for (const type of ["OBSERVATORY", "RELAY_BEACON", "HYDROWORKS", "SKY_DOCK", "MINISTRY_HALL"] as const) {
      expect(structureRequiresTownOrSupportTile(type)).toBe(false);
    }
  });

  it("is false for resource-tile structures", () => {
    for (const type of ["CULTIVATION_ESTATE", "RECLAMATION_WORKS"] as const)
      expect(structureRequiresTownOrSupportTile(type)).toBe(false);
  });
});
