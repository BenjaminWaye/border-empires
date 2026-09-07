// Save/restore glue between runtime.manpowerLossByTileKey and the season
// summary store's season_deadliest_tiles row. Kept separate from
// deadliest-tiles.ts (which season-summary-store.ts imports for its types) so
// the store type can be referenced here without an import cycle, and separate
// from simulation-service.ts, which is over the 500-line cap and may not grow.
import type { SeasonSummaryStore } from "../season-summary-store.js";
import { seedDeadliestTiles, topDeadliestTiles } from "./deadliest-tiles.js";

/**
 * Persists the current top-K. Called on the season summary's existing persist
 * cadence (persistCurrentSummary throttles to >=15s unless forced), so this
 * adds one small upsert to a write that was already happening rather than a
 * new timer or a new hot-path write.
 */
export const persistDeadliestTiles = async (
  store: SeasonSummaryStore,
  seasonId: string,
  manpowerLossByTileKey: ReadonlyMap<string, number>
): Promise<void> => {
  if (manpowerLossByTileKey.size === 0) return;
  await store.saveDeadliestTiles(seasonId, topDeadliestTiles(manpowerLossByTileKey));
};

/**
 * Restores the previous process's totals into a fresh runtime map.
 *
 * MUST run before the boot-time recomputeAndPersistCurrentSummary: that call
 * persists whatever the map currently holds, so seeding afterwards would let
 * an empty map overwrite the stored row and destroy the very history this is
 * meant to preserve.
 */
export const restoreDeadliestTiles = async (
  store: SeasonSummaryStore,
  seasonId: string,
  manpowerLossByTileKey: Map<string, number>
): Promise<void> => {
  seedDeadliestTiles(manpowerLossByTileKey, await store.loadDeadliestTiles(seasonId));
};
