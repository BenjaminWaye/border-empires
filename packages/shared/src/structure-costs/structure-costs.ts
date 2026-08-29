import { ECONOMIC_STRUCTURE_BUILD_MS, FORT_BUILD_MS, RELAY_BEACON_BUILD_MS, OBSERVATORY_BUILD_MS, SIEGE_OUTPOST_BUILD_MS, WOODEN_FORT_BUILD_MS } from "../config.js";
import type { EconomicStructureType, FortVariant, SiegeOutpostVariant } from "../types.js";

export type StrategicResourceCostType = "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD";
export type BuildableStructureType = "FORT" | "OBSERVATORY" | "SIEGE_OUTPOST" | EconomicStructureType;

type StructureScaling =
  | { kind: "doubling" }
  | { kind: "incremental"; rate: number };

export type StructureCostDefinition = {
  baseGoldCost: number;
  manpowerCost?: number;
  resourceCost?: { resource: StrategicResourceCostType; amount: number };
  resourceOptions?: readonly StrategicResourceCostType[];
  scaling?: StructureScaling;
};

// Build gold costs are zeroed throughout this table per
// docs/manpower-economy-rewrite-plan.md §12: manpower (and, where noted,
// strategic resources) is the sole build cost now — gold only gates
// synthesizers (and, separately, a few structures) on an ONGOING per-minute
// upkeep basis (player-upkeep-incremental.ts), never on the build itself.
// `scaling` fields are kept (harmlessly multiplying zero) rather than
// stripped, since they still describe each structure's intended cost curve
// should build gold ever return.
const STRUCTURE_COST_DEFINITIONS: Record<BuildableStructureType, StructureCostDefinition> = {
  FORT: {
    baseGoldCost: 0,
    manpowerCost: 300,
    resourceCost: { resource: "TITANIUM", amount: 45 },
    scaling: { kind: "incremental", rate: 0.1 }
  },
  OBSERVATORY: {
    baseGoldCost: 0,
    manpowerCost: 80,
    resourceCost: { resource: "CRYSTAL", amount: 45 },
    scaling: { kind: "doubling" }
  },
  SIEGE_OUTPOST: {
    baseGoldCost: 0,
    manpowerCost: 60,
    resourceCost: { resource: "UMBRITE", amount: 45 },
    scaling: { kind: "incremental", rate: 0.1 }
  },
  // Manpower costs below implement docs/manpower-economy-rewrite-plan.md §4.1/§4.4
  // and the full table in §12: every economic structure now costs manpower as
  // its primary cost, in round tiers (80/100/150/300/400) anchored to Settle's
  // 20 (acquisition always a little cheaper than optimization, §4.2's ordering
  // rule). Resource costs are left as-is here — converting them to the slot
  // model is §5 (Step 5), out of scope for this pass.
  FARMSTEAD: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "FOOD", amount: 20 } },
  WATERWORKS: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "FOOD", amount: 20 } },
  UMBRITE_RIG: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "UMBRITE", amount: 30 } },
  MINE: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "TITANIUM", amount: 30 }, resourceOptions: ["TITANIUM", "CRYSTAL"] },
  MINTWORKS: { baseGoldCost: 0, manpowerCost: 150 },
  GRANARY: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "FOOD", amount: 40 } },
  SEED_GRANARY: { baseGoldCost: 0, manpowerCost: 100, resourceCost: { resource: "FOOD", amount: 80 } },
  CENSUS_HALL: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "FOOD", amount: 30 } },
  CLEARING_HOUSE: { baseGoldCost: 0, manpowerCost: 150, resourceCost: { resource: "CRYSTAL", amount: 80 } },
  AIRPORT: {
    baseGoldCost: 0,
    manpowerCost: 150,
    scaling: { kind: "doubling" }
  },
  AETHER_TOWER: {
    baseGoldCost: 0,
    manpowerCost: 400,
    resourceCost: { resource: "CRYSTAL", amount: 160 },
    scaling: { kind: "incremental", rate: 0.15 }
  },
  WOODEN_FORT: {
    baseGoldCost: 0,
    manpowerCost: 30,
    scaling: { kind: "incremental", rate: 0.1 }
  },
  RELAY_BEACON: {
    baseGoldCost: 0,
    manpowerCost: 30,
    scaling: { kind: "incremental", rate: 0.1 }
  },
  UMBRITE_SYNTHESIZER: { baseGoldCost: 0, manpowerCost: 150 },
  ADVANCED_UMBRITE_SYNTHESIZER: { baseGoldCost: 0, manpowerCost: 300, resourceCost: { resource: "UMBRITE", amount: 40 } },
  TITANIUM_WORKS: { baseGoldCost: 0, manpowerCost: 150 },
  ADVANCED_TITANIUM_WORKS: { baseGoldCost: 0, manpowerCost: 300, resourceCost: { resource: "TITANIUM", amount: 40 } },
  CRYSTAL_SYNTHESIZER: { baseGoldCost: 0, manpowerCost: 150 },
  ADVANCED_CRYSTAL_SYNTHESIZER: { baseGoldCost: 0, manpowerCost: 300, resourceCost: { resource: "CRYSTAL", amount: 40 } },
  CARAVANARY: { baseGoldCost: 0, manpowerCost: 150 },
  FOUNDRY: { baseGoldCost: 0, manpowerCost: 300 },
  GARRISON_HALL: { baseGoldCost: 0, manpowerCost: 150 },
  CUSTOMS_HOUSE: { baseGoldCost: 0, manpowerCost: 100 },
  RAIL_DEPOT: { baseGoldCost: 0, manpowerCost: 300 },
  GOVERNORS_OFFICE: { baseGoldCost: 0, manpowerCost: 150 },
  RADAR_SYSTEM: { baseGoldCost: 0, manpowerCost: 300 },
  QUARTERMASTERS_OFFICE: { baseGoldCost: 0, manpowerCost: 150 },
  LOGISTICS_GUILD: { baseGoldCost: 0, manpowerCost: 150 },
  ASSEMBLY_WORKS: { baseGoldCost: 0, manpowerCost: 300 },
  // Retired (see structure-registry-economic.ts) — not in ECONOMIC_SPECS so
  // it can no longer be built, but the cost definition stays here since
  // STRUCTURE_COST_DEFINITIONS is a Record over the full BuildableStructureType
  // union, and any legacy copy a player still owns may read from it.
  WEAPONS_WORKSHOP: { baseGoldCost: 0, manpowerCost: 100 },
  // Each Titanium/Umbrite Weapons Factory can be built without limit
  // anywhere to specialize their war economy, so the per-copy BASE cost
  // stays low. Unlike Weapons Workshop, each additional copy (anywhere in
  // the empire — confirmed scope, not per-town) costs more manpower than the
  // last: `scaling` here is consumed by structureBuildManpowerCost (below),
  // not structureBuildGoldCost — a deliberate departure from every other use
  // of `scaling` in this table, which only ever multiplies the (globally
  // zeroed) gold cost. First-pass rate, expect tuning.
  TITANIUM_WEAPONS_FACTORY: { baseGoldCost: 0, manpowerCost: 100, scaling: { kind: "incremental", rate: 0.15 } },
  UMBRITE_WEAPONS_FACTORY: { baseGoldCost: 0, manpowerCost: 100, scaling: { kind: "incremental", rate: 0.15 } },
  IMPERIAL_EXCHANGE_PART_1: { baseGoldCost: 0, manpowerCost: 1_000 },
  IMPERIAL_EXCHANGE_PART_2: { baseGoldCost: 0, manpowerCost: 1_000 },
  IMPERIAL_EXCHANGE_PART_3: { baseGoldCost: 0, manpowerCost: 1_000 },
  WORLD_ENGINE_PART_1: { baseGoldCost: 0, manpowerCost: 1_000 },
  WORLD_ENGINE_PART_2: { baseGoldCost: 0, manpowerCost: 1_000 },
  WORLD_ENGINE_PART_3: { baseGoldCost: 0, manpowerCost: 1_000 },
  AEGIS_DOME_PART_1: { baseGoldCost: 0, manpowerCost: 1_000 },
  AEGIS_DOME_PART_2: { baseGoldCost: 0, manpowerCost: 1_000 },
  AEGIS_DOME_PART_3: { baseGoldCost: 0, manpowerCost: 1_000 },
  ASTRAL_DOCK_PART_1: { baseGoldCost: 0, manpowerCost: 1_000 },
  ASTRAL_DOCK_PART_2: { baseGoldCost: 0, manpowerCost: 1_000 },
  ASTRAL_DOCK_PART_3: { baseGoldCost: 0, manpowerCost: 1_000 },
  POPULATION_BUREAU_PART_1: { baseGoldCost: 0, manpowerCost: 1_000 },
  POPULATION_BUREAU_PART_2: { baseGoldCost: 0, manpowerCost: 1_000 },
  POPULATION_BUREAU_PART_3: { baseGoldCost: 0, manpowerCost: 1_000 },
  TITANIUM_LEVY_PART_1: { baseGoldCost: 0, manpowerCost: 1_000 },
  TITANIUM_LEVY_PART_2: { baseGoldCost: 0, manpowerCost: 1_000 },
  TITANIUM_LEVY_PART_3: { baseGoldCost: 0, manpowerCost: 1_000 },
  IMPERIAL_EXCHANGE: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } },
  WORLD_ENGINE: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } },
  AEGIS_DOME: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } },
  ASTRAL_DOCK: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } },
  POPULATION_BUREAU: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } },
  TITANIUM_LEVY: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } }
};

