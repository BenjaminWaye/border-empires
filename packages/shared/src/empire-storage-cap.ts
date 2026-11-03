// TITANIUM/CRYSTAL/UMBRITE are slot-based, not stockpiled —
// they never carried a storage cap to begin with
// once Slice B retired their production. FOOD is the only resource still
// gated by a real stockpile cap. GOLD is uncapped
// (docs/replenishment-update-plan.md D4 removed the gold cap) —
// computeEmpireStorageCap (apps/simulation) always returns
// Number.MAX_SAFE_INTEGER for it.
export type EmpireStorageCap = {
  GOLD: number;
  FOOD: number;
};

// Minimum floor so new players with zero food production always have some
// storage. 24 hours of even the lowest realistic income produces more than
// this, so it only matters at the very start of a season. GOLD keeps a
// floor value here only because EmpireStorageCap's shape requires one for
// every key — computeEmpireStorageCap never reads EMPIRE_STORAGE_FLOOR.GOLD,
// since gold is uncapped.
export const EMPIRE_STORAGE_FLOOR: EmpireStorageCap = {
  GOLD: 10,
  FOOD: 40
};
