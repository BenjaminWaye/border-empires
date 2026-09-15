import {
  structureBuildManpowerCost, structureCostDefinition, type BuildableStructureType
} from "@border-empires/shared";
import type { StructureInfoKey } from "./client-map-display.js";

export type StructureBaseKey =
  | "FORT"
  | "OBSERVATORY"
  | "SIEGE_OUTPOST"
  | "FARMSTEAD"
  | "UMBRITE_RIG"
  | "MINE"
  | "MINTWORKS"
  | "GRANARY"
  | "CENSUS_HALL"
  | "CLEARING_HOUSE"
  | "CARAVANARY"
  | "AIRPORT"
  | "AETHER_TOWER"
  | "WOODEN_FORT"
  | "RELAY_BEACON"
  | "UMBRITE_SYNTHESIZER"
  | "ADVANCED_UMBRITE_SYNTHESIZER"
  | "TITANIUM_WORKS"
  | "ADVANCED_TITANIUM_WORKS"
  | "CRYSTAL_SYNTHESIZER"
  | "ADVANCED_CRYSTAL_SYNTHESIZER"
  | "FOUNDRY"
  | "GARRISON_HALL"
  | "CUSTOMS_HOUSE"
  | "RAIL_DEPOT"
  | "GOVERNORS_OFFICE"
  | "RADAR_SYSTEM"
  | "QUARTERMASTERS_OFFICE"
  | "LOGISTICS_GUILD"
  | "ASSEMBLY_WORKS"
  | "ASTRAL_DOCK_PART_1"
  | "ASTRAL_DOCK_PART_2"
  | "ASTRAL_DOCK_PART_3"
  | "ASTRAL_DOCK"
  | "IMPERIAL_EXCHANGE_PART_1"
  | "IMPERIAL_EXCHANGE_PART_2"
  | "IMPERIAL_EXCHANGE_PART_3"
  | "WORLD_ENGINE_PART_1"
  | "WORLD_ENGINE_PART_2"
  | "WORLD_ENGINE_PART_3"
  | "AEGIS_DOME_PART_1"
  | "AEGIS_DOME_PART_2"
  | "AEGIS_DOME_PART_3"
  | "AEGIS_DOME"
  | "IMPERIAL_EXCHANGE"
  | "WORLD_ENGINE"
  | "POPULATION_BUREAU_PART_1"
  | "POPULATION_BUREAU_PART_2"
  | "POPULATION_BUREAU_PART_3"
  | "POPULATION_BUREAU"
  | "TITANIUM_LEVY_PART_1"
  | "TITANIUM_LEVY_PART_2"
  | "TITANIUM_LEVY_PART_3"
  | "TITANIUM_LEVY"
  | "WEAPONS_WORKSHOP"
  | "TITANIUM_WEAPONS_FACTORY"
  | "UMBRITE_WEAPONS_FACTORY";

export const structureBaseKey = (key: StructureInfoKey): StructureBaseKey => {
  if (key === "TITANIUM_BASTION") return "FORT";
  if (key === "THUNDER_BASTION") return "FORT";
  if (key === "SIEGE_TOWER") return "SIEGE_OUTPOST";
  if (key === "DREAD_TOWER") return "SIEGE_OUTPOST";
  if (key === "WATERWORKS") return "FARMSTEAD";
  if (key === "SEED_GRANARY") return "GRANARY";
  if (key === "RAIL_DEPOT") return "RAIL_DEPOT";
  return key as StructureBaseKey;
};

// FOOD/TITANIUM/CRYSTAL/UMBRITE resourceCost entries in structureCostDefinition
// are vestigial build-time numbers left over from before the resource-slot
// rewrite -- apps/simulation/src/runtime-structure-command-handlers.ts strips
// those four resource keys out of the spend before any build command is
// validated (RETIRED_STOCKPILE_RESOURCE_KEYS), so they are never actually
// charged. Only SHARD is still a real, enforced stockpile spend. The FOOD/
// TITANIUM/CRYSTAL/UMBRITE occupancy cost a structure actually pays is its
// resource SLOT requirement, already shown separately via upkeepBitsFor.
export const costBitsFor = (key: StructureInfoKey): string[] => {
  if (key === "TITANIUM_BASTION") return ["1,800 gold", "480 manpower"];
  if (key === "THUNDER_BASTION") return ["4,200 gold", "960 manpower"];
  if (key === "SIEGE_TOWER") return ["1,800 gold", "60 manpower"];
  if (key === "DREAD_TOWER") return ["4,200 gold", "60 manpower"];
  const baseKey = structureBaseKey(key);
  const costDefinition = structureCostDefinition(baseKey);
  const bits = costDefinition.baseGoldCost > 0 ? [`${costDefinition.baseGoldCost.toLocaleString()} gold`] : [];
  const manpowerCost = structureBuildManpowerCost(baseKey as BuildableStructureType);
  if (manpowerCost > 0) bits.push(`${manpowerCost.toLocaleString()} manpower`);
  if (costDefinition.resourceCost?.resource === "SHARD") {
    bits.push(`${costDefinition.resourceCost.amount.toLocaleString()} shard`);
  }
  return bits;
};
