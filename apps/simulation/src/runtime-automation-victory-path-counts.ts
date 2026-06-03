import type { AutomationVictoryPath } from "./automation-strategic-snapshot.js";

export const rememberedAutomationVictoryPathCounts = (
  rememberedAutomationVictoryPathByPlayer: ReadonlyMap<string, AutomationVictoryPath>
): Partial<Record<AutomationVictoryPath, number>> => {
  const counts: Partial<Record<AutomationVictoryPath, number>> = {
    TOWN_CONTROL: 0,
    DIPLOMATIC_DOMINANCE: 0,
    ECONOMIC_HEGEMONY: 0
  };
  for (const victoryPath of rememberedAutomationVictoryPathByPlayer.values()) {
    counts[victoryPath] = (counts[victoryPath] ?? 0) + 1;
  }
  return counts;
};
