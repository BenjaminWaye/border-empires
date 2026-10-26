// Runners-up behind each victory path's leader, for the client's Ranks race
// tracks. computeSeasonVictory already scores every competitive player per
// path (selfProgressByPlayerId); this keeps the best two after the leader so
// the tracks show a top three instead of only the leader and the viewer.

import type { SeasonVictoryPathId } from "@border-empires/shared";
import type { SeasonVictoryContender, SeasonVictoryObjectiveSnapshot } from "@border-empires/sim-protocol";

export const MAX_SEASON_VICTORY_CONTENDERS = 2;

const byProgressDesc = (a: SeasonVictoryContender, b: SeasonVictoryContender): number =>
  (b.progress - a.progress) || a.playerId.localeCompare(b.playerId);

/** Best two non-leaders with progress above zero, best first. */
export const topContenders = (
  objective: Pick<SeasonVictoryObjectiveSnapshot, "id" | "leaderPlayerId">,
  progressByPlayerId: ReadonlyMap<string, ReadonlyMap<SeasonVictoryPathId, number>>,
  nameOf: (playerId: string) => string
): SeasonVictoryContender[] => {
  const all: SeasonVictoryContender[] = [];
  for (const [playerId, progresses] of progressByPlayerId) {
    if (playerId === objective.leaderPlayerId) continue;
    const progress = progresses.get(objective.id);
    if (typeof progress === "number" && Number.isFinite(progress) && progress > 0) all.push({ playerId, name: nameOf(playerId), progress });
  }
  return all.sort(byProgressDesc).slice(0, MAX_SEASON_VICTORY_CONTENDERS);
};

/** Attaches contenders to every objective; leaves an objective untouched when it has none. */
export const withContenders = (
  objectives: SeasonVictoryObjectiveSnapshot[],
  progressByPlayerId: ReadonlyMap<string, ReadonlyMap<SeasonVictoryPathId, number>>,
  nameOf: (playerId: string) => string
): SeasonVictoryObjectiveSnapshot[] =>
  objectives.map((objective) => {
    if (objective.contenders) return objective;
    const contenders = topContenders(objective, progressByPlayerId, nameOf);
    return contenders.length > 0 ? { ...objective, contenders } : objective;
  });
