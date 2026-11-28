// The once-a-minute population growth tick and its stall logging, moved out
// of simulation-service.ts (over the file-line limit) so it could take the
// waiting-House landing ticker without growing.
import type { SimulationRuntime } from "../runtime/runtime.js";

type GrowthLog = {
  info: (payload: Record<string, unknown>, message: string) => void;
  warn: (payload: Record<string, unknown>, message: string) => void;
  error: (payload: Record<string, unknown>, message: string) => void;
};
type TrackSync = <T>(phase: "tick_population_growth", details: undefined, task: () => T) => T;

export const runPopulationGrowthTick = (deps: { runtime: Pick<SimulationRuntime, "tickPopulationGrowth">; log: GrowthLog; trackSync: TrackSync }): void => {
  const { runtime, log, trackSync } = deps;
  try {
    const growthResult = trackSync("tick_population_growth", undefined, () => runtime.tickPopulationGrowth(Date.now()));
    if (growthResult) {
      const { townsGrown, growthStalledNoFood, townsSkippedWar, townsSkippedCaptureShock, townsSkippedUnfed, townsSkippedLogisticCap, playersSkippedNoFedTowns, playerDiag } = growthResult;
      const anyStalled = growthStalledNoFood > 0 || townsSkippedUnfed > 0 || playersSkippedNoFedTowns > 0;
      if (anyStalled || townsGrown === 0) {
        const diagByPlayer: Record<string, unknown> = {};
        for (const [pid, d] of playerDiag) {
          if (d.grown === 0 && d.totalTowns > 0) diagByPlayer[pid] = d;
        }
        log.warn({
          townsGrown,
          growthStalledNoFood,
          townsSkippedWar,
          townsSkippedCaptureShock,
          townsSkippedUnfed,
          townsSkippedLogisticCap,
          playersSkippedNoFedTowns,
          stalledPlayers: diagByPlayer
        }, "[pop_growth] growth stalled or zero this tick");
      } else {
        log.info({ townsGrown, growthStalledNoFood, townsSkippedWar, townsSkippedUnfed }, "[pop_growth] tick ok");
      }
    }
  } catch (error) {
    log.error({ err: error }, "population growth tick failed");
  }
};
