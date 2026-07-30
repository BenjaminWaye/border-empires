import { EMPIRE_STORAGE_FLOOR, type EmpireStorageCap } from "@border-empires/shared";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { StrategicResourceKey } from "./runtime-types.js";

export type { EmpireStorageCap };
export { EMPIRE_STORAGE_FLOOR };

// 24 hours in minutes
const STORAGE_HOURS = 24;
// Exported so callers computing just the GOLD cap (e.g. metrics gauges) reuse
// this constant instead of duplicating the 12-hour window and risking drift.
export const STORAGE_MINUTES = STORAGE_HOURS * 60;

export const computeEmpireStorageCap = (
  summary: PlayerRuntimeSummary,
  goldIncomePerMinute: number,
  strategicProductionPerMinute: Record<StrategicResourceKey, number>
): EmpireStorageCap => {
  const sp = strategicProductionPerMinute;

  // Food cap excludes fish tiles (fish food is perishable — fills cap but doesn't extend it)
  const cappableFoodPerMinute = Math.max(0, sp.FOOD - summary.fishFoodPerMinute);

  return {
    GOLD: Math.max(EMPIRE_STORAGE_FLOOR.GOLD, goldIncomePerMinute * STORAGE_MINUTES),
    FOOD: Math.max(EMPIRE_STORAGE_FLOOR.FOOD, cappableFoodPerMinute * STORAGE_MINUTES),
    SHARD: Math.max(EMPIRE_STORAGE_FLOOR.SHARD, sp.SHARD * STORAGE_MINUTES)
  };
};
