// Resource slots — docs/manpower-economy-rewrite-plan.md §5 (Pillar 2, Step 5).
//
// TITANIUM/CRYSTAL/UMBRITE/FOOD stop being stockpiled quantities. Each settled
// resource tile provides a small number of discrete SLOTS; a structure that
// needs one of these resources permanently occupies a slot for as long as it
// exists (no stockpile spend, no timer — §5.1). GOLD and SHARD are
// deliberately untouched by this (§5.5) and stay flow/event-gated.
//
// v1 scope (§5.6): a global pool per resource, not per-tile tapping —
// `supply = Σ(base + boosts)` over owned settled tiles of that resource,
// `demand = Σ` over resource-consuming structures. No per-tile assignment.

import type { BuildableStructureType } from "../structure-costs/structure-costs.js";
import type { ConverterMode, FortVariant, PopulationTier, ResourceType, SiegeOutpostVariant } from "../types.js";

// Fort/Siege tier-ladder variants (TITANIUM_BASTION, THUNDER_BASTION, SIEGE_TOWER,
// DREAD_TOWER) aren't part of BuildableStructureType — they're FortVariant/
// SiegeOutpostVariant — but each has its own distinct slot requirement
// (§12's Fort/Siege ladder tables), so the slot-requirement map needs to key
// on the union of all three.
export type SlotStructureType = BuildableStructureType | FortVariant | SiegeOutpostVariant;

export type SlotResource = "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE";

export type StructureSlotRequirement = {
  resource: SlotResource;
  count: number;
};

