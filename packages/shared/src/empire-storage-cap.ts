// TITANIUM/CRYSTAL/UMBRITE are slot-based, not stockpiled (docs/manpower-economy-
// rewrite-plan.md §5, §5.6) — they never carried a storage cap to begin with
// once Slice B retired their production. FOOD is the only resource still
// gated by a real stockpile cap. GOLD and SHARD are both uncapped
// (docs/replenishment-update-plan.md D4 removed the gold cap, matching
// SHARD's pre-existing "rare enough on its own" exemption) — computeEmpireStorageCap
// (apps/simulation) always returns Number.MAX_SAFE_INTEGER for both.
export type EmpireStorageCap = {
  GOLD: number;
  FOOD: number;
  SHARD: number;
};

// Minimum floor so new players with zero food production always have some
// storage. 24 hours of even the lowest realistic income produces more than
// this, so it only matters at the very start of a season. GOLD/SHARD keep a
// floor value here only because EmpireStorageCap's shape requires one for
// every key — computeEmpireStorageCap never reads EMPIRE_STORAGE_FLOOR.GOLD
// or .SHARD, since both resources are uncapped.
export const EMPIRE_STORAGE_FLOOR: EmpireStorageCap = {
  GOLD: 10,
  FOOD: 40,
  SHARD: 3
};
