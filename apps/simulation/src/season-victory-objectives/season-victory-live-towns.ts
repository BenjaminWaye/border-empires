import type { SeasonVictoryObjectiveSnapshot } from "@border-empires/sim-protocol";

import { clamp01 } from "./season-victory-objectives.js";

// Town Control's town counts, refreshed on every GLOBAL_STATUS_UPDATE from the
// runtime's per-player town counter (player-runtime-summary.ts townCount, kept
// in step with every tile write). The objective itself comes from the full
// world scan, which runs on a ~5-minute cadence, so its "3/200 towns" stayed
// at 3 for minutes after a 4th town was taken (playtest 2026-11-26). Only the
// counts are refreshed: the leader, hold and win condition stay the scan's.

const townsLabel = (towns: number, townTarget: number): string => `${towns}/${townTarget} towns`;

export const withLiveTownControl = (
  objectives: SeasonVictoryObjectiveSnapshot[],
  playerId: string,
  liveTownCountOf: (playerId: string) => number | undefined,
  townTarget: number | undefined
): SeasonVictoryObjectiveSnapshot[] => {
  if (typeof townTarget !== "number" || townTarget <= 0) return objectives;
  return objectives.map((objective) => {
    if (objective.id !== "TOWN_CONTROL") return objective;
    let next = objective;
    const leaderTowns = objective.leaderPlayerId ? liveTownCountOf(objective.leaderPlayerId) : undefined;
    if (typeof leaderTowns === "number") {
      next = { ...next, progressLabel: townsLabel(leaderTowns, townTarget), progress: objective.conditionMet ? 1 : clamp01(leaderTowns / townTarget) };
    }
    // Only where the scan already gave the player a label: it skips the leader and non-competitive players.
    const ownTowns = objective.selfProgressLabel === undefined ? undefined : liveTownCountOf(playerId);
    if (typeof ownTowns === "number") {
      next = { ...next, selfProgressLabel: townsLabel(ownTowns, townTarget), selfProgress: clamp01(ownTowns / townTarget) };
    }
    return next;
  });
};
