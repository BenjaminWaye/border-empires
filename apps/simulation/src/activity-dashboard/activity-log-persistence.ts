// Durable backing for the three rolling 24h activity feeds -- territory-flip-
// log, combat-manpower-log, and personal-impact-log. The first two produce
// GET /api/activity's wars, territory momentum, biggest swing, frontline
// hotspots, manpowerLost24h and biggestBattle24h (and, through those, the
// daily Slack digest); the third supplies personal milestone cards.
//
// All three logs are in-memory only and rebuilt empty on restart, so every prod
// deploy silently reset the dashboard's "today" to whatever had happened since
// that deploy. Those numbers are presented as a trailing 24h, so a deploy made
// them quietly wrong rather than obviously missing.
//
// Why one blob on the season summary's existing persist cadence rather than
// append-only rows through the SQLite writer worker: a per-record write path
// (plus a chunked prune and a new table) is a large amount of machinery on the
// hottest path in the sim, for data a single periodic upsert already covers.
//
// The blob is the whole of each log, with no tighter cap of its own. Each log
// is already bounded by its 24h prune and its entry cap (50,000 for the public
// logs, 5,000 for personal impacts), so that is the ceiling here too: about
// 17 MB and ~16 ms of JSON.stringify if both public logs are full. An earlier
// 5,000-entry persist cap assumed a few hundred flips per day; every capture
// and expansion world-wide is a flip, so a busy day passed it within hours and
// each restart cut every player's "Yours" timeline back to that newest slice.
import type { ActivityDashboardSnapshot, DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { buildActivityDashboardSnapshot } from "./activity-dashboard-snapshot.js";
import type { CombatManpowerLog, CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import type { PersonalImpactEvent, PersonalImpactLog } from "../personal-impact-log/personal-impact-log.js";
import type { TerritoryFlip, TerritoryFlipLog } from "../territory-flip-log/territory-flip-log.js";

export type PersistedActivityLogs = {
  flips: TerritoryFlip[];
  combat: CombatManpowerLoss[];
  personalImpacts: PersonalImpactEvent[];
  personalImpactCapHits?: number;
};

export const exportActivityLogs = (
  flipLog: Pick<TerritoryFlipLog, "entries">,
  combatLog: Pick<CombatManpowerLog, "entries">,
  personalImpactLog: Pick<PersonalImpactLog, "entries" | "gauge">
): PersistedActivityLogs => ({
  flips: [...flipLog.entries()],
  combat: [...combatLog.entries()],
  personalImpacts: [...personalImpactLog.entries()],
  personalImpactCapHits: personalImpactLog.gauge().capHits
});

/**
 * Reseeds all logs on boot. Each log's own restore() drops entries already
 * outside its 24h window, so a process that was down for more than a day
 * correctly comes back with nothing rather than stale "today" numbers.
 */
export const restoreActivityLogs = (
  flipLog: Pick<TerritoryFlipLog, "restore">,
  combatLog: Pick<CombatManpowerLog, "restore">,
  personalImpactLog: Pick<PersonalImpactLog, "restore">,
  logs: PersistedActivityLogs | undefined,
  now: number
): void => {
  if (!logs) return;
  if (Array.isArray(logs.flips)) flipLog.restore(logs.flips, now);
  if (Array.isArray(logs.combat)) combatLog.restore(logs.combat, now);
  if (Array.isArray(logs.personalImpacts)) personalImpactLog.restore(logs.personalImpacts, now, logs.personalImpactCapHits);
};

/**
 * Prunes the public logs to their 24h window and builds the dashboard snapshot.
 *
 * Extracted from SimulationRuntime.exportActivityDashboardSnapshot so runtime.ts
 * (far over the repo's 500-line cap, and so may not grow) can expose the
 * persistence accessors above; the prune-then-build pairing lives naturally
 * beside the persistence helpers that share the public logs.
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
