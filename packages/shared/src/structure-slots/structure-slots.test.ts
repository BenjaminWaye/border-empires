import { describe, expect, it } from "vitest";
import {
  BASE_SLOTS_BY_TILE_RESOURCE,
  STRUCTURE_SLOT_REQUIREMENTS,
  SYNTHESIZER_STRUCTURE_TYPES,
  TILE_SLOT_BOOST_STRUCTURES,
  TOWN_TIER_UPGRADE_GOLD_COST,
  HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS,
  observatoryCrystalSlotCostForOwnedCount,
  structureSlotRequirements,
  townFoodSlotDemandForTier
} from "./structure-slots.js";

// Single source of truth for the Observatory progressive-cost rule --
// apps/simulation's resource-slot-view.ts and the client's upkeep-text
// helper both call this function directly, so pinning it here is enough to
// guarantee they can never disagree.
describe("observatoryCrystalSlotCostForOwnedCount", () => {
  it("1st Observatory costs 1 CRYSTAL slot", () => {
    expect(observatoryCrystalSlotCostForOwnedCount(0)).toBe(1);
  });

  it("2nd Observatory costs 2 CRYSTAL slots", () => {
    expect(observatoryCrystalSlotCostForOwnedCount(1)).toBe(2);
  });

  it("3rd Observatory costs 3 CRYSTAL slots", () => {
    expect(observatoryCrystalSlotCostForOwnedCount(2)).toBe(3);
  });
});

describe("structureSlotRequirements", () => {
  it("matches §12's Fort tier ladder exactly", () => {
    expect(structureSlotRequirements("FORT")).toEqual([{ resource: "TITANIUM", count: 1 }]);
    expect(structureSlotRequirements("TITANIUM_BASTION")).toEqual([{ resource: "TITANIUM", count: 2 }]);
    expect(structureSlotRequirements("THUNDER_BASTION")).toEqual([{ resource: "TITANIUM", count: 4 }]);
  });

  it("matches §12's Siege tier ladder exactly", () => {
    expect(structureSlotRequirements("SIEGE_BATTERY")).toEqual([{ resource: "UMBRITE", count: 1 }]);
    expect(structureSlotRequirements("SIEGE_TOWER")).toEqual([
      { resource: "UMBRITE", count: 2 },
      { resource: "TITANIUM", count: 1 }
    ]);
    expect(structureSlotRequirements("DREAD_TOWER")).toEqual([
      { resource: "UMBRITE", count: 3 },
      { resource: "TITANIUM", count: 2 }
    ]);
  });

  it("gives every Tier 3 'crystal fix' structure both a FOOD and a CRYSTAL slot", () => {
    for (const type of ["ORE_REFINERY", "NEURAL_WORKS", "RESONANCE_GRID", "AMBARIC_TRANSFORMER"] as const) {
      expect(structureSlotRequirements(type)).toEqual(
        expect.arrayContaining([{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }])
      );
    }
  });

  it("gives Ancillary Depot (Ancillary Factory) just FOOD — CRYSTAL slot removed per tech-tree redesign", () => {
    expect(structureSlotRequirements("ANCILLARY_DEPOT")).toEqual([
      { resource: "FOOD", count: 1 }
    ]);
  });

  it("gives every synthesizer (base and advanced) exactly 1 slot of its own resource, no FOOD slot", () => {
    expect(structureSlotRequirements("UMBRITE_WORKS")).toEqual([{ resource: "UMBRITE", count: 1 }]);
    expect(structureSlotRequirements("HIGH_YIELD_UMBRITE_WORKS")).toEqual([{ resource: "UMBRITE", count: 1 }]);
    expect(structureSlotRequirements("TITANIUM_WORKS")).toEqual([{ resource: "TITANIUM", count: 1 }]);
    expect(structureSlotRequirements("HIGH_YIELD_TITANIUM_WORKS")).toEqual([{ resource: "TITANIUM", count: 1 }]);
    expect(structureSlotRequirements("AETHER_CONDENSER")).toEqual([{ resource: "CRYSTAL", count: 1 }]);
    expect(structureSlotRequirements("HIGH_YIELD_AETHER_CONDENSER")).toEqual([{ resource: "CRYSTAL", count: 1 }]);
  });

  it("gives every monument component exactly 1 CRYSTAL slot (SHARD stays a separate flow cost, not modeled here)", () => {
    for (const type of [
      "IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3",
      "SOVEREIGN_SIEGE_ENGINE_PART_1", "SOVEREIGN_SIEGE_ENGINE_PART_2", "SOVEREIGN_SIEGE_ENGINE_PART_3",
      "AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3",
      "ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3",
      "CENSUS_DIRECTORATE_PART_1", "CENSUS_DIRECTORATE_PART_2", "CENSUS_DIRECTORATE_PART_3",
      "TITANIUM_LEVY_PART_1", "TITANIUM_LEVY_PART_2", "TITANIUM_LEVY_PART_3"
    ] as const) {
      expect(structureSlotRequirements(type)).toEqual([{ resource: "CRYSTAL", count: 1 }]);
    }
  });

  it("gives every finished monument assembly 4 CRYSTAL slots (1 for itself + 3 absorbing its consumed components' slots)", () => {
    for (const type of ["IMPERIAL_EXCHANGE", "SOVEREIGN_SIEGE_ENGINE", "AEGIS_DOME", "ASTRAL_DOCK", "CENSUS_DIRECTORATE", "TITANIUM_LEVY"] as const) {
      expect(structureSlotRequirements(type)).toEqual([{ resource: "CRYSTAL", count: 4 }]);
    }
  });

  it("gives structures with an existing 'other' slot requirement no FOOD slot (Observatory, Sky Dock)", () => {
    expect(structureSlotRequirements("OBSERVATORY")).toEqual([{ resource: "CRYSTAL", count: 1 }]);
    // SKY_DOCK's CRYSTAL slot requirement is 3, not 1 (bumped alongside its
    // bombard ability going free-to-fire — see server-game-constants.ts).
    expect(structureSlotRequirements("SKY_DOCK")).toEqual([{ resource: "CRYSTAL", count: 3 }]);
  });

  it("returns an empty array for a structure with no entry, rather than throwing", () => {
    expect(structureSlotRequirements("HYDROGARDEN")).toEqual([]);
  });

  it("every entry in the table has at least one requirement with a positive count", () => {
    for (const requirements of Object.values(STRUCTURE_SLOT_REQUIREMENTS)) {
      expect(requirements.length).toBeGreaterThan(0);
      for (const req of requirements) expect(req.count).toBeGreaterThan(0);
    }
  });

  it("Palisade requires FOOD slot (same as Relay Beacon), not TITANIUM like the upgraded Fort", () => {
    expect(structureSlotRequirements("PALISADE")).toEqual([{ resource: "FOOD", count: 1 }]);
  });
});

