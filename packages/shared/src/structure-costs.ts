import { ECONOMIC_STRUCTURE_BUILD_MS, FORT_BUILD_MS, LIGHT_OUTPOST_BUILD_MS, OBSERVATORY_BUILD_MS, SIEGE_OUTPOST_BUILD_MS, WOODEN_FORT_BUILD_MS } from "./config.js";
import type { EconomicStructureType } from "./types.js";

export type StrategicResourceCostType = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL";
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

const STRUCTURE_COST_DEFINITIONS: Record<BuildableStructureType, StructureCostDefinition> = {
  FORT: {
    baseGoldCost: 900,
    manpowerCost: 300,
    resourceCost: { resource: "IRON", amount: 45 },
    scaling: { kind: "incremental", rate: 0.1 }
  },
  OBSERVATORY: {
    baseGoldCost: 800,
    resourceCost: { resource: "CRYSTAL", amount: 45 },
    scaling: { kind: "doubling" }
  },
  SIEGE_OUTPOST: {
    baseGoldCost: 900,
    manpowerCost: 60,
    resourceCost: { resource: "SUPPLY", amount: 45 },
    scaling: { kind: "incremental", rate: 0.1 }
  },
  FARMSTEAD: { baseGoldCost: 700, resourceCost: { resource: "FOOD", amount: 20 } },
  WATERWORKS: { baseGoldCost: 600, resourceCost: { resource: "FOOD", amount: 20 } },
  CAMP: { baseGoldCost: 800, resourceCost: { resource: "SUPPLY", amount: 30 } },
  MINE: { baseGoldCost: 800, resourceCost: { resource: "IRON", amount: 30 }, resourceOptions: ["IRON", "CRYSTAL"] },
  MARKET: { baseGoldCost: 2_200 },
  GRANARY: { baseGoldCost: 700, resourceCost: { resource: "FOOD", amount: 40 } },
  SEED_GRANARY: { baseGoldCost: 1_400, resourceCost: { resource: "FOOD", amount: 80 } },
  CENSUS_HALL: { baseGoldCost: 900, resourceCost: { resource: "FOOD", amount: 30 } },
  BANK: { baseGoldCost: 3_200 },
  CLEARING_HOUSE: { baseGoldCost: 3_000, resourceCost: { resource: "CRYSTAL", amount: 80 } },
  AIRPORT: {
    baseGoldCost: 3_000,
    resourceCost: { resource: "CRYSTAL", amount: 80 },
    scaling: { kind: "doubling" }
  },
  AETHER_TOWER: {
    baseGoldCost: 6_000,
    resourceCost: { resource: "CRYSTAL", amount: 160 },
    scaling: { kind: "incremental", rate: 0.15 }
  },
  WOODEN_FORT: {
    baseGoldCost: 75,
    manpowerCost: 30,
    scaling: { kind: "incremental", rate: 0.1 }
  },
  LIGHT_OUTPOST: {
    baseGoldCost: 75,
    manpowerCost: 30,
    scaling: { kind: "incremental", rate: 0.1 }
  },
  FUR_SYNTHESIZER: { baseGoldCost: 2_200 },
  ADVANCED_FUR_SYNTHESIZER: { baseGoldCost: 4_000, resourceCost: { resource: "SUPPLY", amount: 40 } },
  IRONWORKS: { baseGoldCost: 2_400 },
  ADVANCED_IRONWORKS: { baseGoldCost: 4_200, resourceCost: { resource: "IRON", amount: 40 } },
  CRYSTAL_SYNTHESIZER: { baseGoldCost: 2_800 },
  ADVANCED_CRYSTAL_SYNTHESIZER: { baseGoldCost: 4_800, resourceCost: { resource: "CRYSTAL", amount: 40 } },
  CARAVANARY: { baseGoldCost: 2_600 },
  FOUNDRY: { baseGoldCost: 4_500 },
  EXCHANGE_HOUSE: { baseGoldCost: 5_000, resourceCost: { resource: "CRYSTAL", amount: 120 } },
  GARRISON_HALL: { baseGoldCost: 2_200, resourceCost: { resource: "CRYSTAL", amount: 80 } },
  CUSTOMS_HOUSE: { baseGoldCost: 1_800, resourceCost: { resource: "CRYSTAL", amount: 60 } },
  RAIL_DEPOT: { baseGoldCost: 4_000, resourceCost: { resource: "CRYSTAL", amount: 100 } },
  GOVERNORS_OFFICE: { baseGoldCost: 2_600 },
  RADAR_SYSTEM: { baseGoldCost: 4_000, resourceCost: { resource: "CRYSTAL", amount: 120 } },
  IMPERIAL_EXCHANGE_PART: { baseGoldCost: 8_000, resourceCost: { resource: "CRYSTAL", amount: 180 } },
  WORLD_ENGINE_PART: { baseGoldCost: 8_000, resourceCost: { resource: "CRYSTAL", amount: 180 } },
  AEGIS_DOME_PART: { baseGoldCost: 8_000, resourceCost: { resource: "CRYSTAL", amount: 180 } },
  ASTRAL_DOCK_PART: { baseGoldCost: 8_000, resourceCost: { resource: "CRYSTAL", amount: 180 } },
  IMPERIAL_EXCHANGE: { baseGoldCost: 18_000, resourceCost: { resource: "SHARD", amount: 2 } },
  WORLD_ENGINE: { baseGoldCost: 18_000, resourceCost: { resource: "SHARD", amount: 2 } },
  AEGIS_DOME: { baseGoldCost: 18_000, resourceCost: { resource: "SHARD", amount: 2 } },
  ASTRAL_DOCK: { baseGoldCost: 18_000, resourceCost: { resource: "SHARD", amount: 2 } }
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
