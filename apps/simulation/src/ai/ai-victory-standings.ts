// Real season-victory standings for the AI planner.
//
// The simulation already scores every competitive player against the actual
// win conditions (computeSeasonVictory): each objective carries its leader's
// 0..1 progress, and the self-progress cache carries every non-leader's.
// The planner runs in a worker with no world status, so without this it fell
// back to self-relative targets that read "already winning" for every AI
// (victory-path-scoring.ts). This merges both sources into one per-player
// map and attaches it to the planner views the worker producer exports.
import { SEASON_VICTORY_ECONOMY_LEAD_MULT } from "@border-empires/game-domain";
import type { SeasonVictoryObjectiveSnapshot } from "@border-empires/sim-protocol";
import type { SeasonVictoryPathId } from "@border-empires/shared";

import type { SimulationRuntime } from "../runtime/runtime.js";
import type { MainThreadTaskTracker } from "../main-thread-task-tracker/main-thread-task-tracker.js";
import type { PlannerPlayerView } from "./planner-world-view.js";
import type { WorldVictoryProgress } from "./victory-path-scoring.js";

export type VictoryStandingsSource = {
  objectives: readonly SeasonVictoryObjectiveSnapshot[];
  /** Non-leader progress per player per path (SelfProgressCache.values). */
  selfProgress: ReadonlyMap<string, ReadonlyMap<SeasonVictoryPathId, number>>;
};

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

/** One entry per player with any standing; a path with no entry means 0 progress. */
export const victoryProgressByPlayer = (source: VictoryStandingsSource): Map<string, WorldVictoryProgress> => {
  const byPlayer = new Map<string, WorldVictoryProgress>();
  for (const [playerId, paths] of source.selfProgress) {
    const progress: WorldVictoryProgress = {};
    for (const [path, value] of paths) {
      // A non-leader's Economic Hegemony self-progress is income / leader's
      // income (a "how close to the front" display proxy), while the leader's
      // objective progress is measured against beating the runner-up by the
      // lead multiplier. Without rescaling, an AI just behind the leader reads
      // higher than the leader itself. Dividing by the multiplier puts both on
      // "fraction of the income needed to win from here".
      progress[path] = clamp01(path === "ECONOMIC_HEGEMONY" ? value / SEASON_VICTORY_ECONOMY_LEAD_MULT : value);
    }
    byPlayer.set(playerId, progress);
  }
  // computeSeasonVictory leaves the leader out of the self-progress map; its
  // progress lives on the objective itself.
  for (const objective of source.objectives) {
    if (!objective.leaderPlayerId) continue;
    const progress = byPlayer.get(objective.leaderPlayerId) ?? {};
    progress[objective.id] = objective.conditionMet ? 1 : clamp01(objective.progress ?? 0);
    byPlayer.set(objective.leaderPlayerId, progress);
  }
  return byPlayer;
};

export type VictoryStandingsLookup = (playerId: string) => WorldVictoryProgress | undefined;

/** Recomputes only when the source objects change (the summary refresh replaces them). */
export const createVictoryStandingsLookup = (readSource: () => VictoryStandingsSource): VictoryStandingsLookup => {
  let cachedObjectives: VictoryStandingsSource["objectives"] | undefined;
  let cachedSelfProgress: VictoryStandingsSource["selfProgress"] | undefined;
  let cached = new Map<string, WorldVictoryProgress>();
  return (playerId) => {
    const source = readSource();
    if (source.objectives !== cachedObjectives || source.selfProgress !== cachedSelfProgress) {
      cachedObjectives = source.objectives;
      cachedSelfProgress = source.selfProgress;
      cached = victoryProgressByPlayer(source);
    }
    // No objectives yet (cold start before the first summary), or a player the
    // season doesn't rank (non-competitive): leave the planner on its
    // heuristic rather than tell it it has 0 progress everywhere.
    if (source.objectives.length === 0) return undefined;
    return cached.get(playerId);
  };
};

export const withVictoryStandings = (players: PlannerPlayerView[], lookup: VictoryStandingsLookup): PlannerPlayerView[] =>
  players.map((player) => {
    const victoryProgress = lookup(player.id);
    return victoryProgress ? { ...player, victoryProgress } : player;
  });

export type AiProducerRuntime = Pick<SimulationRuntime, "queueDepths" | "onEvent" | "exportPlannerWorldView" | "exportPlannerPlayerViews" | "exportTilesForKeys">;

/** The worker AI producer's view of the runtime: main-thread-tracked exports, with standings attached. */
export const createAiProducerRuntime = (
  runtime: AiProducerRuntime,
  trackSync: MainThreadTaskTracker["trackSync"],
  standings: VictoryStandingsLookup
): AiProducerRuntime => ({
  queueDepths: () => runtime.queueDepths(),
  onEvent: (handler) => runtime.onEvent(handler),
  exportPlannerWorldView: (playerIds) =>
    trackSync("ai_export_planner_world_view", { playerCount: playerIds.length }, () => {
      const view = runtime.exportPlannerWorldView(playerIds);
      return { ...view, players: withVictoryStandings(view.players, standings) };
    }),
  exportPlannerPlayerViews: (playerIds) =>
    trackSync("ai_export_planner_player_views", { playerCount: playerIds.length }, () =>
      withVictoryStandings(runtime.exportPlannerPlayerViews(playerIds), standings)
    ),
  exportTilesForKeys: (keys) => trackSync("ai_export_tiles_for_keys", undefined, () => runtime.exportTilesForKeys(keys))
});