describe("BASE_SLOTS_BY_TILE_RESOURCE", () => {
  it("gives FARM 1 base FOOD slot and FISH a fixed 2, matching §5.3's asymmetry", () => {
    expect(BASE_SLOTS_BY_TILE_RESOURCE.FARM).toEqual({ slotResource: "FOOD", baseSlots: 1 });
    expect(BASE_SLOTS_BY_TILE_RESOURCE.FISH).toEqual({ slotResource: "FOOD", baseSlots: 2 });
  });

  it("maps TITANIUM->TITANIUM, GEMS->CRYSTAL, UMBRITE->UMBRITE at 1 base slot each", () => {
    expect(BASE_SLOTS_BY_TILE_RESOURCE.TITANIUM).toEqual({ slotResource: "TITANIUM", baseSlots: 1 });
    expect(BASE_SLOTS_BY_TILE_RESOURCE.GEMS).toEqual({ slotResource: "CRYSTAL", baseSlots: 1 });
    expect(BASE_SLOTS_BY_TILE_RESOURCE.UMBRITE).toEqual({ slotResource: "UMBRITE", baseSlots: 1 });
  });
});

describe("TILE_SLOT_BOOST_STRUCTURES / Hydroworks bonus", () => {
  it("Hydrogarden adds +2 slots, Mine/Umbrite Rig each add +1 slot, to their own tile", () => {
    expect(TILE_SLOT_BOOST_STRUCTURES.HYDROGARDEN).toBe(2);
    expect(TILE_SLOT_BOOST_STRUCTURES.MINE).toBe(1);
    expect(TILE_SLOT_BOOST_STRUCTURES.UMBRITE_RIG).toBe(1);
  });

  it("Hydroworks adds +2 FOOD slots to Hydrogardens in its radius, on top of Hydrogarden's own +2", () => {
    expect(HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS).toBe(2);
  });
});

describe("townFoodSlotDemandForTier", () => {
  it("gives SETTLEMENT 0 FOOD slots and TOWN 4 FOOD slots (no upkeep until upgraded)", () => {
    expect(townFoodSlotDemandForTier("SETTLEMENT")).toBe(0);
    expect(townFoodSlotDemandForTier("TOWN")).toBe(4);
    expect(townFoodSlotDemandForTier(undefined)).toBe(4);
  });

  it("adds +1 FOOD slot per manual growth step beyond TOWN", () => {
    expect(townFoodSlotDemandForTier("CITY")).toBe(5);
    expect(townFoodSlotDemandForTier("GREAT_CITY")).toBe(6);
    expect(townFoodSlotDemandForTier("METROPOLIS")).toBe(7);
  });
});

describe("TOWN_TIER_UPGRADE_GOLD_COST", () => {
  it("doubles per step per the user's decided cost model", () => {
    expect(TOWN_TIER_UPGRADE_GOLD_COST).toEqual({
      TOWN: 20,
      CITY: 40,
      GREAT_CITY: 80,
      METROPOLIS: 160
    });
  });
});

describe("SYNTHESIZER_STRUCTURE_TYPES", () => {
  it("lists all three base + three advanced synthesizer types", () => {
    expect(SYNTHESIZER_STRUCTURE_TYPES).toEqual(
      expect.arrayContaining([
        "UMBRITE_WORKS", "HIGH_YIELD_UMBRITE_WORKS",
        "TITANIUM_WORKS", "HIGH_YIELD_TITANIUM_WORKS",
        "AETHER_CONDENSER", "HIGH_YIELD_AETHER_CONDENSER"
      ])
    );
    expect(SYNTHESIZER_STRUCTURE_TYPES.length).toBe(6);
  });
});
