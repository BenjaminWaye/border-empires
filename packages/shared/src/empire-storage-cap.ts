export type EmpireStorageCap = {
  GOLD: number;
  FOOD: number;
  IRON: number;
  CRYSTAL: number;
  SUPPLY: number;
  SHARD: number;
};

// Minimum floors so new players with zero production always have some storage.
// 12 hours of even the lowest realistic income produces more than this, so the
// floors only matter at the very start of a season.
export const EMPIRE_STORAGE_FLOOR: EmpireStorageCap = {
  GOLD: 500,
  FOOD: 40,
  IRON: 15,
  CRYSTAL: 15,
  SUPPLY: 20,
  SHARD: 3
};
