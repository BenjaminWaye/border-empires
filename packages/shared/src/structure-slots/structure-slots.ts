// Resource slots — docs/manpower-economy-rewrite-plan.md §5 (Pillar 2, Step 5).
//
// IRON/CRYSTAL/SUPPLY/FOOD stop being stockpiled quantities. Each settled
// resource tile provides a small number of discrete SLOTS; a structure that
// needs one of these resources permanently occupies a slot for as long as it
// exists (no stockpile spend, no timer — §5.1). GOLD and SHARD are
// deliberately untouched by this (§5.5) and stay flow/event-gated.
//
// v1 scope (§5.6): a global pool per resource, not per-tile tapping —
// `supply = Σ(base + boosts)` over owned settled tiles of that resource,
// `demand = Σ` over resource-consuming structures. No per-tile assignment.

import type { BuildableStructureType } from "../structure-costs/structure-costs.js";
import type { FortVariant, PopulationTier, ResourceType, SiegeOutpostVariant } from "../types.js";

// Fort/Siege tier-ladder variants (IRON_BASTION, THUNDER_BASTION, SIEGE_TOWER,
// DREAD_TOWER) aren't part of BuildableStructureType — they're FortVariant/
// SiegeOutpostVariant — but each has its own distinct slot requirement
// (§12's Fort/Siege ladder tables), so the slot-requirement map needs to key
// on the union of all three.
export type SlotStructureType = BuildableStructureType | FortVariant | SiegeOutpostVariant;

export type SlotResource = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY";

export type StructureSlotRequirement = {
  resource: SlotResource;
  count: number;
};

