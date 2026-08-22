import {
  GALAXY_OUTPOST_PROGRESS_THRESHOLD,
  GALAXY_STIPEND_INFLUENCE_PER_PROGRESS,
  GALAXY_STIPEND_MIN_PROGRESS,
  GALAXY_STIPEND_PRODUCTION_PER_PROGRESS
} from "@border-empires/game-domain";
import { specializationForVictoryPath } from "@border-empires/sim-protocol";
import type { LeaderboardOverallEntry, SeasonGalaxyTierSnapshot, SeasonVictoryObjectiveSnapshot, SeasonWinnerSnapshot } from "@border-empires/sim-protocol";
import type { SeasonVictoryPathId } from "@border-empires/shared";

/**
 * Galactic meta-layer v0 tiering (docs/galactic-campaign-design.md §3),
 * computed once at the exact moment a season's `crownedWinner` is set (see
 * updateSeasonVictoryTrackers / simulation-service.ts). Every competitive
 * player besides the winner gets at most one record:
 *
 *  - OUTPOST: leads a DIFFERENT objective than the one that won, with that
 *    objective's own progress at/above GALAXY_OUTPOST_PROGRESS_THRESHOLD.
 *    Specialization is derived from *that player's own* leading path, not
 *    the winner's (per the design doc's explicit correction).
 *  - STIPEND: otherwise, if the player's own best-path progress fraction
 *    (their own progress on the objective they lead, if any, else their
 *    self-progress on every objective they don't) is strictly above
 *    GALAXY_STIPEND_MIN_PROGRESS. Payout is §13's formula.
 *  - Neither: a player who never meaningfully engaged with any objective
 *    (best progress 0) gets no record at all — no degenerate empty rows.
 *
 * This is the "simple v0 cut" explicitly sanctioned for this task: no true
 * per-path runner-up tracking, just "is this player the CURRENT leader of a
 * different path".
 */
export const computeSeasonGalaxyTiers = ({
  objectives,
  crownedWinner,
  competitivePlayerIds,
  playerNamesById,
  selfProgressByPlayerId
}: {
  objectives: SeasonVictoryObjectiveSnapshot[];
  crownedWinner: SeasonWinnerSnapshot;
  competitivePlayerIds: ReadonlySet<string>;
  playerNamesById: ReadonlyMap<string, string>;
  /** Every competitive player's own numeric progress on every objective they
   *  don't lead — see computeSeasonVictory's selfProgressByPlayerId. */
  selfProgressByPlayerId: ReadonlyMap<string, ReadonlyMap<SeasonVictoryPathId, number>>;
}): SeasonGalaxyTierSnapshot[] => {
  const records: SeasonGalaxyTierSnapshot[] = [];

  for (const playerId of competitivePlayerIds) {
    if (playerId === crownedWinner.playerId) continue;
    const playerName = playerNamesById.get(playerId) ?? playerId;
    const ownProgress = selfProgressByPlayerId.get(playerId);

    // Own progress on every objective (leader -> objective.progress, else
    // this player's own self-progress fraction), and separately track the
    // best qualifying "leads a different path" candidate for Outpost.
    let bestOverallProgress = 0;
    let bestOutpostObjective: SeasonVictoryObjectiveSnapshot | undefined;
    for (const objective of objectives) {
      const isLeader = objective.leaderPlayerId === playerId;
      const progress = isLeader ? (objective.progress ?? 0) : (ownProgress?.get(objective.id) ?? 0);
      if (progress > bestOverallProgress) bestOverallProgress = progress;
      if (
        isLeader &&
        objective.id !== crownedWinner.objectiveId &&
        progress >= GALAXY_OUTPOST_PROGRESS_THRESHOLD &&
        (!bestOutpostObjective || progress > (bestOutpostObjective.progress ?? 0))
      ) {
        bestOutpostObjective = objective;
      }
    }

    if (bestOutpostObjective) {
      records.push({
        playerId,
        playerName,
        tier: "OUTPOST",
        specialization: specializationForVictoryPath(bestOutpostObjective.id)
      });
      continue;
    }

    if (bestOverallProgress > GALAXY_STIPEND_MIN_PROGRESS) {
      records.push({
        playerId,
        playerName,
        tier: "STIPEND",
        influence: Math.round(GALAXY_STIPEND_INFLUENCE_PER_PROGRESS * bestOverallProgress * 100) / 100,
        production: Math.round(GALAXY_STIPEND_PRODUCTION_PER_PROGRESS * bestOverallProgress * 100) / 100
      });
    }
  }

  return records;
};

/** Thin adapter: builds computeSeasonGalaxyTiers' inputs from the shapes
 *  already on hand at crowning time in simulation-service.ts (a leaderboard
 *  `overall` array + the numeric self-progress map from buildWorldStatusSnapshot),
 *  so the call site there stays a single expression. */
export const galaxyTiersAtCrowning = ({
  objectives,
  crownedWinner,
  overall,
  selfProgressByPlayerId
}: {
  objectives: SeasonVictoryObjectiveSnapshot[];
  crownedWinner: SeasonWinnerSnapshot;
  overall: Pick<LeaderboardOverallEntry, "id" | "name">[];
  selfProgressByPlayerId: ReadonlyMap<string, ReadonlyMap<SeasonVictoryPathId, number>>;
}): SeasonGalaxyTierSnapshot[] =>
  computeSeasonGalaxyTiers({
    objectives,
    crownedWinner,
    competitivePlayerIds: new Set(overall.map((entry) => entry.id)),
    playerNamesById: new Map(overall.map((entry) => [entry.id, entry.name])),
    selfProgressByPlayerId
  });
