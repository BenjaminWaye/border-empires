import type { CurrentSeasonSummary, SeasonArchiveRow, SimulationSeasonState } from "@border-empires/sim-protocol";

import { buildWorldStatusSnapshot } from "../world-status-snapshot/world-status-snapshot.js";
import type { SimulationRuntime } from "../runtime/runtime.js";

type WorldStatus = ReturnType<typeof buildWorldStatusSnapshot>;

type RuntimeState = ReturnType<SimulationRuntime["exportState"]>;

const topEntries = (
  entries: Array<{ id: string; name: string; value: number }>,
  limit = 5
): Array<{ playerId: string; playerName: string; value: number }> =>
  entries.slice(0, limit).map((entry) => ({
    playerId: entry.id,
    playerName: entry.name,
    value: entry.value
  }));

const topLongestSurvival = (
  overall: CurrentSeasonSummary["overall"],
  startedAt: number,
  endedAt: number,
  limit = 5
): SeasonArchiveRow["longestSurvivalMs"] =>
  overall.slice(0, limit).map((entry) => ({
    playerId: entry.id,
    playerName: entry.name,
    value: Math.max(0, endedAt - startedAt)
  }));

export const buildCurrentSeasonSummary = ({
  seasonState,
  runtimeState,
  onlinePlayers,
  updatedAt,
  acceptLatencyP95Ms,
  nonCompetitivePlayerIds,
  worldStatus: providedWorldStatus
}: {
  seasonState: SimulationSeasonState;
  runtimeState: RuntimeState;
  onlinePlayers: number;
  updatedAt: number;
  acceptLatencyP95Ms?: number;
  nonCompetitivePlayerIds?: ReadonlySet<string>;
  /** Pass an already-built snapshot (e.g. from the caller's own tile scan) to
   *  avoid a redundant O(n_tiles) season-victory scan on the same runtime state. */
  worldStatus?: WorldStatus;
}): CurrentSeasonSummary => {
  const worldStatus =
    providedWorldStatus ??
    buildWorldStatusSnapshot("", runtimeState, undefined, {
      ...(typeof acceptLatencyP95Ms === "number" ? { acceptLatencyP95Ms } : {}),
      ...(nonCompetitivePlayerIds ? { nonCompetitivePlayerIds } : {})
    });
  const townCount = runtimeState.tiles.filter((tile) => typeof tile.townJson === "string" || typeof tile.townType === "string").length;
  const totalPlayers = worldStatus.leaderboard.overall.length;

  return {
    season: seasonState.seasonId,
    seasonId: seasonState.seasonId,
    seasonSequence: seasonState.seasonSequence,
    status: seasonState.status,
    startedAt: seasonState.startedAt,
    ...(typeof seasonState.endedAt === "number" ? { endedAt: seasonState.endedAt } : {}),
    worldSeed: seasonState.worldSeed,
    rulesetId: seasonState.rulesetId,
    ...(seasonState.winner ? { seasonWinner: seasonState.winner } : {}),
    leaderboard: worldStatus.leaderboard,
    overall: worldStatus.leaderboard.overall,
    byTiles: worldStatus.leaderboard.byTiles,
    byIncome: worldStatus.leaderboard.byIncome,
    byTechs: worldStatus.leaderboard.byTechs,
    seasonVictory: worldStatus.seasonVictory,
    onlinePlayers,
    totalPlayers,
    townCount,
    updatedAt
  };
};

export const buildArchiveRow = (summary: CurrentSeasonSummary): SeasonArchiveRow => {
  const mostTerritory = topEntries(summary.byTiles);
  const mostPoints = topEntries(
    summary.overall.map((entry) => ({
      id: entry.id,
      name: entry.name,
      value: entry.score
    }))
  );
  const endedAt = summary.endedAt ?? summary.updatedAt;
  return {
    seasonId: summary.seasonId,
    seasonSequence: summary.seasonSequence,
    endedAt,
    updatedAt: summary.updatedAt,
    ...(summary.seasonWinner ? { winner: summary.seasonWinner } : {}),
    mostTerritory,
    mostPoints,
    longestSurvivalMs: topLongestSurvival(summary.overall, summary.startedAt, endedAt),
    replayEvents: []
  };
};

export const leaderboardSignature = (summary: CurrentSeasonSummary): string =>
  JSON.stringify({
    seasonId: summary.seasonId,
    status: summary.status,
    seasonWinner: summary.seasonWinner,
    overall: summary.overall.map((entry) => [entry.id, entry.rank, entry.score, entry.tiles, entry.incomePerMinute, entry.techs]),
    objectives: summary.seasonVictory.map((objective) => [
      objective.id,
      objective.leaderPlayerId ?? "",
      objective.progressLabel,
      objective.statusLabel,
      objective.conditionMet,
      objective.holdRemainingSeconds ?? -1
    ]),
    onlinePlayers: summary.onlinePlayers,
    totalPlayers: summary.totalPlayers,
    townCount: summary.townCount
  });