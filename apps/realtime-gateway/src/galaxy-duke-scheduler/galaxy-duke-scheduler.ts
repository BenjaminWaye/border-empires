import type { GalaxyDukeService } from "../galaxy-duke-service/galaxy-duke-service.js";

export type GalaxyDukeSchedulerDeps = {
  service: Pick<GalaxyDukeService, "tick">;
  // Deliberately short: production accrual, arrivals and incursions are
  // wall-clock events, and a Probe arrives about 10 hours after launch.
  pollIntervalMs?: number;
  onError?: (error: unknown) => void;
};

// Same shape as galaxy-fleet-scheduler.ts: a single-flight interval timer that
// never keeps the process alive.
export const startGalaxyDukeScheduler = (deps: GalaxyDukeSchedulerDeps): { stop: () => void } => {
  let inFlight = false;
  const tick = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    try {
      await deps.service.tick();
    } catch (error) {
      deps.onError?.(error);
    } finally {
      inFlight = false;
    }
  };
  const timer = setInterval(() => void tick(), deps.pollIntervalMs ?? 60_000);
  if (typeof timer.unref === "function") timer.unref();
  void tick();
  return { stop: () => clearInterval(timer) };
};
