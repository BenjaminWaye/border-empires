import type {
  SeasonVictoryObjectiveSnapshot,
  SeasonWinnerSnapshot,
  SimulationSeasonState
} from "@border-empires/sim-protocol";
import type { WorldStyle } from "@border-empires/shared";

export const createSeasonId = (seasonSequence: number): string => `season-${seasonSequence}`;

export const createInitialSeasonState = ({
  seasonSequence,
  rulesetId,
  worldSeed,
  mapStyle,
  startedAt,
  scheduledStartAt
}: {
  seasonSequence: number;
  rulesetId: string;
  worldSeed: number;
  mapStyle?: WorldStyle;
  startedAt: number;
  /** When provided and still in the future relative to `startedAt`, the
   *  season is created as `"pending"` instead of `"active"` — JOIN_SEASON
   *  holds arrivals until the scheduled time passes (see
   *  maybeActivatePendingSeason). Omit to keep today's behaviour. */
  scheduledStartAt?: number;
}): SimulationSeasonState => {
  const isPending = typeof scheduledStartAt === "number" && scheduledStartAt > startedAt;
  return {
    seasonId: createSeasonId(seasonSequence),
    seasonSequence,
    rulesetId,
    worldSeed,
    ...(mapStyle ? { mapStyle } : {}),
    status: isPending ? "pending" : "active",
    startedAt,
    ...(isPending ? { scheduledStartAt } : {}),
    victoryTrackers: [],
    joinedPlayerIds: []
  };
};

export const cloneSeasonState = (seasonState: SimulationSeasonState): SimulationSeasonState => ({
  ...seasonState,
  ...(seasonState.winner ? { winner: { ...seasonState.winner } } : {}),
  ...(seasonState.galaxyTiers ? { galaxyTiers: seasonState.galaxyTiers.map((tier) => ({ ...tier })) } : {}),
  victoryTrackers: seasonState.victoryTrackers.map((tracker) => ({ ...tracker })),
  ...(seasonState.joinedPlayerIds ? { joinedPlayerIds: [...seasonState.joinedPlayerIds] } : {})
});

/** True once `playerId` has explicitly joined `seasonState` via JoinSeason.
 *  Seasons persisted before joinedPlayerIds existed have no field at all —
 *  treat that as "membership not tracked for this season" (never gate) so
 *  players already active in an in-flight season aren't locked out. */
export const hasPlayerJoinedSeason = (seasonState: SimulationSeasonState, playerId: string): boolean =>
  !seasonState.joinedPlayerIds || seasonState.joinedPlayerIds.includes(playerId);

export const withPlayerJoinedSeason = (seasonState: SimulationSeasonState, playerId: string): SimulationSeasonState => {
  const joinedPlayerIds = seasonState.joinedPlayerIds ?? [];
  if (joinedPlayerIds.includes(playerId)) return seasonState;
  return { ...seasonState, joinedPlayerIds: [...joinedPlayerIds, playerId] };
};

export const nextWorldSeed = (random = Math.random): number => Math.floor(random() * 1_000_000_000);

/** `status` predates `"pending"`/`"ended"` for some persisted seasons and may
 *  be missing entirely; absent status must be treated as the historical
 *  default, `"active"` (matches the joinedPlayerIds/mapStyle convention
 *  documented above) — never as pending or ended. */
export const isSeasonPending = (seasonState: SimulationSeasonState): boolean => seasonState.status === "pending";
export const isSeasonEnded = (seasonState: SimulationSeasonState): boolean => seasonState.status === "ended";
export const isSeasonActive = (seasonState: SimulationSeasonState): boolean =>
  !isSeasonPending(seasonState) && !isSeasonEnded(seasonState);

/** Flips a `pending` season to `active` once its `scheduledStartAt` has
 *  passed. Stamps `startedAt` to `now` and clears `scheduledStartAt`.
 *  No-op (returns the same state) when the season isn't pending, has no
 *  `scheduledStartAt`, or the scheduled time hasn't arrived yet. */
export const maybeActivatePendingSeason = (
  seasonState: SimulationSeasonState,
  now: number
): { seasonState: SimulationSeasonState; activated: boolean } => {
  if (!isSeasonPending(seasonState)) return { seasonState, activated: false };
  if (typeof seasonState.scheduledStartAt !== "number" || seasonState.scheduledStartAt > now) {
    return { seasonState, activated: false };
  }
  const { scheduledStartAt: _scheduledStartAt, ...rest } = seasonState;
  return { seasonState: { ...rest, status: "active", startedAt: now }, activated: true };
};

