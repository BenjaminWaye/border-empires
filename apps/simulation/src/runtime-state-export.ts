import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";

export const plannerPlayerScopeKeyCount = (summary: PlayerRuntimeSummary): number => {
  const scopedKeys = new Set<string>();
  for (const key of summary.territoryTileKeys) scopedKeys.add(key);
  for (const key of summary.frontierTileKeys) scopedKeys.add(key);
  for (const key of summary.hotFrontierTileKeys) scopedKeys.add(key);
  for (const key of summary.strategicFrontierTileKeys) scopedKeys.add(key);
  for (const key of summary.buildCandidateTileKeys) scopedKeys.add(key);
  for (const key of summary.pendingSettlementsByTile.keys()) scopedKeys.add(key);
  return scopedKeys.size;
};