// §12: every structure's exact "New slot requirement" column, transcribed
// verbatim. Where a structure has both a build-time resourceCost (in
// structure-costs.ts) and a listed slot requirement, the slot requirement is
// authoritative — build-time resourceCost fields for FOOD/TITANIUM/CRYSTAL/UMBRITE
// are retired by this module (§5 supersedes them; only SHARD build costs
// still apply, since SHARD stays a real stockpile, §5.5).
//
// One known documentation quirk, preserved intentionally rather than
// "corrected" by guessing: CUSTOMS_HOUSE lists a 60-CRYSTAL build cost in
// structure-costs.ts but §12's own slot-requirement column for it says only
// "1 FOOD slot" (no CRYSTAL slot), unlike FOUNDRY/RAIL_DEPOT/
// RADAR_SYSTEM/AETHER_TOWER, which the plan's "Tier 3 crystal
// fix" explicitly gives a CRYSTAL slot on top of FOOD. Taken at face value
// (the plan's table is the source of truth for slot requirements), not
// inferred. GARRISON_HALL (Ancillary Factory) originally had this same
// CRYSTAL slot too, but it was removed per a later tech-tree redesign
// decision — CRYSTAL doesn't fit a Manpower-branch building's theme.
export const STRUCTURE_SLOT_REQUIREMENTS: Partial<Record<SlotStructureType, StructureSlotRequirement[]>> = {
  // Starter military
  WOODEN_FORT: [{ resource: "FOOD", count: 1 }],
  RELAY_BEACON: [{ resource: "FOOD", count: 1 }],

  // Tier 1 — basic economic sinks
  // FARMSTEAD/WATERWORKS deliberately have NO slot requirement (zero
  // upkeep, user decision): both boost FOOD supply itself (same-tile +1,
  // Waterworks-radius +2 via WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS below), so
  // charging them their own boosted resource would be circular — dormancy
  // could silently zero out the very supply they exist to add.
  UMBRITE_RIG: [{ resource: "FOOD", count: 1 }],
  MINE: [{ resource: "FOOD", count: 1 }],
  GRANARY: [{ resource: "FOOD", count: 1 }],
  OBSERVATORY: [{ resource: "CRYSTAL", count: 1 }],
  CENSUS_HALL: [{ resource: "FOOD", count: 1 }],

  // Tier 1.5 — mid sinks
  SEED_GRANARY: [{ resource: "FOOD", count: 1 }],
  CUSTOMS_HOUSE: [{ resource: "FOOD", count: 1 }],

  // Tier 2 — trade & production infrastructure
  MINTWORKS: [{ resource: "FOOD", count: 1 }],
  UMBRITE_SYNTHESIZER: [{ resource: "UMBRITE", count: 1 }],
  TITANIUM_WORKS: [{ resource: "TITANIUM", count: 1 }],
  CRYSTAL_SYNTHESIZER: [{ resource: "CRYSTAL", count: 1 }],
  // CRYSTAL slot removed per user decision (tech-tree redesign) — Ancillary
  // Factory is a Manpower-branch building, CRYSTAL doesn't fit its theme.
  GARRISON_HALL: [{ resource: "FOOD", count: 1 }],
  GOVERNORS_OFFICE: [{ resource: "FOOD", count: 1 }],
  CARAVANARY: [{ resource: "FOOD", count: 1 }],
  AIRPORT: [{ resource: "CRYSTAL", count: 3 }],
  CLEARING_HOUSE: [{ resource: "FOOD", count: 1 }],

  // Tier 3 — major economic engines
  FOUNDRY: [{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }],
  RAIL_DEPOT: [{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }],
  RADAR_SYSTEM: [{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }],
  ADVANCED_UMBRITE_SYNTHESIZER: [{ resource: "UMBRITE", count: 1 }],
  ADVANCED_TITANIUM_WORKS: [{ resource: "TITANIUM", count: 1 }],
  ADVANCED_CRYSTAL_SYNTHESIZER: [{ resource: "CRYSTAL", count: 1 }],

  // Tier 4 — elite structures
  AETHER_TOWER: [{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }],

  // War branch — WEAPONS_WORKSHOP retired (structure-registry-economic.ts),
  // replaced by the two resource-specific factories below. Entry kept so any
  // copy a player already owns from before retirement keeps its slot cost.
  WEAPONS_WORKSHOP: [{ resource: "TITANIUM", count: 1 }, { resource: "UMBRITE", count: 1 }],
  // Each a dedicated single-resource sink (design doc), uncapped per town
  // (placementMode "same_tile") so each copy's slot cost is real and scales
  // with how many a player builds.
  TITANIUM_WEAPONS_FACTORY: [{ resource: "TITANIUM", count: 1 }],
  UMBRITE_WEAPONS_FACTORY: [{ resource: "UMBRITE", count: 1 }],

  // Manpower branch — new buildings
  QUARTERMASTERS_OFFICE: [{ resource: "FOOD", count: 1 }],
  LOGISTICS_GUILD: [{ resource: "FOOD", count: 1 }],
  ASSEMBLY_WORKS: [{ resource: "FOOD", count: 1 }, { resource: "CRYSTAL", count: 1 }],

  // Fort ladder
  FORT: [{ resource: "TITANIUM", count: 1 }],
  TITANIUM_BASTION: [{ resource: "TITANIUM", count: 2 }],
  THUNDER_BASTION: [{ resource: "TITANIUM", count: 4 }],

  // Siege ladder
  SIEGE_OUTPOST: [{ resource: "UMBRITE", count: 1 }],
  SIEGE_TOWER: [{ resource: "UMBRITE", count: 2 }, { resource: "TITANIUM", count: 1 }],
  DREAD_TOWER: [{ resource: "UMBRITE", count: 3 }, { resource: "TITANIUM", count: 2 }],

  // Monument parts + assemblies (SHARD build cost stays as a flow/stockpile
  // cost, §5.5 — only the CRYSTAL requirement below is slot-based)
  IMPERIAL_EXCHANGE_PART_1: [{ resource: "CRYSTAL", count: 1 }],
  IMPERIAL_EXCHANGE_PART_2: [{ resource: "CRYSTAL", count: 1 }],
  IMPERIAL_EXCHANGE_PART_3: [{ resource: "CRYSTAL", count: 1 }],
  WORLD_ENGINE_PART_1: [{ resource: "CRYSTAL", count: 1 }],
  WORLD_ENGINE_PART_2: [{ resource: "CRYSTAL", count: 1 }],
  WORLD_ENGINE_PART_3: [{ resource: "CRYSTAL", count: 1 }],
  AEGIS_DOME_PART_1: [{ resource: "CRYSTAL", count: 1 }],
  AEGIS_DOME_PART_2: [{ resource: "CRYSTAL", count: 1 }],
  AEGIS_DOME_PART_3: [{ resource: "CRYSTAL", count: 1 }],
  ASTRAL_DOCK_PART_1: [{ resource: "CRYSTAL", count: 1 }],
  ASTRAL_DOCK_PART_2: [{ resource: "CRYSTAL", count: 1 }],
  ASTRAL_DOCK_PART_3: [{ resource: "CRYSTAL", count: 1 }],
  POPULATION_BUREAU_PART_1: [{ resource: "CRYSTAL", count: 1 }],
  POPULATION_BUREAU_PART_2: [{ resource: "CRYSTAL", count: 1 }],
  POPULATION_BUREAU_PART_3: [{ resource: "CRYSTAL", count: 1 }],
  TITANIUM_LEVY_PART_1: [{ resource: "CRYSTAL", count: 1 }],
  TITANIUM_LEVY_PART_2: [{ resource: "CRYSTAL", count: 1 }],
  TITANIUM_LEVY_PART_3: [{ resource: "CRYSTAL", count: 1 }],
  // The final monument's own slot cost is 4, not 1: it absorbs the 3
  // CRYSTAL slots its 3 consumed Parts used to occupy (see
  // consumeMonumentParts in apps/simulation/src/runtime-structure-build-
  // completion.ts, which clears the Parts on monument completion) plus 1
  // for the monument itself.
  IMPERIAL_EXCHANGE: [{ resource: "CRYSTAL", count: 4 }],
  WORLD_ENGINE: [{ resource: "CRYSTAL", count: 4 }],
  AEGIS_DOME: [{ resource: "CRYSTAL", count: 4 }],
  ASTRAL_DOCK: [{ resource: "CRYSTAL", count: 4 }],
  POPULATION_BUREAU: [{ resource: "CRYSTAL", count: 4 }],
  TITANIUM_LEVY: [{ resource: "CRYSTAL", count: 4 }]
};