// Optional synchronized-start beta lobby env var: a future epoch-ms
// timestamp that makes the season bootstrapped at process startup pending
// (see createInitialSeasonState). Unset by default (today's behaviour).
export const readScheduledSeasonStartAtEnv = (): number | undefined => {
  const raw = process.env.SIMULATION_SEASON_SCHEDULED_START_AT;
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

// Flips+logs a pending->active activation; no-ops (and doesn't log) otherwise.
export const applyPendingSeasonActivation = (
  seasonState: SimulationSeasonState,
  log: { info: (payload: Record<string, unknown>, message: string) => void }
): SimulationSeasonState => {
  const activation = maybeActivatePendingSeason(seasonState, Date.now());
  if (!activation.activated) return seasonState;
  log.info({ seasonId: activation.seasonState.seasonId, startedAt: activation.seasonState.startedAt }, "pending season activated on schedule");
  return activation.seasonState;
};

export const updateSeasonVictoryTrackers = ({
  seasonState,
  objectives,
  now
}: {
  seasonState: SimulationSeasonState;
  objectives: SeasonVictoryObjectiveSnapshot[];
  now: number;
}): {
  seasonState: SimulationSeasonState;
  changed: boolean;
  nextTimerAt?: number;
  crownedWinner?: SeasonWinnerSnapshot;
  objectives: SeasonVictoryObjectiveSnapshot[];
} => {
  if (isSeasonEnded(seasonState) || isSeasonPending(seasonState)) {
    return {
      seasonState: cloneSeasonState(seasonState),
      changed: false,
      ...(seasonState.winner ? { crownedWinner: { ...seasonState.winner } } : {}),
      objectives
    };
  }

  const trackerByObjectiveId = new Map(seasonState.victoryTrackers.map((tracker) => [tracker.objectiveId, { ...tracker }]));
  let changed = false;
  let nextTimerAt: number | undefined;
  let crownedWinner: SeasonWinnerSnapshot | undefined;
  const nextObjectives = objectives.map((objective) => {
    const tracker = trackerByObjectiveId.get(objective.id) ?? { objectiveId: objective.id };
    if (!objective.conditionMet || !objective.leaderPlayerId) {
      if (tracker.leaderPlayerId || typeof tracker.holdStartedAt === "number") {
        changed = true;
      }
      delete tracker.leaderPlayerId;
      delete tracker.leaderName;
      delete tracker.holdStartedAt;
      trackerByObjectiveId.set(objective.id, tracker);
      return { ...objective };
    }

    if (tracker.leaderPlayerId !== objective.leaderPlayerId || tracker.leaderName !== objective.leaderName) {
      tracker.leaderPlayerId = objective.leaderPlayerId;
      tracker.leaderName = objective.leaderName;
      tracker.holdStartedAt = now;
      changed = true;
    }

    const holdStartedAt = tracker.holdStartedAt ?? now;
    const holdEndsAt = holdStartedAt + objective.holdDurationSeconds * 1_000;
    tracker.holdStartedAt = holdStartedAt;
    trackerByObjectiveId.set(objective.id, tracker);
    if (holdEndsAt <= now && !crownedWinner) {
      crownedWinner = {
        playerId: objective.leaderPlayerId,
        playerName: objective.leaderName,
        crownedAt: now,
        objectiveId: objective.id,
        objectiveName: objective.name
      };
      return {
        ...objective,
        holdRemainingSeconds: 0,
        statusLabel: "Season won"
      };
    }

    nextTimerAt = typeof nextTimerAt === "number" ? Math.min(nextTimerAt, holdEndsAt) : holdEndsAt;
    return {
      ...objective,
      holdRemainingSeconds: Math.max(0, Math.ceil((holdEndsAt - now) / 1_000)),
      statusLabel:
        holdEndsAt > now
          ? `Holding ${(holdEndsAt - now) > 60_000 ? "pressure" : "for victory"}`
          : objective.statusLabel
    };
  });

  const nextSeasonState = cloneSeasonState(seasonState);
  nextSeasonState.victoryTrackers = [...trackerByObjectiveId.values()].sort((left, right) => left.objectiveId.localeCompare(right.objectiveId));
  if (crownedWinner) {
    nextSeasonState.status = "ended";
    nextSeasonState.endedAt = crownedWinner.crownedAt;
    nextSeasonState.winner = crownedWinner;
    changed = true;
  }

  return {
    seasonState: nextSeasonState,
    changed,
    ...(typeof nextTimerAt === "number" ? { nextTimerAt } : {}),
    ...(crownedWinner ? { crownedWinner } : {}),
    objectives: nextObjectives
  };
};