// ── Fort tier ladder ───────────────────────────────────────────────
// Single source of truth for fort variant costs and combat multipliers.
// Used by the simulation (runtime.ts), game-domain (fortAttackManpowerMultiplier),
// and the client (action logic, optimistic state, UI controls, menu view).

export type FortTierInfo = {
  variant: FortVariant;
  gold: number;
  titanium: number;
  manpower: number;
  defenseMult: number;
};

export const FORT_TIER_LADDER: Record<FortVariant, FortTierInfo> = {
  WOODEN_FORT:      { variant: "WOODEN_FORT",      gold: 0,  titanium: 0,   manpower: 150, defenseMult: 1.35 },
  FORT:             { variant: "FORT",             gold: 0,  titanium: 45,  manpower: 300, defenseMult: 2.5 },
  TITANIUM_BASTION: { variant: "TITANIUM_BASTION", gold: 0,  titanium: 90,  manpower: 480, defenseMult: 4 },
  THUNDER_BASTION:  { variant: "THUNDER_BASTION",  gold: 0,  titanium: 180, manpower: 960, defenseMult: 8 },
};

// Manpower an attacker risks losing hitting a SETTLED target, and the
// muster they must have committed to launch the attack at all (the range's
// max — you can never lose more than you brought). Uniform-random within
// the range regardless of whether the attack wins or loses: replaces the
// old win-cheap/loss-expensive formula, which scaled the same direction as
// win chance itself and let stronger empires steamroll weaker ones both
// more often AND more cheaply. "NONE" covers a SETTLED target with no
// active fort. Barbarian/FRONTIER targets use their own separate (much
// cheaper) raid constants in config.ts and are not covered by this table.
// Each tier's `max` here currently equals that same tier's FORT_TIER_LADDER
// `manpower` (build cost) above — a deliberate design choice ("attacking it
// costs as much as building it"), not a derived/enforced invariant. The two
// tables are independent; a future rebalance of one does not have to touch
// the other, but if you change one and mean to keep them matched, update
// both by hand.
export type AttackManpowerLossRange = { min: number; max: number };

