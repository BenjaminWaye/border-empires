import type { DomainTileState } from "@border-empires/game-domain";
import {
  ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_FUR_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_IRONWORKS_GOLD_UPKEEP_PER_DAY,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS,
  FUR_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  IRONWORKS_GOLD_UPKEEP_PER_DAY,
  UPKEEP_MINUTES_PER_DAY
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

export const economicStructureGoldUpkeepPerInterval = (
  structureType: EconomicStructureType,
  mode?: "SYNTHESIZE" | "EXCHANGE"
): number => {
  // EXCHANGE-mode converters are a gold *source* — they pay no gold upkeep
  // (converter mode flip plan §Phase 4), so re-enabling one is never rejected
  // for an upkeep they don't owe.
  if (mode === "EXCHANGE" && isConverterStructureType(structureType)) return 0;
  const perMinute =
    structureType === "FUR_SYNTHESIZER" ? FUR_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "ADVANCED_FUR_SYNTHESIZER" ? ADVANCED_FUR_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "IRONWORKS" ? IRONWORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "ADVANCED_IRONWORKS" ? ADVANCED_IRONWORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "CRYSTAL_SYNTHESIZER" ? CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "ADVANCED_CRYSTAL_SYNTHESIZER" ? ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : 0;
  return perMinute * (ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS / 60_000);
};

export const TOWN_CAPTURE_SHOCK_MS = 10 * 60 * 1000;
export const TOWN_CAPTURE_POPULATION_LOSS_MULT = 0.95;

export const isTownInCaptureShock = (town: DomainTileState["town"] | undefined, nowMs: number): boolean =>
  typeof town?.captureShockUntil === "number" && town.captureShockUntil > nowMs;
