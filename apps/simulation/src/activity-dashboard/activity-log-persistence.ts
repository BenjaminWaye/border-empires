// Durable backing for the two rolling 24h activity feeds -- territory-flip-log
// and combat-manpower-log -- that produce GET /api/activity's wars, territory
// momentum, biggest swing, frontline hotspots, manpowerLost24h and
// biggestBattle24h (and, through those, the daily Slack digest).
//
// Both logs are in-memory only and rebuilt empty on restart, so every prod
// deploy silently reset the dashboard's "today" to whatever had happened since
// that deploy. Those numbers are presented as a trailing 24h, so a deploy made
// them quietly wrong rather than obviously missing.
//
// Why a bounded-tail blob on the season summary's existing persist cadence
// rather than append-only rows through the SQLite writer worker:
//   - The 50,000-entry caps on both logs are safety valves, not expected size.
//     Real prod traffic is ~1,588 manpower across on the order of 100 battles
//     and a few hundred tile flips per 24h -- hundreds of entries, not tens of
//     thousands. A bounded tail therefore captures the whole real window in a
//     blob of tens of KB.
//   - That makes a per-record write path through the writer worker (plus a
//     chunked prune and a new table) a large amount of machinery, on the
//     hottest path in the sim, for data a single small periodic upsert already
//     covers. Fewer moving parts on that path is worth more here than
//     exactness at the 50k tail.
//
// ACTIVITY_LOG_PERSIST_LIMIT keeps that reasoning honest under a burst: past
// the limit the OLDEST entries are dropped (the newest window is what the
// aggregations report), so an implausibly hot day degrades to a shorter
// restored window instead of an unbounded blob.
import type { ActivityDashboardSnapshot, DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { buildActivityDashboardSnapshot } from "./activity-dashboard-snapshot.js";
import type { CombatManpowerLog, CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import type { TerritoryFlip, TerritoryFlipLog } from "../territory-flip-log/territory-flip-log.js";

/**
 * Per-log cap on what is persisted. ~10-30x realistic 24h traffic, and well
 * under each log's own 50,000-entry safety cap.
 */
export const ACTIVITY_LOG_PERSIST_LIMIT = 5_000;

export type PersistedActivityLogs = {
  flips: TerritoryFlip[];
  combat: CombatManpowerLoss[];
};

/** The newest `limit` entries, oldest-first (the order the logs store them in). */
const newestTail = <T>(entries: readonly T[], limit: number): T[] =>
  entries.length > limit ? entries.slice(entries.length - limit) : [...entries];

export const exportActivityLogs = (
  flipLog: Pick<TerritoryFlipLog, "entries">,
  combatLog: Pick<CombatManpowerLog, "entries">,
  limit: number = ACTIVITY_LOG_PERSIST_LIMIT
): PersistedActivityLogs => ({
  flips: newestTail(flipLog.entries(), limit),
  combat: newestTail(combatLog.entries(), limit)
});

/**
 * Reseeds both logs on boot. Each log's own restore() drops entries already
 * outside its 24h window, so a process that was down for more than a day
 * correctly comes back with nothing rather than stale "today" numbers.
 */
export const restoreActivityLogs = (
  flipLog: Pick<TerritoryFlipLog, "restore">,
  combatLog: Pick<CombatManpowerLog, "restore">,
  logs: PersistedActivityLogs | undefined,
  now: number
): void => {
  if (!logs) return;
  if (Array.isArray(logs.flips)) flipLog.restore(logs.flips, now);
  if (Array.isArray(logs.combat)) combatLog.restore(logs.combat, now);
};

/**
 * Prunes both logs to their 24h window and builds the dashboard snapshot.
 *
 * Extracted from SimulationRuntime.exportActivityDashboardSnapshot so runtime.ts
 * (far over the repo's 500-line cap, and so may not grow) can expose the
 * persistence accessors above; the prune-then-build pairing lives naturally
 * beside the persistence helpers that share these two logs.
 */
export const exportActivityDashboardSnapshotFrom = (
  flipLog: Pick<TerritoryFlipLog, "entries" | "prune">,
  combatLog: Pick<CombatManpowerLog, "entries" | "prune">,
  tiles: ReadonlyMap<string, DomainTileState>,
  players: ReadonlyMap<string, DomainPlayer>,
  now: number
): ActivityDashboardSnapshot => {
  flipLog.prune(now);
  combatLog.prune(now);
  return buildActivityDashboardSnapshot({
    tiles,
    players,
    flipLogEntries: flipLog.entries(),
    combatManpowerLogEntries: combatLog.entries(),
    now
  });
};
