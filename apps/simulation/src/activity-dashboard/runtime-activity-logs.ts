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
import { createTerritoryFlipLog, type TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";

// Cohesive ownership of all non-snapshot, rolling activity history. Keeping
// this state out of runtime.ts both honors the source-file cap and makes the
// three logs' shared persistence contract impossible to drift at call sites.
export const createRuntimeActivityLogs = (now: () => number) => {
  const territory = createTerritoryFlipLog({ now });
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
    territoryGauge: () => territory.gauge(),
    combatGauge: () => combat.gauge(),
    personalImpactGauge: () => personalImpacts.gauge(),
    personalTimeline: (playerId: string, from: number, to: number): PersonalActivityTimeline =>
      aggregatePersonalActivity(playerId, { from, to }, territory.entries(), combat.entries(), personalImpacts.entries())
  };
};
