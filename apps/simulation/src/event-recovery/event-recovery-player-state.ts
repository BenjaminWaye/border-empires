import type { PlayerEventLogEntry } from "@border-empires/game-domain";
import type { ChosenTrickleResource } from "@border-empires/shared";
import type { ServerDevQueueEntry, ServerWaypointQueueEntry } from "../player-runtime-summary.js";

/**
 * Snapshotted per-player recovery state. Most fields here are current-value
 * snapshots (not event-sourced) written by runtime-snapshot-sections.ts and
 * read back verbatim by the recovery accumulator in event-recovery.ts.
 * waypointQueue and devQueue follow that exact same pattern -- see
 * command-coverage-sets.ts for why that's sufficient to make
 * DEV_QUEUE_* / WAYPOINT_* commands restart-durable without needing dedicated
 * replay events: the periodic snapshot always carries the live queue
 * contents, so a cold boot picks them up from `initialState.players[]`
 * exactly like it already does for strategicResources or points.
 */
export type RecoveredPlayerState = {
  id: string;
  name?: string;
  isAi?: boolean;
  points?: number;
  manpower?: number;
  manpowerUpdatedAt?: number;
  manpowerCapSnapshot?: number;
  techIds?: string[];
  domainIds?: string[];
  strategicResources?: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>>;
  chosenTrickleResource?: ChosenTrickleResource;
  imperialWardCharges?: number;
  wonderLastFreeRushBuyAt?: number;
  // Galactic meta-layer v0 (§5, §12) — see DomainPlayer in game-domain.
  galacticWonderManpowerRegenBonusPerMinute?: number;
  galacticWonderVisionRadiusBonus?: number;
  eventLog?: PlayerEventLogEntry[];
  allies?: string[];
  vision?: number;
  incomeMultiplier?: number;
  incomePerMinute?: number;
  ownedTownTileKeys?: string[];
  waypointQueue?: ServerWaypointQueueEntry[];
  devQueue?: ServerDevQueueEntry[];
};

export const cloneRecoveredPlayerState = (player: RecoveredPlayerState): RecoveredPlayerState => ({
  ...player,
  ...(player.techIds ? { techIds: [...player.techIds] } : {}),
  ...(player.domainIds ? { domainIds: [...player.domainIds] } : {}),
  ...(player.strategicResources ? { strategicResources: { ...player.strategicResources } } : {}),
  ...(player.allies ? { allies: [...player.allies] } : {}),
  ...(player.ownedTownTileKeys ? { ownedTownTileKeys: [...player.ownedTownTileKeys] } : {}),
  ...(player.waypointQueue
    ? { waypointQueue: player.waypointQueue.map((entry) => ({ ...entry, target: { ...entry.target } })) }
    : {}),
  ...(player.devQueue ? { devQueue: player.devQueue.map((entry) => ({ ...entry })) } : {})
});
