import type { SeasonVictoryObjectiveSnapshot, SeasonWinnerSnapshot, SimulationSeasonState } from "@border-empires/sim-protocol";

import type { SimulationRuntime } from "../runtime/runtime.js";
import { computeSeasonWinnerStats } from "../season-winner-stats.js";
import { computeLongestRoad, findMostDeadlyTile } from "../season-stats/season-stats.js";
import { galaxyTiersAtCrowning } from "../season-galaxy-tiers/season-galaxy-tiers.js";
import type { buildWorldStatusSnapshot } from "../world-status-snapshot/world-status-snapshot.js";

type RuntimeState = ReturnType<SimulationRuntime["exportState"]>;
type WorldStatus = ReturnType<typeof buildWorldStatusSnapshot>;

/**
 * Extracted from simulation-service.ts's recomputeAndPersistCurrentSummary
 * (which is already over the repo's 500-line file cap, so new logic must
 * live elsewhere): the moment a season's winner is crowned, capture their
 * economy/population/monument "planet stats" snapshot (the base a christened
 * planet carries forward, see galaxy-routes.ts) AND compute the galactic
 * meta-layer's Outpost/Stipend tiers for every other competitive player
 * (§3 of docs/galactic-campaign-design.md, see season-galaxy-tiers.ts).
 *
 * Guarded by the caller so this only runs once per season (a season sitting
 * on "ended" doesn't re-scan tiles on every subsequent recompute) — this
 * function itself does not re-check that guard.
 */
export const captureSeasonWinnerAtCrowning = ({
  seasonState,
  winner,
  runtime,
  runtimeState,
  worldStatus,
  objectives
}: {
  seasonState: SimulationSeasonState;
  winner: SeasonWinnerSnapshot;
  runtime: SimulationRuntime;
  runtimeState: RuntimeState;
  worldStatus: WorldStatus;
  objectives: SeasonVictoryObjectiveSnapshot[];
}): SimulationSeasonState => {
  const mostDeadlyTile = findMostDeadlyTile(runtime.manpowerLossByTileKey);
  const longestRoad = computeLongestRoad(runtimeState.tiles);
  return {
    ...seasonState,
    winner: {
      ...winner,
      stats: computeSeasonWinnerStats(runtimeState, winner.playerId),
      // Persist alongside the winner (not just the ephemeral summary) so it
      // survives a reconnect/fresh-login INIT — see SeasonWinnerSnapshot.
      ...((mostDeadlyTile || longestRoad)
        ? { seasonStats: { ...(mostDeadlyTile ? { mostDeadlyTile } : {}), ...(longestRoad ? { longestRoad } : {}) } }
        : {})
    },
    galaxyTiers: galaxyTiersAtCrowning({
      objectives,
      crownedWinner: winner,
      overall: worldStatus.leaderboard.overall,
      selfProgressByPlayerId: worldStatus.allPlayerSelfProgress
    })
  };
};
