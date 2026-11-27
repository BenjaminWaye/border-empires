import type { DomainPlayer, DomainTileState, PersonalActivityTimeline } from "@border-empires/game-domain";

import {
  exportActivityDashboardSnapshotFrom,
  exportActivityLogs,
  restoreActivityLogs,
  type PersistedActivityLogs
} from "./activity-log-persistence.js";
import { createCombatManpowerLog, type CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import { aggregatePersonalActivity } from "../personal-activity-aggregation/personal-activity-aggregation.js";
import { createPersonalImpactLog, type PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";
import { createTerritoryFlipLog, isBarbarianRoamingFlip, type TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";
import { BARBARIAN_PLAYER_ID } from "../ai/system-job-barbarian-planner.js";
import { topCaptorOf } from "../elimination-captor/elimination-captor.js";
import { lostTilesOf, type LostTile } from "../lost-tile-memory/lost-tile-memory.js";

// Cohesive ownership of all non-snapshot, rolling activity history. Keeping
// this state out of runtime.ts both honors the source-file cap and makes the
// three logs' shared persistence contract impossible to drift at call sites.
export const createRuntimeActivityLogs = (now: () => number) => {
  const territory = createTerritoryFlipLog({ now, ignore: (flip) => isBarbarianRoamingFlip(flip, BARBARIAN_PLAYER_ID) });
  const combat = createCombatManpowerLog({ now });
  const personalImpacts = createPersonalImpactLog({ now });

  return {
    recordTileFlip: (flip: TerritoryFlip): void => territory.record(flip),
    recordCombatManpowerLoss: (loss: CombatManpowerLoss): void => combat.record(loss),
    recordPersonalImpact: (event: PersonalImpactEvent): void => personalImpacts.record(event),
    exportDashboardSnapshot: (tiles: ReadonlyMap<string, DomainTileState>, players: ReadonlyMap<string, DomainPlayer>) =>
      exportActivityDashboardSnapshotFrom(territory, combat, tiles, players, now()),
    export: (): PersistedActivityLogs => exportActivityLogs(territory, combat, personalImpacts),
    restore: (logs: PersistedActivityLogs | undefined): void => restoreActivityLogs(territory, combat, personalImpacts, logs, now()),
    /** Who took the most of this player's land in the last 24h (elimination notice). */
    topCaptorOf: (playerId: string): string | undefined => topCaptorOf(playerId, territory.entries()),
    /** Land this player lost in the last 24h and who took it, for their fog memory (lost-tile-memory.ts). */
    lostTilesOf: (playerId: string): LostTile[] => lostTilesOf(playerId, territory.entries()),
    territoryGauge: () => territory.gauge(),
    combatGauge: () => combat.gauge(),
    personalImpactGauge: () => personalImpacts.gauge(),
    /** The durable 24h impact tail, oldest first: who captured which town (diplomacy-town-return/). */
    personalImpactEntries: (): readonly PersonalImpactEvent[] => personalImpacts.entries(),
    personalTimeline: (playerId: string, from: number, to: number): PersonalActivityTimeline =>
      aggregatePersonalActivity(playerId, { from, to }, territory.entries(), combat.entries(), personalImpacts.entries())
  };
};
