import { describe, expect, it } from "vitest";
import {
  BASE_SLOTS_BY_TILE_RESOURCE,
  STRUCTURE_SLOT_REQUIREMENTS,
  SYNTHESIZER_STRUCTURE_TYPES,
  TILE_SLOT_BOOST_STRUCTURES,
  TOWN_TIER_UPGRADE_GOLD_COST,
  WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS,
  structureSlotRequirements,
  townFoodSlotDemandForTier
} from "./structure-slots.js";

describe("structureSlotRequirements", () => {
  it("matches §12's Fort tier ladder exactly", () => {
    expect(structureSlotRequirements("FORT")).toEqual([{ resource: "IRON", count: 1 }]);
    expect(structureSlotRequirements("IRON_BASTION")).toEqual([{ resource: "IRON", count: 2 }]);
    expect(structureSlotRequirements("THUNDER_BASTION")).toEqual([{ resource: "IRON", count: 4 }]);
  });

  it("matches §12's Siege tier ladder exactly", () => {
    expect(structureSlotRequirements("SIEGE_OUTPOST")).toEqual([{ resource: "SUPPLY", count: 1 }]);
    expect(structureSlotRequirements("SIEGE_TOWER")).toEqual([
      { resource: "SUPPLY", count: 2 },
      { resource: "IRON", count: 1 }
    ]);
    expect(structureSlotRequirements("DREAD_TOWER")).toEqual([
      { resource: "SUPPLY", count: 3 },
      { resource: "IRON", count: 2 }
    ]);
  });

  it("gives every Tier 3 'crystal fix' structure both a FOOD and a CRYSTAL slot", () => {
    for (const type of ["FOUNDRY", "RAIL_DEPOT", "RADAR_SYSTEM", "AETHER_TOWER"] as const) {
      expect(structureSlotRequirements(type)).toEqual(
        expect.arrayContaining([{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }])
      );
    }
  });

  it("gives Garrison Hall (Ancillary Factory) just FOOD — CRYSTAL slot removed per tech-tree redesign", () => {
    expect(structureSlotRequirements("GARRISON_HALL")).toEqual([
      { resource: "FOOD", count: 1 }
    ]);
  });

  it("gives every synthesizer (base and advanced) exactly 1 slot of its own resource, no FOOD slot", () => {
    expect(structureSlotRequirements("FUR_SYNTHESIZER")).toEqual([{ resource: "SUPPLY", count: 1 }]);
    expect(structureSlotRequirements("ADVANCED_FUR_SYNTHESIZER")).toEqual([{ resource: "SUPPLY", count: 1 }]);
    expect(structureSlotRequirements("IRONWORKS")).toEqual([{ resource: "IRON", count: 1 }]);
    expect(structureSlotRequirements("ADVANCED_IRONWORKS")).toEqual([{ resource: "IRON", count: 1 }]);
    expect(structureSlotRequirements("CRYSTAL_SYNTHESIZER")).toEqual([{ resource: "CRYSTAL", count: 1 }]);
    expect(structureSlotRequirements("ADVANCED_CRYSTAL_SYNTHESIZER")).toEqual([{ resource: "CRYSTAL", count: 1 }]);
  });

  it("gives every monument component exactly 1 CRYSTAL slot (SHARD stays a separate flow cost, not modeled here)", () => {
    for (const type of [
      "IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3",
      "WORLD_ENGINE_PART_1", "WORLD_ENGINE_PART_2", "WORLD_ENGINE_PART_3",
      "AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3",
      "ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3",
      "POPULATION_BUREAU_PART_1", "POPULATION_BUREAU_PART_2", "POPULATION_BUREAU_PART_3",
      "IRON_LEVY_PART_1", "IRON_LEVY_PART_2", "IRON_LEVY_PART_3"
    ] as const) {
      expect(structureSlotRequirements(type)).toEqual([{ resource: "CRYSTAL", count: 1 }]);
    }
  });

  it("gives every finished monument assembly 4 CRYSTAL slots (1 for itself + 3 absorbing its consumed components' slots)", () => {
    for (const type of ["IMPERIAL_EXCHANGE", "WORLD_ENGINE", "AEGIS_DOME", "ASTRAL_DOCK", "POPULATION_BUREAU", "IRON_LEVY"] as const) {
      expect(structureSlotRequirements(type)).toEqual([{ resource: "CRYSTAL", count: 4 }]);
    }
  });

  it("gives structures with an existing 'other' slot requirement no FOOD slot (Observatory, Airport)", () => {
    expect(structureSlotRequirements("OBSERVATORY")).toEqual([{ resource: "CRYSTAL", count: 1 }]);
    // AIRPORT's CRYSTAL slot requirement is 3, not 1 (bumped alongside its
    // bombard ability going free-to-fire — see server-game-constants.ts).
    expect(structureSlotRequirements("AIRPORT")).toEqual([{ resource: "CRYSTAL", count: 3 }]);
  });

  it("returns an empty array for a structure with no entry, rather than throwing", () => {
    expect(structureSlotRequirements("SEED_GRANARY")).toEqual([{ resource: "FOOD", count: 1 }]);
  });

  it("every entry in the table has at least one requirement with a positive count", () => {
    for (const requirements of Object.values(STRUCTURE_SLOT_REQUIREMENTS)) {
      expect(requirements.length).toBeGreaterThan(0);
      for (const req of requirements) expect(req.count).toBeGreaterThan(0);
    }
  });

  it("Wooden Fort requires FOOD slot (same as Light Outpost), not IRON like the upgraded Fort", () => {
    expect(structureSlotRequirements("WOODEN_FORT")).toEqual([{ resource: "FOOD", count: 1 }]);
  });
});

