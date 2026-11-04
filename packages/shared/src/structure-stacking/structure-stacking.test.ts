import { describe, expect, it } from "vitest";

import { structurePlacementMetadata } from "../structure-placement.js";
import {
  STACKING_SAME_TILE_SUPPORT_STRUCTURE_TYPES,
  STACKING_TOWN_SUPPORT_STRUCTURE_TYPES,
  structureStacksPerTown
} from "./structure-stacking.js";

describe("structureStacksPerTown", () => {
  it("treats the per-town stacking economy buildings as stacking", () => {
    for (const type of ["MANUFACTORY", "ANCILLARY_DEPOT", "AETHER_CONDENSER", "HIGH_YIELD_AETHER_CONDENSER"] as const) {
      expect(structureStacksPerTown(type)).toBe(true);
    }
  });

  it("keeps one-per-town support buildings as singletons", () => {
    for (const type of ["ANCILLARY_FACTORY", "CLEARING_HOUSE", "TRADE_NEXUS", "INCUBATION_ENGINE", "NEURAL_WORKS", "RESERVE_LATTICE"] as const) {
      expect(structureStacksPerTown(type)).toBe(false);
    }
  });

  it("lists each type under the placement mode its exemption is written for", () => {
    for (const type of STACKING_SAME_TILE_SUPPORT_STRUCTURE_TYPES) {
      expect(structurePlacementMetadata(type).placementMode).toBe("same_tile");
    }
    for (const type of STACKING_TOWN_SUPPORT_STRUCTURE_TYPES) {
      expect(structurePlacementMetadata(type).placementMode).toBe("town_support");
    }
  });
});
