import {
  FORT_TIER_LADDER, SIEGE_TIER_LADDER, structureBuildManpowerCost, structureCostDefinition, type BuildableStructureType
} from "@border-empires/shared";
import type { StructureInfoKey } from "./client-map-display.js";

export type StructureBaseKey =
  | "FORT"
  | "OBSERVATORY"
  | "SIEGE_BATTERY"
  | "HYDROGARDEN"
  | "UMBRITE_RIG"
  | "MINE"
  | "MINTWORKS"
  | "INCUBATION_ENGINE"
  | "CENSUS_HALL"
  | "CLEARING_HOUSE"
  | "TRADE_NEXUS"
  | "SKY_DOCK"
  | "AMBARIC_TRANSFORMER"
  | "PALISADE"
  | "RELAY_BEACON"
  | "UMBRITE_WORKS"
  | "HIGH_YIELD_UMBRITE_WORKS"
  | "TITANIUM_WORKS"
  | "HIGH_YIELD_TITANIUM_WORKS"
  | "AETHER_CONDENSER"
  | "HIGH_YIELD_AETHER_CONDENSER"
  | "ORE_REFINERY"
  | "ANCILLARY_DEPOT"
  | "HARBOR_EXCHANGE"
  | "NEURAL_WORKS"
  | "MINISTRY_HALL"
  | "RESONANCE_GRID"
  | "QUARTERMASTERS_OFFICE"
  | "ANCILLARY_FACTORY"
  | "RESERVE_LATTICE"
  | "ASTRAL_DOCK_PART_1"
  | "ASTRAL_DOCK_PART_2"
  | "ASTRAL_DOCK_PART_3"
  | "ASTRAL_DOCK"
  | "IMPERIAL_EXCHANGE_PART_1"
  | "IMPERIAL_EXCHANGE_PART_2"
  | "IMPERIAL_EXCHANGE_PART_3"
  | "SOVEREIGN_SIEGE_ENGINE_PART_1"
  | "SOVEREIGN_SIEGE_ENGINE_PART_2"
  | "SOVEREIGN_SIEGE_ENGINE_PART_3"
  | "AEGIS_DOME_PART_1"
  | "AEGIS_DOME_PART_2"
  | "AEGIS_DOME_PART_3"
  | "AEGIS_DOME"
  | "IMPERIAL_EXCHANGE"
  | "SOVEREIGN_SIEGE_ENGINE"
  | "CENSUS_DIRECTORATE_PART_1"
  | "CENSUS_DIRECTORATE_PART_2"
  | "CENSUS_DIRECTORATE_PART_3"
  | "CENSUS_DIRECTORATE"
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
  if (key === "SIEGE_TOWER") return "SIEGE_BATTERY";
  if (key === "DREAD_TOWER") return "SIEGE_BATTERY";
  if (key === "HYDROWORKS") return "HYDROGARDEN";
  if (key === "NEURAL_WORKS") return "NEURAL_WORKS";
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
// Higher fort/siege tiers aren't in STRUCTURE_COST_DEFINITIONS (only their
// base tier -- FORT, SIEGE_BATTERY -- is; the rest is tier-upgrade cost
// resolved server-side from FORT_TIER_LADDER/SIEGE_TIER_LADDER, see
// runtime-structure-command-handlers.ts). Read live from those same ladders
// here instead of a hand-maintained literal, so this never drifts from what
// the server actually charges (docs/replenishment-update-plan.md D17).
const tierLadderCostBits = (gold: number, manpower: number): string[] => {
  const bits: string[] = [];
  if (gold > 0) bits.push(`${gold.toLocaleString()} coin`);
  if (manpower > 0) bits.push(`${manpower.toLocaleString()} manpower`);
  return bits;
};

export const costBitsFor = (key: StructureInfoKey): string[] => {
  if (key === "TITANIUM_BASTION" || key === "THUNDER_BASTION") {
    const tier = FORT_TIER_LADDER[key];
    return tierLadderCostBits(tier.gold, tier.manpower);
  }
  if (key === "SIEGE_TOWER" || key === "DREAD_TOWER") {
    const tier = SIEGE_TIER_LADDER[key];
    return tierLadderCostBits(tier.gold, tier.manpower);
  }
  const baseKey = structureBaseKey(key);
  const costDefinition = structureCostDefinition(baseKey);
  const bits = costDefinition.baseGoldCost > 0 ? [`${costDefinition.baseGoldCost.toLocaleString()} coin`] : [];
  const manpowerCost = structureBuildManpowerCost(baseKey as BuildableStructureType);
  if (manpowerCost > 0) bits.push(`${manpowerCost.toLocaleString()} manpower`);
  if (costDefinition.resourceCost?.resource === "SHARD") {
    bits.push(`${costDefinition.resourceCost.amount.toLocaleString()} shard`);
  }
  return bits;
};
