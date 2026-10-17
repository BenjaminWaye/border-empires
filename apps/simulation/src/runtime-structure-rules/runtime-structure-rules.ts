import type { DomainTileState } from "@border-empires/game-domain";
import {
  HIGH_YIELD_AETHER_CONDENSER_GOLD_UPKEEP_PER_DAY,
  HIGH_YIELD_UMBRITE_WORKS_GOLD_UPKEEP_PER_DAY,
  HIGH_YIELD_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  AETHER_CONDENSER_GOLD_UPKEEP_PER_DAY,
  ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS,
  UMBRITE_WORKS_GOLD_UPKEEP_PER_DAY,
  TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  UPKEEP_MINUTES_PER_DAY
} from "@border-empires/game-domain";
import type { EconomicStructureType } from "@border-empires/shared";

export const isConverterStructureType = (structureType: EconomicStructureType): boolean =>
  structureType === "UMBRITE_WORKS" ||
  structureType === "HIGH_YIELD_UMBRITE_WORKS" ||
  structureType === "TITANIUM_WORKS" ||
  structureType === "HIGH_YIELD_TITANIUM_WORKS" ||
  structureType === "AETHER_CONDENSER" ||
  structureType === "HIGH_YIELD_AETHER_CONDENSER";

export const economicStructureGoldUpkeepPerInterval = (
  structureType: EconomicStructureType,
  mode?: "SYNTHESIZE" | "EXCHANGE"
): number => {
  // EXCHANGE-mode converters are a gold *source* — they pay no gold upkeep
  // (converter mode flip plan §Phase 4), so re-enabling one is never rejected
  // for an upkeep they don't owe.
  if (mode === "EXCHANGE" && isConverterStructureType(structureType)) return 0;
  const perMinute =
    structureType === "UMBRITE_WORKS" ? UMBRITE_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "HIGH_YIELD_UMBRITE_WORKS" ? HIGH_YIELD_UMBRITE_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "TITANIUM_WORKS" ? TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "HIGH_YIELD_TITANIUM_WORKS" ? HIGH_YIELD_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "AETHER_CONDENSER" ? AETHER_CONDENSER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : structureType === "HIGH_YIELD_AETHER_CONDENSER" ? HIGH_YIELD_AETHER_CONDENSER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY
      : 0;
  return perMinute * (ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS / 60_000);
};

export const TOWN_CAPTURE_SHOCK_MS = 10 * 60 * 1000;
export const TOWN_CAPTURE_POPULATION_LOSS_MULT = 0.95;

export const isTownInCaptureShock = (town: DomainTileState["town"] | undefined, nowMs: number): boolean =>
  typeof town?.captureShockUntil === "number" && town.captureShockUntil > nowMs;
