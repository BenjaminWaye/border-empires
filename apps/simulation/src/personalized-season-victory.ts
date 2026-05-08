import type { SeasonVictoryObjectiveSnapshot } from "@border-empires/sim-protocol";

export const personalizeSeasonVictoryObjectives = (
  globalObjectives: SeasonVictoryObjectiveSnapshot[],
  playerObjectives: SeasonVictoryObjectiveSnapshot[]
): SeasonVictoryObjectiveSnapshot[] => {
  const playerObjectiveById = new Map(playerObjectives.map((objective) => [objective.id, objective]));
  return globalObjectives.map((objective) => {
    const playerObjective = playerObjectiveById.get(objective.id);
    if (!playerObjective?.selfProgressLabel) return objective;
    return {
      ...objective,
      selfProgressLabel: playerObjective.selfProgressLabel
    };
  });
};
