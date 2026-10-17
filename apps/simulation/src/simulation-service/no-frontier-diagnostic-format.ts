// Extracted out of simulation-service.ts (500-line file cap, AGENTS.md): the
// colon-joined detail string the AI "no frontier" metric is labelled with.
import type { AutomationPlannerDiagnostic } from "../ai/automation-command-planner.js";

export const formatNoFrontierDiagnostic = (
  source: "worker" | "runtime",
  diagnostic: AutomationPlannerDiagnostic
): string => {
  const parts = [
    `source=${source}`,
    diagnostic.playerId,
    `owned=${diagnostic.ownedTileCount ?? 0}`,
    `owned_frontier=${diagnostic.ownedFrontierTileCount ?? 0}`,
    `frontier=${diagnostic.frontierTileCountInput ?? 0}`,
    `hot=${diagnostic.hotFrontierTileCountInput ?? 0}`,
    `strategic=${diagnostic.strategicFrontierTileCountInput ?? 0}`,
    `origins=${diagnostic.frontierOriginCount ?? 0}`,
    `dock_origins=${diagnostic.dockOriginCount ?? 0}`,
    `scope_keys=${diagnostic.playerScopeKeyCount ?? 0}`,
    `scope_tiles=${diagnostic.playerScopeTileCount ?? 0}`,
    `enemy=${diagnostic.frontierEnemyTargetCount}`,
    `enemy_player=${diagnostic.frontierEnemyPlayerTargetCount ?? 0}`,
    `barbarian=${diagnostic.frontierBarbarianTargetCount ?? 0}`,
    `neutral=${diagnostic.frontierNeutralTargetCount}`,
    `econ=${diagnostic.frontierOpportunityEconomic ?? 0}`,
    `support=${diagnostic.frontierOpportunityTownSupport ?? 0}`,
    `scout=${diagnostic.frontierOpportunityScout ?? 0}`,
    `scaffold=${diagnostic.frontierOpportunityScaffold ?? 0}`,
    `waste=${diagnostic.frontierOpportunityWaste ?? 0}`,
    `preplan=${diagnostic.preplanProgressState ?? "none"}`
  ];
  return parts.join(":");
};
