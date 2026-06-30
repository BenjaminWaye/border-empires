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
  startedAt
}: {
  seasonSequence: number;
  rulesetId: string;
  worldSeed: number;
  mapStyle?: WorldStyle;
  startedAt: number;
}): SimulationSeasonState => ({
  seasonId: createSeasonId(seasonSequence),
  seasonSequence,
  rulesetId,
  worldSeed,
  ...(mapStyle ? { mapStyle } : {}),
  status: "active",
  startedAt,
  victoryTrackers: []
});

export const cloneSeasonState = (seasonState: SimulationSeasonState): SimulationSeasonState => ({
  ...seasonState,
  ...(seasonState.winner ? { winner: { ...seasonState.winner } } : {}),
  victoryTrackers: seasonState.victoryTrackers.map((tracker) => ({ ...tracker }))
});

export const nextWorldSeed = (random = Math.random): number => Math.floor(random() * 1_000_000_000);

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
  if (seasonState.status === "ended") {
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
