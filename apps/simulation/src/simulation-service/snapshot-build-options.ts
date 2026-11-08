import type { CurrentSeasonSummary, SimulationSeasonState } from "@border-empires/sim-protocol";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import type { PlayerRespawnNotice } from "@border-empires/shared";
import type { buildPlayerSubscriptionSnapshot } from "../player-snapshot/player-snapshot.js";

export type SnapshotBuildOptionsInput = {
  useFullVisibility: boolean;
  needsFullWorldExport: boolean;
  respawnNotice: PlayerRespawnNotice | undefined;
  currentSeasonState: SimulationSeasonState;
  currentSummary?: Pick<CurrentSeasonSummary, "seasonId" | "seasonStats" | "scoreHistory"> | undefined;
  nonCompetitivePlayerIds: ReadonlySet<string> | undefined;
  fullVisibilityTiles: PlayerSubscriptionSnapshot["tiles"] | undefined;
  worldStatusSnapshot: PlayerSubscriptionSnapshot["worldStatus"] | undefined;
};

const withSavedSeasonRecords = (
  season: SimulationSeasonState,
  summary: SnapshotBuildOptionsInput["currentSummary"]
): SimulationSeasonState => {
  if (!season.winner || summary?.seasonId !== season.seasonId) return season;
  const seasonStats = season.winner.seasonStats ?? summary.seasonStats;
  const scoreHistory = season.winner.scoreHistory ?? summary.scoreHistory;
  return {
    ...season,
    winner: {
      ...season.winner,
      ...(seasonStats ? { seasonStats } : {}),
      ...(scoreHistory ? { scoreHistory } : {})
    }
  };
};

export const buildSnapshotBuildOptions = ({
  useFullVisibility,
  needsFullWorldExport,
  respawnNotice,
  currentSeasonState,
  currentSummary,
  nonCompetitivePlayerIds,
  fullVisibilityTiles,
  worldStatusSnapshot,
}: SnapshotBuildOptionsInput): NonNullable<Parameters<typeof buildPlayerSubscriptionSnapshot>[2]> => ({
  includeWorldStatus: needsFullWorldExport,
  fullVisibility: useFullVisibility,
  tilesAlreadyVisible: !useFullVisibility,
  ...(fullVisibilityTiles ? { sharedFullVisibilityTiles: fullVisibilityTiles } : {}),
  ...(worldStatusSnapshot ? { worldStatusSnapshot } : {}),
  // Earlier crowns did not persist these records on the winner. Reuse the
  // matching saved summary on login; no world scan or history reconstruction.
  seasonState: withSavedSeasonRecords(currentSeasonState, currentSummary),
  ...(respawnNotice ? { respawnNotice } : {}),
  ...(nonCompetitivePlayerIds ? { nonCompetitivePlayerIds } : {}),
});
