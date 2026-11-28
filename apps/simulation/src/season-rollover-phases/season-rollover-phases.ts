import type { SimulationSeasonState } from "@border-empires/sim-protocol";

import type { MainThreadTaskTracker } from "../main-thread-task-tracker/main-thread-task-tracker.js";
import type { SimulationRuntime } from "../runtime/runtime.js";
import { buildCurrentSeasonSummary } from "../season-summary/season-summary.js";
import type { WorldgenPhaseTracker } from "../season-worldgen/worldgen-phase-tracker.js";
import { buildWorldStatusSnapshot } from "../world-status-snapshot/world-status-snapshot.js";

/**
 * Season rollover (startNextSeason) runs worldgen and builds the next runtime
 * on the simulation main thread. Every synchronous stage goes through this
 * tracker as `season_rollover_<stage>` so an event_loop_blocked during a
 * rollover names the stage in `mainThreadTasks` and each stage lands in the
 * sim_main_thread_task_ms quantile (via trackSync's metrics wrapper).
 */
export const seasonRolloverPhaseTracker = (trackSync: MainThreadTaskTracker["trackSync"]): WorldgenPhaseTracker =>
  (phase, task) => trackSync(`season_rollover_${phase}`, undefined, task);

/** The next season's initial world status + leaderboard summary, each stage tracked. */
export const buildNextSeasonSummary = (input: {
  track: WorldgenPhaseTracker;
  nextRuntime: SimulationRuntime;
  seasonState: SimulationSeasonState;
  nonCompetitivePlayerIds: ReadonlySet<string> | undefined;
}) => {
  const runtimeState = input.track("export_state", () => input.nextRuntime.exportState());
  const worldStatus = input.track("world_status", () => buildWorldStatusSnapshot("", runtimeState, {
    ...(input.nonCompetitivePlayerIds ? { nonCompetitivePlayerIds: input.nonCompetitivePlayerIds } : {})
  }));
  const summary = input.track("current_summary", () => buildCurrentSeasonSummary({
    seasonState: input.seasonState,
    runtimeState,
    onlinePlayers: 0,
    updatedAt: input.seasonState.startedAt,
    worldStatus
  }));
  return { worldStatus, summary };
};
