import { ECONOMIC_STRUCTURE_BUILD_MS, FORT_BUILD_MS, LIGHT_OUTPOST_BUILD_MS, OBSERVATORY_BUILD_MS, SIEGE_OUTPOST_BUILD_MS, WOODEN_FORT_BUILD_MS } from "../config.js";
import type { EconomicStructureType, FortVariant, SiegeOutpostVariant } from "../types.js";

export type StrategicResourceCostType = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD";
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
    resourceCost: { resource: "IRON", amount: 45 },
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
    resourceCost: { resource: "SUPPLY", amount: 45 },
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
  CAMP: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "SUPPLY", amount: 30 } },
  MINE: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "IRON", amount: 30 }, resourceOptions: ["IRON", "CRYSTAL"] },
  MARKET: { baseGoldCost: 0, manpowerCost: 150 },
  GRANARY: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "FOOD", amount: 40 } },
  SEED_GRANARY: { baseGoldCost: 0, manpowerCost: 100, resourceCost: { resource: "FOOD", amount: 80 } },
  CENSUS_HALL: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "FOOD", amount: 30 } },
  BANK: { baseGoldCost: 0, manpowerCost: 300 },
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
  LIGHT_OUTPOST: {
    baseGoldCost: 0,
    manpowerCost: 30,
    scaling: { kind: "incremental", rate: 0.1 }
  },
  FUR_SYNTHESIZER: { baseGoldCost: 0, manpowerCost: 150 },
  ADVANCED_FUR_SYNTHESIZER: { baseGoldCost: 0, manpowerCost: 300, resourceCost: { resource: "SUPPLY", amount: 40 } },
  IRONWORKS: { baseGoldCost: 0, manpowerCost: 150 },
  ADVANCED_IRONWORKS: { baseGoldCost: 0, manpowerCost: 300, resourceCost: { resource: "IRON", amount: 40 } },
  CRYSTAL_SYNTHESIZER: { baseGoldCost: 0, manpowerCost: 150 },
  ADVANCED_CRYSTAL_SYNTHESIZER: { baseGoldCost: 0, manpowerCost: 300, resourceCost: { resource: "CRYSTAL", amount: 40 } },
  CARAVANARY: { baseGoldCost: 0, manpowerCost: 150 },
  FOUNDRY: { baseGoldCost: 0, manpowerCost: 300 },
  EXCHANGE_HOUSE: { baseGoldCost: 0, manpowerCost: 400 },
  GARRISON_HALL: { baseGoldCost: 0, manpowerCost: 150 },
  CUSTOMS_HOUSE: { baseGoldCost: 0, manpowerCost: 100 },
  RAIL_DEPOT: { baseGoldCost: 0, manpowerCost: 300 },
  GOVERNORS_OFFICE: { baseGoldCost: 0, manpowerCost: 150 },
  RADAR_SYSTEM: { baseGoldCost: 0, manpowerCost: 300 },
  IMPERIAL_EXCHANGE_PART: { baseGoldCost: 0, manpowerCost: 1_000 },
  WORLD_ENGINE_PART: { baseGoldCost: 0, manpowerCost: 1_000 },
  AEGIS_DOME_PART: { baseGoldCost: 0, manpowerCost: 1_000 },
  ASTRAL_DOCK_PART: { baseGoldCost: 0, manpowerCost: 1_000 },
  IMPERIAL_EXCHANGE: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } },
  WORLD_ENGINE: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } },
  AEGIS_DOME: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } },
  ASTRAL_DOCK: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } }
};

// ── Fort tier ladder ───────────────────────────────────────────────
// Single source of truth for fort variant costs and combat multipliers.
// Used by the simulation (runtime.ts), game-domain (fortAttackManpowerMultiplier),
// and the client (action logic, optimistic state, UI controls, menu view).

export type FortTierInfo = {
  variant: FortVariant;
  gold: number;
  iron: number;
  manpower: number;
  defenseMult: number;
};

export const FORT_TIER_LADDER: Record<FortVariant, FortTierInfo> = {
  WOODEN_FORT:      { variant: "WOODEN_FORT",      gold: 0,  iron: 15,  manpower: 150, defenseMult: 1.35 },
  FORT:             { variant: "FORT",             gold: 0,  iron: 45,  manpower: 300, defenseMult: 2.5 },
  IRON_BASTION:     { variant: "IRON_BASTION",     gold: 0,  iron: 90,  manpower: 300, defenseMult: 4 },
  THUNDER_BASTION:  { variant: "THUNDER_BASTION",  gold: 0,  iron: 180, manpower: 300, defenseMult: 8 },
};

export const FORT_VARIANT_LABELS: Record<FortVariant, string> = {
  WOODEN_FORT: "Wooden Fort",
  FORT: "Fort",
  IRON_BASTION: "Iron Bastion",
  THUNDER_BASTION: "Thunder Bastion",
};

export const bestFortTierForTech = (has: (id: string) => boolean): FortTierInfo => {
  if (has("steelworking")) return FORT_TIER_LADDER.THUNDER_BASTION;
  if (has("fortified-walls")) return FORT_TIER_LADDER.IRON_BASTION;
  return FORT_TIER_LADDER.FORT;
};

export const nextFortTierForUpgrade = (
  current: FortVariant | undefined,
  has: (id: string) => boolean,
): FortTierInfo | null => {
  const resolved = current ?? "FORT";
  if (resolved === "WOODEN_FORT") return FORT_TIER_LADDER.FORT;
  if (resolved === "FORT" && has("fortified-walls")) return FORT_TIER_LADDER.IRON_BASTION;
  if (resolved === "IRON_BASTION" && has("steelworking")) return FORT_TIER_LADDER.THUNDER_BASTION;
  return null;
};

// ── Siege outpost tier ladder ──────────────────────────────────────
// Single source of truth for siege outpost variant costs and attack multipliers.
// Attack mults match the config constants used by outpost-aura.ts at combat time.

export type SiegeTierInfo = {
  variant: SiegeOutpostVariant;
  gold: number;
  supply: number;
  iron: number;
  manpower: number;
  attackMult: number;
};

export const SIEGE_TIER_LADDER: Record<SiegeOutpostVariant, SiegeTierInfo> = {
  SIEGE_OUTPOST: { variant: "SIEGE_OUTPOST", gold: 0, supply: 45,  iron: 0,   manpower: 60, attackMult: 1.6 },
  SIEGE_TOWER:   { variant: "SIEGE_TOWER",   gold: 0, supply: 90,  iron: 60,  manpower: 60, attackMult: 1.8 },
  DREAD_TOWER:   { variant: "DREAD_TOWER",   gold: 0, supply: 140, iron: 120, manpower: 60, attackMult: 2.0 },
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

export const economicStructureBuildDurationMs = (type: EconomicStructureType): number => {
  if (type === "WOODEN_FORT") return WOODEN_FORT_BUILD_MS;
  if (type === "LIGHT_OUTPOST") return LIGHT_OUTPOST_BUILD_MS;
  return ECONOMIC_STRUCTURE_BUILD_MS;
};

export const structureBuildDurationMs = (type: BuildableStructureType): number => {
  if (type === "FORT") return FORT_BUILD_MS;
  if (type === "OBSERVATORY") return OBSERVATORY_BUILD_MS;
  if (type === "SIEGE_OUTPOST") return SIEGE_OUTPOST_BUILD_MS;
  return economicStructureBuildDurationMs(type);
};
