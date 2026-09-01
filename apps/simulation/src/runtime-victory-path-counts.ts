import type { AutomationVictoryPath } from "./ai/automation-strategic-snapshot.js";

export const rememberedAutomationVictoryPathCounts = (
  rememberedAutomationVictoryPathByPlayer: ReadonlyMap<string, AutomationVictoryPath>,
  territoryTileCountForPlayer: (playerId: string) => number
): Partial<Record<AutomationVictoryPath, number>> => {
  const counts: Partial<Record<AutomationVictoryPath, number>> = {
    TOWN_CONTROL: 0,
    ECONOMIC_HEGEMONY: 0,
    RESOURCE_MONOPOLY: 0,
    MARITIME_SUPREMACY: 0,
    DIPLOMATIC_DOMINANCE: 0
  };
  for (const [playerId, victoryPath] of rememberedAutomationVictoryPathByPlayer.entries()) {
    if (territoryTileCountForPlayer(playerId) <= 0) continue;
    counts[victoryPath] = (counts[victoryPath] ?? 0) + 1;
  }
  return counts;
};
