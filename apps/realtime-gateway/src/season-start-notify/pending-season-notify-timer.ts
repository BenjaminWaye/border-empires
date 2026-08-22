import type { CurrentSeasonSummary } from "@border-empires/sim-protocol";

// Polls GetCurrentSeasonSummary and fires notifySeasonStarted() exactly once
// when it observes the season flip from "pending" to "active" -- the actual
// flip happens inside the simulation (see maybeActivatePendingSeason /
// recomputeAndPersistCurrentSummary), this timer only detects it and drives
// the gateway-side start-of-season email, mirroring how the existing manual
// START_NEW_SEASON / imperial-ward auto-start paths call notifySeasonStarted
// after simulationClient.startNextSeason resolves.
export type PendingSeasonNotifyTimerDeps = {
  getCurrentSeasonSummary: () => Promise<CurrentSeasonSummary>;
  notifySeasonStarted: () => void;
  intervalMs?: number;
  onError?: (error: unknown) => void;
};

export const startPendingSeasonNotifyTimer = (deps: PendingSeasonNotifyTimerDeps): { stop: () => void } => {
  let inFlight = false;
  // Tracks the last seasonId observed as "pending" so the flip to "active"
  // fires the email exactly once per season, even across repeated polls and
  // gateway restarts mid-pending-window (a restart just means it may miss a
  // flip that already happened before it started watching -- acceptable for
  // a beta launch, and consistent with the other two notifySeasonStarted call
  // sites, which are also not idempotent across a process restart).
  let lastObservedPendingSeasonId: string | undefined;

  const tick = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    try {
      const summary = await deps.getCurrentSeasonSummary();
      if (summary.status === "pending") {
        lastObservedPendingSeasonId = summary.seasonId;
        return;
      }
      if (summary.status === "active" && lastObservedPendingSeasonId === summary.seasonId) {
        lastObservedPendingSeasonId = undefined;
        deps.notifySeasonStarted();
      }
    } catch (error) {
      deps.onError?.(error);
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => void tick(), deps.intervalMs ?? 15_000);
  if (typeof timer.unref === "function") timer.unref();
  void tick();
  return { stop: () => clearInterval(timer) };
};
