import type { EconomicStructureType } from "./types.js";

export type StrategicResourceCostType = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL";
export type BuildableStructureType = "FORT" | "OBSERVATORY" | "SIEGE_OUTPOST" | EconomicStructureType;

type StructureScaling =
  | { kind: "doubling" }
  | { kind: "incremental"; rate: number };

export type StructureCostDefinition = {
  baseGoldCost: number;
  resourceCost?: { resource: StrategicResourceCostType; amount: number };
  resourceOptions?: readonly StrategicResourceCostType[];
  scaling?: StructureScaling;
};

const STRUCTURE_COST_DEFINITIONS: Record<BuildableStructureType, StructureCostDefinition> = {
  FORT: {
    baseGoldCost: 900,
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
    resourceCost: { resource: "SUPPLY", amount: 45 },
    scaling: { kind: "incremental", rate: 0.1 }
  },
  FARMSTEAD: { baseGoldCost: 700, resourceCost: { resource: "FOOD", amount: 20 } },
  CAMP: { baseGoldCost: 800, resourceCost: { resource: "SUPPLY", amount: 30 } },
  MINE: { baseGoldCost: 800, resourceCost: { resource: "IRON", amount: 30 }, resourceOptions: ["IRON", "CRYSTAL"] },
  MARKET: { baseGoldCost: 1_200, resourceCost: { resource: "CRYSTAL", amount: 40 } },
  GRANARY: { baseGoldCost: 700, resourceCost: { resource: "FOOD", amount: 40 } },
  BANK: { baseGoldCost: 1_600, resourceCost: { resource: "CRYSTAL", amount: 60 } },
  AIRPORT: {
    baseGoldCost: 3_000,
    resourceCost: { resource: "CRYSTAL", amount: 80 },
    scaling: { kind: "doubling" }
  },
  WOODEN_FORT: {
    baseGoldCost: 900,
    scaling: { kind: "incremental", rate: 0.1 }
  },
  LIGHT_OUTPOST: {
    baseGoldCost: 900,
    scaling: { kind: "incremental", rate: 0.1 }
  },
  FUR_SYNTHESIZER: { baseGoldCost: 2_200 },
  ADVANCED_FUR_SYNTHESIZER: { baseGoldCost: 4_000, resourceCost: { resource: "SUPPLY", amount: 40 } },
  IRONWORKS: { baseGoldCost: 2_400 },
  ADVANCED_IRONWORKS: { baseGoldCost: 4_200, resourceCost: { resource: "IRON", amount: 40 } },
  CRYSTAL_SYNTHESIZER: { baseGoldCost: 2_800 },
  ADVANCED_CRYSTAL_SYNTHESIZER: { baseGoldCost: 4_800, resourceCost: { resource: "CRYSTAL", amount: 40 } },
  FUEL_PLANT: { baseGoldCost: 3_200 },
  CARAVANARY: { baseGoldCost: 1_800, resourceCost: { resource: "CRYSTAL", amount: 60 } },
  FOUNDRY: { baseGoldCost: 4_500 },
  GARRISON_HALL: { baseGoldCost: 2_200, resourceCost: { resource: "CRYSTAL", amount: 80 } },
  CUSTOMS_HOUSE: { baseGoldCost: 1_800, resourceCost: { resource: "CRYSTAL", amount: 60 } },
  GOVERNORS_OFFICE: { baseGoldCost: 2_600 },
  RADAR_SYSTEM: { baseGoldCost: 4_000, resourceCost: { resource: "CRYSTAL", amount: 120 } }
};

export const structureCostDefinition = (type: BuildableStructureType): StructureCostDefinition => STRUCTURE_COST_DEFINITIONS[type];

export const structureBaseGoldCost = (type: BuildableStructureType): number => STRUCTURE_COST_DEFINITIONS[type].baseGoldCost;

export const structureBuildGoldCost = (type: BuildableStructureType, existingCount: number): number => {
  const definition = STRUCTURE_COST_DEFINITIONS[type];
  if (!definition.scaling) return definition.baseGoldCost;
  if (definition.scaling.kind === "doubling") return definition.baseGoldCost * 2 ** existingCount;
  return Math.ceil(definition.baseGoldCost * (1 + definition.scaling.rate) ** existingCount);
};
