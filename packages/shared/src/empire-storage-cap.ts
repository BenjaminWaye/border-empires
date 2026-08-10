// TITANIUM/CRYSTAL/UMBRITE are slot-based, not stockpiled (docs/manpower-economy-
// rewrite-plan.md §5, §5.6) — they never carried a storage cap to begin with
// once Slice B retired their production. GOLD/FOOD/SHARD are the only
// resources still gated by a real stockpile cap.
export type EmpireStorageCap = {
  GOLD: number;
  FOOD: number;
  SHARD: number;
};

// Minimum floors so new players with zero production always have some storage.
// 24 hours of even the lowest realistic income produces more than this, so the
// floors only matter at the very start of a season.
export const EMPIRE_STORAGE_FLOOR: EmpireStorageCap = {
  GOLD: 10,
  FOOD: 40,
  SHARD: 3
};