describe("BASE_SLOTS_BY_TILE_RESOURCE", () => {
  it("gives FARM 1 base FOOD slot and FISH a fixed 2, matching §5.3's asymmetry", () => {
    expect(BASE_SLOTS_BY_TILE_RESOURCE.FARM).toEqual({ slotResource: "FOOD", baseSlots: 1 });
    expect(BASE_SLOTS_BY_TILE_RESOURCE.FISH).toEqual({ slotResource: "FOOD", baseSlots: 2 });
  });

  it("maps IRON->IRON, GEMS->CRYSTAL, WOOD/FUR->SUPPLY at 1 base slot each", () => {
    expect(BASE_SLOTS_BY_TILE_RESOURCE.IRON).toEqual({ slotResource: "IRON", baseSlots: 1 });
    expect(BASE_SLOTS_BY_TILE_RESOURCE.GEMS).toEqual({ slotResource: "CRYSTAL", baseSlots: 1 });
    expect(BASE_SLOTS_BY_TILE_RESOURCE.WOOD).toEqual({ slotResource: "SUPPLY", baseSlots: 1 });
    expect(BASE_SLOTS_BY_TILE_RESOURCE.FUR).toEqual({ slotResource: "SUPPLY", baseSlots: 1 });
  });
});

describe("TILE_SLOT_BOOST_STRUCTURES / Waterworks bonus", () => {
  it("Farmstead/Mine/Camp each add +1 slot to their own tile", () => {
    expect(TILE_SLOT_BOOST_STRUCTURES.FARMSTEAD).toBe(1);
    expect(TILE_SLOT_BOOST_STRUCTURES.MINE).toBe(1);
    expect(TILE_SLOT_BOOST_STRUCTURES.CAMP).toBe(1);
  });

  it("Waterworks adds +2 FOOD slots to Farmsteads in its radius, on top of Farmstead's own +1", () => {
    expect(WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS).toBe(2);
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
        "FUR_SYNTHESIZER", "ADVANCED_FUR_SYNTHESIZER",
        "IRONWORKS", "ADVANCED_IRONWORKS",
        "CRYSTAL_SYNTHESIZER", "ADVANCED_CRYSTAL_SYNTHESIZER"
      ])
    );
    expect(SYNTHESIZER_STRUCTURE_TYPES.length).toBe(6);
  });
});