// §12: every structure's exact "New slot requirement" column, transcribed
// verbatim. Where a structure has both a build-time resourceCost (in
// structure-costs.ts) and a listed slot requirement, the slot requirement is
// authoritative — build-time resourceCost fields for FOOD/IRON/CRYSTAL/SUPPLY
// are retired by this module (§5 supersedes them; only SHARD build costs
// still apply, since SHARD stays a real stockpile, §5.5).
//
// One known documentation quirk, preserved intentionally rather than
// "corrected" by guessing: CUSTOMS_HOUSE lists a 60-CRYSTAL build cost in
// structure-costs.ts but §12's own slot-requirement column for it says only
// "1 FOOD slot" (no CRYSTAL slot), unlike GARRISON_HALL/BANK/FOUNDRY/
// RAIL_DEPOT/RADAR_SYSTEM/EXCHANGE_HOUSE/AETHER_TOWER, which the plan's
// "Tier 3 crystal fix" explicitly gives a CRYSTAL slot on top of FOOD. Taken
// at face value (the plan's table is the source of truth for slot
// requirements), not inferred.
export const STRUCTURE_SLOT_REQUIREMENTS: Partial<Record<SlotStructureType, StructureSlotRequirement[]>> = {
  // Starter military
  WOODEN_FORT: [{ resource: "FOOD", count: 1 }],
  LIGHT_OUTPOST: [{ resource: "FOOD", count: 1 }],

  // Tier 1 — basic economic sinks
  // FARMSTEAD/WATERWORKS deliberately have NO slot requirement (zero
  // upkeep, user decision): both boost FOOD supply itself (same-tile +1,
  // Waterworks-radius +2 via WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS below), so
  // charging them their own boosted resource would be circular — dormancy
  // could silently zero out the very supply they exist to add.
  CAMP: [{ resource: "FOOD", count: 1 }],
  MINE: [{ resource: "FOOD", count: 1 }],
  GRANARY: [{ resource: "FOOD", count: 1 }],
  OBSERVATORY: [{ resource: "CRYSTAL", count: 1 }],
  CENSUS_HALL: [{ resource: "FOOD", count: 1 }],

  // Tier 1.5 — mid sinks
  SEED_GRANARY: [{ resource: "FOOD", count: 1 }],
  CUSTOMS_HOUSE: [{ resource: "FOOD", count: 1 }],

  // Tier 2 — trade & production infrastructure
  MARKET: [{ resource: "FOOD", count: 1 }],
  FUR_SYNTHESIZER: [{ resource: "SUPPLY", count: 1 }],
  IRONWORKS: [{ resource: "IRON", count: 1 }],
  CRYSTAL_SYNTHESIZER: [{ resource: "CRYSTAL", count: 1 }],
  GARRISON_HALL: [{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }],
  GOVERNORS_OFFICE: [{ resource: "FOOD", count: 1 }],
  CARAVANARY: [{ resource: "FOOD", count: 1 }],
  AIRPORT: [{ resource: "CRYSTAL", count: 1 }],
  CLEARING_HOUSE: [{ resource: "FOOD", count: 1 }],

  // Tier 3 — major economic engines
  BANK: [{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }],
  FOUNDRY: [{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }],
  RAIL_DEPOT: [{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }],
  RADAR_SYSTEM: [{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }],
  ADVANCED_FUR_SYNTHESIZER: [{ resource: "SUPPLY", count: 1 }],
  ADVANCED_IRONWORKS: [{ resource: "IRON", count: 1 }],
  ADVANCED_CRYSTAL_SYNTHESIZER: [{ resource: "CRYSTAL", count: 1 }],

  // Tier 4 — elite structures
  EXCHANGE_HOUSE: [{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }],
  AETHER_TOWER: [{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }],

  // Manpower branch — new buildings
  QUARTERMASTERS_OFFICE: [{ resource: "FOOD", count: 1 }],
  LOGISTICS_GUILD: [{ resource: "FOOD", count: 1 }],
  ASSEMBLY_WORKS: [{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }],

  // Fort ladder
  FORT: [{ resource: "IRON", count: 1 }],
  IRON_BASTION: [{ resource: "IRON", count: 2 }],
  THUNDER_BASTION: [{ resource: "IRON", count: 4 }],

  // Siege ladder
  SIEGE_OUTPOST: [{ resource: "SUPPLY", count: 1 }],
  SIEGE_TOWER: [{ resource: "SUPPLY", count: 2 }, { resource: "IRON", count: 1 }],
  DREAD_TOWER: [{ resource: "SUPPLY", count: 3 }, { resource: "IRON", count: 2 }],

  // Monument parts + assemblies (SHARD build cost stays as a flow/stockpile
  // cost, §5.5 — only the CRYSTAL requirement below is slot-based)
  IMPERIAL_EXCHANGE_PART: [{ resource: "CRYSTAL", count: 1 }],
  WORLD_ENGINE_PART: [{ resource: "CRYSTAL", count: 1 }],
  AEGIS_DOME_PART: [{ resource: "CRYSTAL", count: 1 }],
  ASTRAL_DOCK_PART: [{ resource: "CRYSTAL", count: 1 }],
  POPULATION_BUREAU_PART: [{ resource: "CRYSTAL", count: 1 }],
  IRON_LEVY_PART: [{ resource: "CRYSTAL", count: 1 }],
  IMPERIAL_EXCHANGE: [{ resource: "CRYSTAL", count: 1 }],
  WORLD_ENGINE: [{ resource: "CRYSTAL", count: 1 }],
  AEGIS_DOME: [{ resource: "CRYSTAL", count: 1 }],
  ASTRAL_DOCK: [{ resource: "CRYSTAL", count: 1 }],
  POPULATION_BUREAU: [{ resource: "CRYSTAL", count: 1 }],
  IRON_LEVY: [{ resource: "CRYSTAL", count: 1 }]
};

export const structureSlotRequirements = (type: SlotStructureType): StructureSlotRequirement[] =>
  STRUCTURE_SLOT_REQUIREMENTS[type] ?? [];

// §6.4: synthesizers (and their Advanced variants) are hard-capped at
// exactly 1 slot of their resource, forever — no Mine-style doubling, no
// second one ever counting toward supply. Enforced at build-count level
// (never build a 2nd), not by shrinking their own slot contribution, since
// a synthesizer doesn't sit on a real resource tile at all.
export const SYNTHESIZER_STRUCTURE_TYPES: readonly BuildableStructureType[] = [
  "FUR_SYNTHESIZER",
  "ADVANCED_FUR_SYNTHESIZER",
  "IRONWORKS",
  "ADVANCED_IRONWORKS",
  "CRYSTAL_SYNTHESIZER",
  "ADVANCED_CRYSTAL_SYNTHESIZER"
];

