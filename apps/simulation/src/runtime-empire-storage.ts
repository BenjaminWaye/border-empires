import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";

export type EmpireStorageCap = {
  GOLD: number;
  FOOD: number;
  IRON: number;
  CRYSTAL: number;
  SUPPLY: number;
  OIL: number;
  SHARD: number;
};

// 12 hours in minutes
const STORAGE_HOURS = 12;
const STORAGE_MINUTES = STORAGE_HOURS * 60;

// Minimum floors so new players always have some storage
export const EMPIRE_STORAGE_FLOOR: EmpireStorageCap = {
  GOLD: 500,
  FOOD: 40,
  IRON: 15,
  CRYSTAL: 15,
  SUPPLY: 20,
  OIL: 10,
  SHARD: 3
};

export const computeEmpireStorageCap = (
  summary: PlayerRuntimeSummary,
  goldIncomePerMinute: number
): EmpireStorageCap => {
  const sp = summary.strategicProductionPerMinute;
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
