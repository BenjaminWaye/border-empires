import type { DomainTileState } from "@border-empires/game-domain";
import {
  ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS,
  UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
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
    case "TITANIUM":
      return "TITANIUM";
    case "GEMS":
      return "CRYSTAL";
    case "UMBRITE":
      return "UMBRITE";
    default:
      return undefined;
  }
};

export const upgradeBaseTypeForEconomicStructure = (type: EconomicStructureType): EconomicStructureType | undefined => {
  if (type === "ADVANCED_UMBRITE_SYNTHESIZER") return "UMBRITE_SYNTHESIZER";
  if (type === "ADVANCED_TITANIUM_WORKS") return "TITANIUM_WORKS";
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER") return "CRYSTAL_SYNTHESIZER";
  if (type === "SEED_GRANARY") return "GRANARY";
  return undefined;
};

export const isConverterStructureType = (structureType: EconomicStructureType): boolean =>
  structureType === "UMBRITE_SYNTHESIZER" ||
  structureType === "ADVANCED_UMBRITE_SYNTHESIZER" ||
  structureType === "TITANIUM_WORKS" ||
  structureType === "ADVANCED_TITANIUM_WORKS" ||
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
    structureType === "UMBRITE_SYNTHESIZER" ? UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "ADVANCED_UMBRITE_SYNTHESIZER" ? ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "TITANIUM_WORKS" ? TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "ADVANCED_TITANIUM_WORKS" ? ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "CRYSTAL_SYNTHESIZER" ? CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "ADVANCED_CRYSTAL_SYNTHESIZER" ? ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : 0;
  return perMinute * (ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS / 60_000);
};

export const TOWN_CAPTURE_SHOCK_MS = 10 * 60 * 1000;
export const TOWN_CAPTURE_POPULATION_LOSS_MULT = 0.95;

export const isTownInCaptureShock = (town: DomainTileState["town"] | undefined, nowMs: number): boolean =>
  typeof town?.captureShockUntil === "number" && town.captureShockUntil > nowMs;
