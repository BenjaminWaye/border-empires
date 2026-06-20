import type { DomainTileState } from "@border-empires/game-domain";
import {
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS,
  FUR_SYNTHESIZER_GOLD_UPKEEP,
  IRONWORKS_GOLD_UPKEEP
} from "@border-empires/game-domain";
import type { EconomicStructureType } from "@border-empires/shared";
export { TECH_REQUIREMENTS_BY_STRUCTURE } from "@border-empires/shared";

import type { StrategicResourceKey } from "../runtime-types.js";

export const strategicResourceForTile = (resource: DomainTileState["resource"] | undefined): StrategicResourceKey | undefined => {
  switch (resource) {
    case "FARM":
    case "FISH":
      return "FOOD";
    case "IRON":
      return "IRON";
    case "GEMS":
      return "CRYSTAL";
    case "FUR":
      return "SUPPLY";
    default:
      return undefined;
  }
};

export const upgradeBaseTypeForEconomicStructure = (type: EconomicStructureType): EconomicStructureType | undefined => {
  if (type === "ADVANCED_FUR_SYNTHESIZER") return "FUR_SYNTHESIZER";
  if (type === "ADVANCED_IRONWORKS") return "IRONWORKS";
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER") return "CRYSTAL_SYNTHESIZER";
  if (type === "SEED_GRANARY") return "GRANARY";
  return undefined;
};

export const isConverterStructureType = (structureType: EconomicStructureType): boolean =>
  structureType === "FUR_SYNTHESIZER" ||
  structureType === "ADVANCED_FUR_SYNTHESIZER" ||
  structureType === "IRONWORKS" ||
  structureType === "ADVANCED_IRONWORKS" ||
  structureType === "CRYSTAL_SYNTHESIZER" ||
  structureType === "ADVANCED_CRYSTAL_SYNTHESIZER";

export const economicStructureGoldUpkeepPerInterval = (structureType: EconomicStructureType): number => {
  const perMinute =
    structureType === "ADVANCED_FUR_SYNTHESIZER" || structureType === "FUR_SYNTHESIZER" ? FUR_SYNTHESIZER_GOLD_UPKEEP / 10
      : structureType === "IRONWORKS" || structureType === "ADVANCED_IRONWORKS" ? IRONWORKS_GOLD_UPKEEP / 10
      : structureType === "CRYSTAL_SYNTHESIZER" || structureType === "ADVANCED_CRYSTAL_SYNTHESIZER" ? CRYSTAL_SYNTHESIZER_GOLD_UPKEEP / 10
      : 0;
  return perMinute * (ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS / 60_000);
};

export const TOWN_CAPTURE_SHOCK_MS = 10 * 60 * 1000;
export const TOWN_CAPTURE_POPULATION_LOSS_MULT = 0.95;

export const isTownInCaptureShock = (town: DomainTileState["town"] | undefined, nowMs: number): boolean =>
  typeof town?.captureShockUntil === "number" && town.captureShockUntil > nowMs;