export const ATTACK_MANPOWER_LOSS_RANGE: Record<"NONE" | FortVariant, AttackManpowerLossRange> = {
  NONE:             { min: 40,  max: 60 },
  WOODEN_FORT:      { min: 100, max: 150 },
  FORT:             { min: 200, max: 300 },
  TITANIUM_BASTION: { min: 350, max: 480 },
  THUNDER_BASTION:  { min: 800, max: 960 },
};

export const attackManpowerLossRangeForFort = (fortVariant: FortVariant | undefined): AttackManpowerLossRange =>
  ATTACK_MANPOWER_LOSS_RANGE[fortVariant ?? "NONE"];

export const requiredMusterForFort = (fortVariant: FortVariant | undefined): number =>
  attackManpowerLossRangeForFort(fortVariant).max;

export const FORT_VARIANT_LABELS: Record<FortVariant, string> = {
  WOODEN_FORT: "Palisade",
  FORT: "Fort",
  TITANIUM_BASTION: "Titanium Bastion",
  THUNDER_BASTION: "Thunder Bastion",
};

export const bestFortTierForTech = (has: (id: string) => boolean): FortTierInfo => {
  if (has("steelworking")) return FORT_TIER_LADDER.THUNDER_BASTION;
  if (has("fortified-walls")) return FORT_TIER_LADDER.TITANIUM_BASTION;
  return FORT_TIER_LADDER.FORT;
};

export const nextFortTierForUpgrade = (
  current: FortVariant | undefined,
  has: (id: string) => boolean,
): FortTierInfo | null => {
  const resolved = current ?? "FORT";
  if (resolved === "WOODEN_FORT") return FORT_TIER_LADDER.FORT;
  if (resolved === "FORT" && has("fortified-walls")) return FORT_TIER_LADDER.TITANIUM_BASTION;
  if (resolved === "TITANIUM_BASTION" && has("steelworking")) return FORT_TIER_LADDER.THUNDER_BASTION;
  return null;
};

// ── Siege outpost tier ladder ──────────────────────────────────────
// Single source of truth for siege outpost variant costs and attack multipliers.
// Attack mults match the config constants used by outpost-aura.ts at combat time.

export type SiegeTierInfo = {
  variant: SiegeOutpostVariant;
  gold: number;
  umbrite: number;
  titanium: number;
  manpower: number;
  attackMult: number;
};

