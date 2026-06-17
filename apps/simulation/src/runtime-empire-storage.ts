import { EMPIRE_STORAGE_FLOOR, type EmpireStorageCap } from "@border-empires/shared";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { StrategicResourceKey } from "./runtime-types.js";

export type { EmpireStorageCap };
export { EMPIRE_STORAGE_FLOOR };

// 12 hours in minutes
const STORAGE_HOURS = 12;
const STORAGE_MINUTES = STORAGE_HOURS * 60;

export const computeEmpireStorageCap = (
  summary: PlayerRuntimeSummary,
  goldIncomePerMinute: number,
  strategicProductionPerMinute: Record<StrategicResourceKey, number>
): EmpireStorageCap => {
  const sp = strategicProductionPerMinute;
  const syn = summary.synthesizerCapBonus;

  // Food cap excludes fish tiles (fish food is perishable — fills cap but doesn't extend it)
  const cappableFoodPerMinute = Math.max(0, sp.FOOD - summary.fishFoodPerMinute);

  return {
    GOLD: Math.max(EMPIRE_STORAGE_FLOOR.GOLD, goldIncomePerMinute * STORAGE_MINUTES),
    FOOD: Math.max(EMPIRE_STORAGE_FLOOR.FOOD, cappableFoodPerMinute * STORAGE_MINUTES),
    IRON: Math.max(EMPIRE_STORAGE_FLOOR.IRON, sp.IRON * STORAGE_MINUTES + syn.IRON),
    CRYSTAL: Math.max(EMPIRE_STORAGE_FLOOR.CRYSTAL, sp.CRYSTAL * STORAGE_MINUTES + syn.CRYSTAL),
    SUPPLY: Math.max(EMPIRE_STORAGE_FLOOR.SUPPLY, sp.SUPPLY * STORAGE_MINUTES + syn.SUPPLY),
    OIL: Math.max(EMPIRE_STORAGE_FLOOR.OIL, sp.OIL * STORAGE_MINUTES),
    SHARD: Math.max(EMPIRE_STORAGE_FLOOR.SHARD, sp.SHARD * STORAGE_MINUTES)
  };
};
