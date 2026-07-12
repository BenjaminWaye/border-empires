import type { CurrentSeasonSummary } from "@border-empires/sim-protocol";
import { IMPERIAL_WARD_CHARGES_GRANTED } from "@border-empires/game-domain";

import type { GalaxyEndorsementStore } from "../galaxy-endorsement-store/galaxy-endorsement-store.js";
import { IMPERIAL_WARD_ENDORSEMENT_WINDOW_MS } from "../galaxy-endorsement-routes/galaxy-endorsement-routes.js";

export type GalaxyEndorsementAutoStartDeps = {
  getCurrentSeasonSummary: () => Promise<CurrentSeasonSummary>;
  startNextSeason: (force?: boolean, imperialWard?: { playerId: string; charges: number }) => Promise<{ seasonId: string }>;
  endorsementStore: GalaxyEndorsementStore;
  now?: () => number;
  intervalMs?: number;
  onError?: (error: unknown) => void;
};

// Season start never blocks on the Emperor: once the one-hour endorsement
// window elapses, the next season auto-starts, applying whatever endorsement
// (if any) was picked. No pick just means no Imperial Ward grant.
export const startImperialWardAutoStartTimer = (deps: GalaxyEndorsementAutoStartDeps): { stop: () => void } => {
  const now = deps.now ?? (() => Date.now());
  let inFlight = false;

  const tick = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    try {
      const summary = await deps.getCurrentSeasonSummary();
      const deadlineAnchor = summary.seasonWinner?.crownedAt ?? summary.endedAt;
      if (summary.status !== "ended" || typeof deadlineAnchor !== "number") return;
      if (now() - deadlineAnchor < IMPERIAL_WARD_ENDORSEMENT_WINDOW_MS) return;

      const endorsement = await deps.endorsementStore.getByEndedSeasonId(summary.seasonId);
      const imperialWard =
        endorsement && !endorsement.appliedAt
          ? { playerId: endorsement.targetPlayerId, charges: IMPERIAL_WARD_CHARGES_GRANTED }
          : undefined;
      await deps.startNextSeason(false, imperialWard);
      if (endorsement) await deps.endorsementStore.markApplied(summary.seasonId);
    } catch (error) {
      deps.onError?.(error);
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => void tick(), deps.intervalMs ?? 60_000);
  if (typeof timer.unref === "function") timer.unref();
  return { stop: () => clearInterval(timer) };
};