export const SIEGE_TIER_LADDER: Record<SiegeOutpostVariant, SiegeTierInfo> = {
  SIEGE_OUTPOST: { variant: "SIEGE_OUTPOST", gold: 0, umbrite: 45,  titanium: 0,   manpower: 60, attackMult: 1.6 },
  SIEGE_TOWER:   { variant: "SIEGE_TOWER",   gold: 0, umbrite: 90,  titanium: 60,  manpower: 60, attackMult: 1.8 },
  DREAD_TOWER:   { variant: "DREAD_TOWER",   gold: 0, umbrite: 140, titanium: 120, manpower: 60, attackMult: 2.0 },
};

export const SIEGE_VARIANT_LABELS: Record<SiegeOutpostVariant, string> = {
  SIEGE_OUTPOST: "Siege Outpost",
  SIEGE_TOWER: "Siege Tower",
  DREAD_TOWER: "Dread Tower",
};

export const bestSiegeTierForTech = (has: (id: string) => boolean): SiegeTierInfo => {
  if (has("standing-army")) return SIEGE_TIER_LADDER.DREAD_TOWER;
  if (has("siegecraft")) return SIEGE_TIER_LADDER.SIEGE_TOWER;
  return SIEGE_TIER_LADDER.SIEGE_OUTPOST;
};

export const nextSiegeTierForUpgrade = (
  current: SiegeOutpostVariant | undefined,
  has: (id: string) => boolean,
): SiegeTierInfo | null => {
  const resolved = current ?? "SIEGE_OUTPOST";
  if (resolved === "SIEGE_OUTPOST" && has("siegecraft")) return SIEGE_TIER_LADDER.SIEGE_TOWER;
  if (resolved === "SIEGE_TOWER" && has("standing-army")) return SIEGE_TIER_LADDER.DREAD_TOWER;
  return null;
};

export const structureCostDefinition = (type: BuildableStructureType): StructureCostDefinition => STRUCTURE_COST_DEFINITIONS[type];

export const structureBaseGoldCost = (type: BuildableStructureType): number => STRUCTURE_COST_DEFINITIONS[type].baseGoldCost;

export const structureBuildManpowerCost = (type: BuildableStructureType): number =>
  STRUCTURE_COST_DEFINITIONS[type].manpowerCost ?? 0;

export const structureBuildGoldCost = (type: BuildableStructureType, existingCount: number): number => {
  const definition = STRUCTURE_COST_DEFINITIONS[type];
  if (!definition.scaling) return definition.baseGoldCost;
  if (definition.scaling.kind === "doubling") return definition.baseGoldCost * 2 ** existingCount;
  return Math.ceil(definition.baseGoldCost * (1 + definition.scaling.rate) ** existingCount);
};

// Titanium/Umbrite Weapons Factory only (§ design doc "escalating build
// cost"): every other structure's `scaling` field multiplies baseGoldCost,
// which is globally zeroed above, so it's inert. These two are the one
// place `scaling` is meant to multiply the real (manpower) cost instead —
// kept as a separate function rather than changing
// structureBuildManpowerCost's signature for every caller, since every
// other structure's manpower cost is still a flat, non-scaling constant.
const MANPOWER_SCALING_STRUCTURE_TYPES: ReadonlySet<BuildableStructureType> = new Set([
  "TITANIUM_WEAPONS_FACTORY",
  "UMBRITE_WEAPONS_FACTORY"
]);

export const structureBuildManpowerCostScaled = (type: BuildableStructureType, existingCount: number): number => {
  const definition = STRUCTURE_COST_DEFINITIONS[type];
  const base = definition.manpowerCost ?? 0;
  if (!definition.scaling || !MANPOWER_SCALING_STRUCTURE_TYPES.has(type)) return base;
  if (definition.scaling.kind === "doubling") return base * 2 ** existingCount;
  return Math.ceil(base * (1 + definition.scaling.rate) ** existingCount);
};

export const economicStructureBuildDurationMs = (type: EconomicStructureType): number => {
  if (type === "WOODEN_FORT") return WOODEN_FORT_BUILD_MS;
  if (type === "RELAY_BEACON") return RELAY_BEACON_BUILD_MS;
  return ECONOMIC_STRUCTURE_BUILD_MS;
};

export const structureBuildDurationMs = (type: BuildableStructureType): number => {
  if (type === "FORT") return FORT_BUILD_MS;
  if (type === "OBSERVATORY") return OBSERVATORY_BUILD_MS;
  if (type === "SIEGE_OUTPOST") return SIEGE_OUTPOST_BUILD_MS;
  return economicStructureBuildDurationMs(type);
};
