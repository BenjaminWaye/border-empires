// Single entry point for the season state that must survive a process restart
// but deliberately does NOT live in the world snapshot:
//   - per-tile combat damage, behind the end-of-season "deadliest tile"
//     (deadliest-tiles.ts)
//   - the rolling 24h activity feeds behind GET /api/activity and the daily
//     Slack digest (activity-log-persistence.ts)
//
// Both ride the season summary's existing persist cadence (persistCurrentSummary
// throttles to >=15s unless forced), so this adds two small upserts to a write
// that was already happening rather than new timers or new hot-path writes.
// See each module for why a bounded blob beats snapshotting or a per-record
// write path.
//
// The runtime is taken structurally rather than as SimulationRuntime: runtime.ts
// imports activity-log-persistence.ts, so depending on the concrete class here
// would close an import cycle.
import type { PersistedActivityLogs } from "../activity-dashboard/activity-log-persistence.js";
import { persistDeadliestTiles, restoreDeadliestTiles } from "../deadliest-tiles/deadliest-tiles-persistence.js";
import type { SeasonSummaryStore } from "../season-summary-store.js";

type PersistableRuntime = {
  readonly manpowerLossByTileKey: Map<string, number>;
  exportActivityLogs: () => PersistedActivityLogs;
  restoreActivityLogs: (logs: PersistedActivityLogs | undefined) => void;
};

export const persistSeasonActivityState = async (
  store: SeasonSummaryStore,
  seasonId: string,
  runtime: PersistableRuntime
): Promise<void> => {
  await persistDeadliestTiles(store, seasonId, runtime.manpowerLossByTileKey);
  const logs = runtime.exportActivityLogs();
  // Never let empty feeds overwrite stored history: the boot restore is ordered
  // before the first persist so this cannot happen today, but a future
  // reordering would otherwise destroy the history silently. Skipping is safe
  // even for a genuinely quiet 24h -- restore drops out-of-window entries, so
  // stale stored rows can never come back as "today".
  if (logs.flips.length === 0 && logs.combat.length === 0) return;
  await store.saveActivityLogs(seasonId, logs);
};

/**
 * MUST run before the boot-time recomputeAndPersistCurrentSummary: that call
 * persists whatever the runtime currently holds, so restoring afterwards would
 * let this process's empty state overwrite the stored history.
 */
export const restoreSeasonActivityState = async (
  store: SeasonSummaryStore,
  seasonId: string,
  runtime: PersistableRuntime
): Promise<void> => {
  await restoreDeadliestTiles(store, seasonId, runtime.manpowerLossByTileKey);
  runtime.restoreActivityLogs(await store.loadActivityLogs(seasonId));
};
