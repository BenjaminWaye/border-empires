// The season-victory recheck timer, split out of simulation-service.ts (over
// the repo's 500-line cap). It re-runs the season summary recompute when the
// next contested objective is due, capped at 5 minutes so season-victory and
// the activity-log save stay fresh during long holds.
import type { SimulationSeasonState } from "@border-empires/sim-protocol";

export const SEASON_VICTORY_RECHECK_MAX_DELAY_MS = 300_000;

export type SeasonVictoryRecheckTimerDeps = {
  getSeasonState: () => Pick<SimulationSeasonState, "status" | "scheduledStartAt">;
  onFire: () => void;
  now?: () => number;
};

export const createSeasonVictoryRecheckTimer = (
  deps: SeasonVictoryRecheckTimerDeps
): { clear: () => void; schedule: (at: number | undefined) => void } => {
  const now = deps.now ?? Date.now;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = (): void => {
    if (!timer) return;
    clearTimeout(timer);
    timer = undefined;
  };
  // `at` undefined = no contested objective (or a pending season, recheck at scheduledStartAt).
  const schedule = (at: number | undefined): void => {
    clear();
    const seasonState = deps.getSeasonState();
    if (seasonState.status === "ended") return;
    const effectiveAt = at ?? (seasonState.status === "pending" ? seasonState.scheduledStartAt : undefined);
    const delayMs = typeof effectiveAt === "number"
      ? Math.min(SEASON_VICTORY_RECHECK_MAX_DELAY_MS, Math.max(0, effectiveAt - now()))
      : SEASON_VICTORY_RECHECK_MAX_DELAY_MS;
    timer = setTimeout(deps.onFire, delayMs);
  };
  return { clear, schedule };
};