// §5.2/§5.3: base slot supply per raw resource tile, and the boost each
// tile-sitting structure adds. FISH is deliberately fixed with no boost path
// (§5.3) — FARM is the one worth developing for real scale.
export const BASE_SLOTS_BY_TILE_RESOURCE: Partial<Record<ResourceType, { slotResource: SlotResource; baseSlots: number }>> = {
  FARM: { slotResource: "FOOD", baseSlots: 1 },
  FISH: { slotResource: "FOOD", baseSlots: 2 },
  IRON: { slotResource: "IRON", baseSlots: 1 },
  GEMS: { slotResource: "CRYSTAL", baseSlots: 1 },
  WOOD: { slotResource: "SUPPLY", baseSlots: 1 },
  FUR: { slotResource: "SUPPLY", baseSlots: 1 }
};

// Farmstead/Mine/Camp all add +1 slot to the tile they sit on (§5.2: "one
// rule, all resources"). Waterworks/Foundry instead boost every Farmstead/
// Mine within their radius by a further bonus (§5.3/§12) — a radius effect,
// not a same-tile one, so neither is part of this per-tile-structure map.
export const TILE_SLOT_BOOST_STRUCTURES: Partial<Record<BuildableStructureType, number>> = {
  FARMSTEAD: 1,
  MINE: 1,
  CAMP: 1
};

export const WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS = 2;
// Mirrors WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS's "double the post-own-boost
// total" shape: a Mine alone is base(1) + own-boost(1) = 2 slots; within
// Foundry range it becomes 2 + 2 = 4, i.e. doubled, matching Foundry's
// "doubles active Mine production" billing (§12).
export const FOUNDRY_MINE_SLOT_BONUS = 2;

// §5.3: "a town requires ~4 food slots to be powered (produce gold +
// manpower)" — the town itself, separate from any structure sitting on its
// tile, which already draws its own 1 FOOD slot via STRUCTURE_SLOT_REQUIREMENTS
// above if it has an economicStructure. Domain effects (supportEconomicFoodUpkeepMult,
// settledFoodUpkeepMult — plan §23.2) reduce this per-town for specific
// players; this constant is the base, pre-domain-effect count.
export const TOWN_FOOD_SLOT_DEMAND = 4;

// Town tier upgrades (UPGRADE_TOWN_TIER) each permanently add +1 FOOD slot
// demand on top of the base above, reflecting a bigger, better-fed
// population. SETTLEMENT starts at 0 (the base 4 is stepped down by -4);
// upgrading to TOWN brings it up to the base 4. The "one more FOOD slot per
// upgrade step" applies to the manual growth steps beyond that: TOWN->CITY 5;
// CITY->GREAT_CITY 6; GREAT_CITY->METROPOLIS 7.
// Exported (not just module-private) so Ministry Hall (GOVERNORS_OFFICE) can
// reduce a town's FOOD slot demand by exactly its tier step, per the
// tech-tree redesign — see governorsOfficeFoodSlotWaiver below.
export const TOWN_TIER_FOOD_SLOT_STEP: Record<PopulationTier, number> = {
  SETTLEMENT: -4,
  TOWN: 0,
  CITY: 1,
  GREAT_CITY: 2,
  METROPOLIS: 3
};

export const townFoodSlotDemandForTier = (tier: PopulationTier | undefined): number =>
  TOWN_FOOD_SLOT_DEMAND + (tier ? TOWN_TIER_FOOD_SLOT_STEP[tier] : 0);

// Ministry Hall (GOVERNORS_OFFICE): reduces the town's FOOD slot demand by an
// amount equal to the town's own tier step (Town=0, City=1, Great City=2,
// Metropolis=3) — replaces the old fabricated "-20% settled-tile upkeep"
// claim, which corresponded to nothing real in the code.
export const governorsOfficeFoodSlotWaiver = (tier: PopulationTier | undefined): number =>
  tier ? Math.max(0, TOWN_TIER_FOOD_SLOT_STEP[tier]) : 0;

// Gold cost for each UPGRADE_TOWN_TIER step, decided directly by the user:
// doubling per step, replacing the old FOOD-stockpile lump sum (TIER_UPGRADE_FOOD_COST,
// server-game-constants.ts — retired now that FOOD has no stockpile, §5.4).
// Unlike the old cost (which only gated TOWN->CITY/CITY->GREAT_CITY/GREAT_CITY->METROPOLIS,
// leaving SETTLEMENT->TOWN free), this applies to all four steps uniformly.
export const TOWN_TIER_UPGRADE_GOLD_COST: Record<Exclude<PopulationTier, "SETTLEMENT">, number> = {
  TOWN: 20,
  CITY: 40,
  GREAT_CITY: 80,
  METROPOLIS: 160
};
