import type { FrontierAnalysis } from "./frontier-command-planner.js";
import type { AutomationPlannerTile } from "./automation-command-planner-types.js";

// Extracted out of automation-command-planner.ts (which is over the 500-line
// file budget and may not grow further — see AGENTS.md's file-and-type-
// discipline rule) to keep that file's own growth room for planner logic
// rather than these small, self-contained helpers.

export const emptyFrontierAnalysis = (): FrontierAnalysis => ({
  frontierEnemyTargetCount: 0,
  frontierEnemyPlayerTargetCount: 0,
  frontierBarbarianTargetCount: 0,
  frontierNeutralTargetCount: 0,
  frontierOpportunityEconomic: 0,
  frontierOpportunityTownSupport: 0,
  frontierOpportunityScout: 0,
  frontierOpportunityScaffold: 0,
  frontierOpportunityWaste: 0,
  narrowAnalyzeCapped: false,
  neighborCandidateTotal: 0,
  missingNeighborTileCount: 0
});

export const hasActionableFrontierAnalysis = (analysis: FrontierAnalysis): boolean =>
  analysis.frontierEnemyTargetCount > 0 ||
  analysis.frontierNeutralTargetCount > analysis.frontierOpportunityWaste ||
  Boolean(
    analysis.attack ||
      analysis.expand ||
      analysis.economicExpand ||
      analysis.directedExpand ||
      analysis.townSupportExpand || analysis.scaffoldExpand || analysis.scoutExpand
  );

// Bounded frontier sample considered as relay-beacon sites (each candidate
// costs a box scan in estimateNewReachCoverage — see the call site).
export const RELAY_BEACON_FRONTIER_SAMPLE_CAP = 96;

export const dedupeTiles = <TTile extends AutomationPlannerTile>(
  tiles: Iterable<TTile>
): TTile[] => {
  const seen = new Set<string>();
  const deduped: TTile[] = [];
  for (const tile of tiles) {
    const key = `${tile.x},${tile.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(tile);
  }
  return deduped;
};
