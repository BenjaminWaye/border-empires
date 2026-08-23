import { isSeasonPending } from "../season-lifecycle.js";
import type { SimulationSeasonState } from "@border-empires/sim-protocol";
import type { AiTickThrottleReason } from "../metrics/metrics-types.js";

export type AiAndSystemShouldRunDeps = {
  getSeasonState: () => SimulationSeasonState;
  incrementThrottled: (reason: AiTickThrottleReason) => void;
  isCheckpointInFlight: () => boolean;
  isPersistenceDegraded: () => boolean;
  persistencePendingCount: () => number;
  autopilotMaxPersistencePending: number;
  getLatestEventLoopLagMs: () => number;
  aiMaxEventLoopLagMs: number;
  aiTickMs: number;
};

/** Builds the `aiShouldRun`/`systemShouldRun` tick gates shared by the AI and
 *  system command producers: both refuse to run once the season has ended or
 *  is still `"pending"` (lobby countdown), and throttle on checkpoint/
 *  persistence/event-loop-lag pressure. `aiShouldRun` additionally tracks
 *  hrtime gaps to detect main-thread loop lag specific to the AI tick. */
export const createAiAndSystemShouldRun = (deps: AiAndSystemShouldRunDeps): { aiShouldRun: () => boolean; systemShouldRun: () => boolean } => {
  let lastAiShouldRunHr = process.hrtime.bigint();
  let aiShouldRunFirstCall = true;

  const seasonGateBlocksRun = (): boolean => {
    const seasonState = deps.getSeasonState();
    if (seasonState.status === "ended") {
      deps.incrementThrottled("season_ended");
      return true;
    }
    if (isSeasonPending(seasonState)) {
      deps.incrementThrottled("season_pending");
      return true;
    }
    return false;
  };

  const throttleGatesAllowRun = (): boolean => {
    if (deps.isCheckpointInFlight()) {
      deps.incrementThrottled("checkpoint_in_flight");
      return false;
    }
    return (
      !deps.isPersistenceDegraded() &&
      deps.persistencePendingCount() < deps.autopilotMaxPersistencePending &&
      deps.getLatestEventLoopLagMs() <= deps.aiMaxEventLoopLagMs
    );
  };

  const aiShouldRun = (): boolean => {
    if (seasonGateBlocksRun()) return false;
    const hrNow = process.hrtime.bigint();
    if (aiShouldRunFirstCall) {
      aiShouldRunFirstCall = false;
      lastAiShouldRunHr = hrNow;
    } else {
      const gapMs = Number(hrNow - lastAiShouldRunHr) / 1e6;
      lastAiShouldRunHr = hrNow;
      // Only flag loop lag when tick is at or near the base interval.
      // When adaptive backoff is active (gap > baseInterval * 1.5),
      // the adaptive throttle already handles the load — skip the check.
      if (gapMs > deps.aiTickMs + 20 && gapMs < deps.aiTickMs * 1.5) {
        deps.incrementThrottled("loop_lag");
        return false;
      }
    }
    return throttleGatesAllowRun();
  };

  const systemShouldRun = (): boolean => {
    if (seasonGateBlocksRun()) return false;
    return throttleGatesAllowRun();
  };

  return { aiShouldRun, systemShouldRun };
};
