// /admin/debug/ai/decisions fields for docs/ai-economic-synergy-plan.md.
// Fixed-size per decision record (no per-town arrays), so the 100-record
// per-player history stays bounded however large the empire grows.
import type { EconomicStructureType } from "@border-empires/shared";
import type { TownEconomyEntry } from "./town-economy-view.js";

export type EconomicSynergySummary = {
  towns: number;
  manufactories: number;
  ancillaryDepots: number;
  ancillaryFactories: number;
  /** Towns with at least one connected town (the Trade Nexus bonus needs one). */
  connectedTowns: number;
  townsWithTradeNexusInReach: number;
  townsWithClearingHouseInReach: number;
  townsWithNeuralWorksInReach: number;
  townsWithReserveLatticeInReach: number;
};

export const summarizeTownEconomy = (view: readonly TownEconomyEntry[]): EconomicSynergySummary => {
  const summary: EconomicSynergySummary = {
    towns: view.length,
    manufactories: 0,
    ancillaryDepots: 0,
    ancillaryFactories: 0,
    connectedTowns: 0,
    townsWithTradeNexusInReach: 0,
    townsWithClearingHouseInReach: 0,
    townsWithNeuralWorksInReach: 0,
    townsWithReserveLatticeInReach: 0
  };
  for (const town of view) {
    summary.manufactories += town.manufactories;
    summary.ancillaryDepots += town.ancillaryDepots;
    if (town.hasAncillaryFactory) summary.ancillaryFactories += 1;
    if (town.connectedTownCount > 0) summary.connectedTowns += 1;
    if (town.tradeNexusInReach) summary.townsWithTradeNexusInReach += 1;
    if (town.clearingHouseInReach) summary.townsWithClearingHouseInReach += 1;
    if (town.neuralWorksInReach) summary.townsWithNeuralWorksInReach += 1;
    if (town.reserveLatticeInReach) summary.townsWithReserveLatticeInReach += 1;
  }
  return summary;
};

/**
 * Debug-only: what chooseBestEconomicBuild picked (and its score), so a
 * repeatedly-rejected BUILD_ECONOMIC_STRUCTURE can be traced to a specific
 * tile/type via /admin/debug/ai/decisions instead of guessing, plus the
 * empire's stacking/amplifier state the pick was scored against.
 */
export const economicBuildDiagnostics = (
  economicBuild: { tile: { x: number; y: number }; structureType: EconomicStructureType; score: number } | undefined,
  townEconomy: readonly TownEconomyEntry[] | undefined
): { economicBuildCandidate?: string; economicBuildScore?: number; economicSynergy?: EconomicSynergySummary } => ({
  ...(economicBuild
    ? {
        economicBuildCandidate: `${economicBuild.tile.x},${economicBuild.tile.y}:${economicBuild.structureType}`,
        economicBuildScore: Math.round(economicBuild.score * 10) / 10
      }
    : {}),
  ...(townEconomy && townEconomy.length > 0 ? { economicSynergy: summarizeTownEconomy(townEconomy) } : {})
});