export const structureSlotRequirements = (type: SlotStructureType): StructureSlotRequirement[] =>
  STRUCTURE_SLOT_REQUIREMENTS[type] ?? [];

// §6.4: synthesizers (and their Advanced variants) are hard-capped at
// exactly 1 slot of their resource, forever — no Mine-style doubling, no
// second one ever counting toward supply. Enforced at build-count level
// (never build a 2nd), not by shrinking their own slot contribution, since
// a synthesizer doesn't sit on a real resource tile at all.
export const SYNTHESIZER_STRUCTURE_TYPES: readonly BuildableStructureType[] = [
  "UMBRITE_SYNTHESIZER",
  "ADVANCED_UMBRITE_SYNTHESIZER",
  "TITANIUM_WORKS",
  "ADVANCED_TITANIUM_WORKS",
  "CRYSTAL_SYNTHESIZER",
  "ADVANCED_CRYSTAL_SYNTHESIZER"
];

export const SYNTHESIZER_TYPE_SET = new Set(SYNTHESIZER_STRUCTURE_TYPES);

export const SYNTHESIZER_FAMILY_RESOURCE: Partial<Record<BuildableStructureType, SlotResource>> = {
  UMBRITE_SYNTHESIZER: "UMBRITE",
  ADVANCED_UMBRITE_SYNTHESIZER: "UMBRITE",
  TITANIUM_WORKS: "TITANIUM",
  ADVANCED_TITANIUM_WORKS: "TITANIUM",
  CRYSTAL_SYNTHESIZER: "CRYSTAL",
  ADVANCED_CRYSTAL_SYNTHESIZER: "CRYSTAL"
} as const;

export const converterModeOf = (structure: { converterMode?: ConverterMode | undefined } | undefined): ConverterMode =>
  structure?.converterMode ?? "SYNTHESIZE";

export const isSlotSourceConverter = (type: string, mode: ConverterMode): boolean =>
  SYNTHESIZER_TYPE_SET.has(type as BuildableStructureType) && mode === "SYNTHESIZE";

export const isSlotSinkConverter = (type: string, mode: ConverterMode): boolean =>
  SYNTHESIZER_TYPE_SET.has(type as BuildableStructureType) && mode === "EXCHANGE";

// §5.2/§5.3: base slot supply per raw resource tile, and the boost each
// tile-sitting structure adds. FISH has no per-tile-structure boost path
// (§5.3, Farmstead/Waterworks don't touch it) — FARM is the one worth
// developing for real scale via structures. FISH does get one flat,
// tech-gated bonus instead: AGRICULTURE_FISH_FOOD_SLOT_BONUS below, applied
// per owned FISH tile once the player has researched Agrarian Works
// ("agriculture"), independent of any structure on the tile.
export const BASE_SLOTS_BY_TILE_RESOURCE: Partial<Record<ResourceType, { slotResource: SlotResource; baseSlots: number }>> = {
  FARM: { slotResource: "FOOD", baseSlots: 1 },
  FISH: { slotResource: "FOOD", baseSlots: 2 },
  TITANIUM: { slotResource: "TITANIUM", baseSlots: 1 },
  GEMS: { slotResource: "CRYSTAL", baseSlots: 1 },
  UMBRITE: { slotResource: "UMBRITE", baseSlots: 1 }
};

// Agrarian Works ("agriculture" tech) grants +1 FOOD slot on every owned
// settled FISH tile, flat, regardless of whether a Farmstead is built there
// — a passive tech effect, not a structure boost (Farmstead itself still has
// no effect on fish production, §5.3). See tech-domain-bridge.ts's
// techGrantedFishFoodSlotBonus, which is what actually gates this on the
// player having researched the tech.
export const AGRICULTURE_FISH_FOOD_SLOT_BONUS = 1;

// Mine/Camp add +1 slot to the tile they sit on (§5.2: "one rule, all
// resources"). Farmstead adds +2 (user decision — a bigger same-tile boost
// than Mine/Camp, on top of which Waterworks still adds its own separate
// +2-per-Farmstead-in-radius bonus below). Waterworks/Foundry instead boost
// every Farmstead/Mine within their radius by a further bonus (§5.3/§12) — a
// radius effect, not a same-tile one, so neither is part of this
// per-tile-structure map.
export const TILE_SLOT_BOOST_STRUCTURES: Partial<Record<BuildableStructureType, number>> = {
  FARMSTEAD: 2,
  MINE: 1,
  UMBRITE_RIG: 1
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
