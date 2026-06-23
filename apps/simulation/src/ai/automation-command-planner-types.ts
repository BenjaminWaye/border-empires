/**
 * Public types, constants, and small helpers for the automation command planner.
 *
 * Extracted from automation-command-planner.ts to keep that file under the
 * 500-line project limit.  All symbols are re-exported from the main planner
 * file so existing consumers don't need to change their import paths.
 */

import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";
import { FRONTIER_CLAIM_COST, SETTLE_COST, type EconomicStructureType, type Terrain } from "@border-empires/shared";
import type { DecisionClass } from "./utility/decisions.js";

export const AUTOMATION_NOOP_REASONS = [
  "player_missing",
  "planner_error",
  "active_lock",
  "development_process_limit",
  "insufficient_points",
  "insufficient_manpower_for_attack",
  "no_settlement_target",
  "no_frontier_targets",
  "no_objective_idle",
  "wait_and_recover"
] as const;

export const AUTOMATION_PREPLAN_REASONS = [
  "choose_tech",
  "choose_domain",
  "defer_no_reachable_progression",
  "defer_unaffordable_progression",
  "defer_to_main_planner"
] as const;

export const AUTOMATION_PREPLAN_PROGRESS_STATES = [
  "no_reachable_progression",
  "tech_unaffordable",
  "domain_unaffordable",
  "tech_and_domain_unaffordable",
  "tech_affordable",
  "domain_affordable",
  "tech_and_domain_affordable"
] as const;

export type AutomationNoopReason = (typeof AUTOMATION_NOOP_REASONS)[number];
export type AutomationPreplanReason = (typeof AUTOMATION_PREPLAN_REASONS)[number];
export type AutomationPreplanProgressState = (typeof AUTOMATION_PREPLAN_PROGRESS_STATES)[number];
export type AutomationSessionPrefix = "ai-runtime" | "system-runtime";

export type AutomationPlannerTile = {
  x: number;
  y: number;
  terrain: Terrain;
  ownerId?: string | undefined;
  ownershipState?: DomainTileState["ownershipState"] | undefined;
  resource?: DomainTileState["resource"] | undefined;
  dockId?: string | undefined;
  town?: {
    supportMax?: number | undefined;
    supportCurrent?: number | undefined;
    type?: "MARKET" | "FARMING";
    name?: string;
    populationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  } | null | undefined;
  fort?: { ownerId?: string; status?: string } | null | undefined;
  observatory?: { ownerId?: string; status?: string } | null | undefined;
  siegeOutpost?: { ownerId?: string; status?: string } | null | undefined;
  economicStructure?: { ownerId?: string; type?: EconomicStructureType; status?: string } | null | undefined;
};

export type AutomationPlannerDiagnostic = {
  playerId: string;
  sessionPrefix: AutomationSessionPrefix;
  settlementEligible: boolean;
  settlementCandidateFound: boolean;
  frontierEnemyTargetCount: number;
  frontierEnemyPlayerTargetCount?: number;
  frontierBarbarianTargetCount?: number;
  frontierNeutralTargetCount: number;
  frontierOpportunityEconomic?: number;
  frontierOpportunityTownSupport?: number;
  frontierOpportunityScout?: number;
  frontierOpportunityScaffold?: number;
  frontierOpportunityWaste?: number;
  canAttack: boolean;
  canExpand: boolean;
  ownedTileCount?: number;
  ownedFrontierTileCount?: number;
  frontierTileCountInput?: number;
  hotFrontierTileCountInput?: number;
  strategicFrontierTileCountInput?: number;
  frontierOriginCount?: number;
  dockOriginCount?: number;
  playerScopeKeyCount?: number;
  playerScopeTileCount?: number;
  preplanReason?: AutomationPreplanReason;
  preplanNeedsEconomy?: boolean;
  preplanNeedsFood?: boolean;
  preplanTechChoiceAffordable?: boolean;
  preplanDomainChoiceAffordable?: boolean;
  preplanProgressState?: AutomationPreplanProgressState;
  noCommandReason?: AutomationNoopReason;
  // Inline import to avoid a circular types dependency (helpers ↔ types).
  settleDecisionReason?: import("./automation-command-planner-helpers.js").AutomationSettleDecisionReason;
  settleDecisionTopScore?: number;
  broadFallbackSkipped?: boolean | undefined;
  /** Set when the narrow analyze path hits the candidate cap (NARROW_ANALYZE_MAX_CANDIDATES). */
  narrowAnalyzeCapped?: boolean | undefined;
  /** Set when the planner acts on an expansion objective (directed expand). */
  expansionObjectiveKind?: "neutral_value" | "enemy" | "none";
  // Utility AI fields (only populated when AI_UTILITY_POLICY_ENABLED=true).
  utilityWinner?: DecisionClass;
  utilityWinnerScore?: number;
  utilityRunnerUp?: DecisionClass;
  utilityRunnerUpScore?: number;
  utilityVetoedClasses?: readonly DecisionClass[];
};

export type AutomationPlannerPhase =
  | "choose_settlement"
  | "choose_frontier"
  | "summarize_frontier"
  | "analyze_iter_total"
  | "analyze_per_candidate"
  | "analyze_neighbor_lookups"
  | "analyze_score_calc";

export type AutomationPlannerResult = {
  command?: CommandEnvelope;
  diagnostic: AutomationPlannerDiagnostic;
};

export const createAutomationNoopDiagnostic = (
  playerId: string,
  sessionPrefix: AutomationSessionPrefix,
  noCommandReason: AutomationNoopReason
): AutomationPlannerDiagnostic => ({
  playerId,
  sessionPrefix,
  settlementEligible: false,
  settlementCandidateFound: false,
  frontierEnemyTargetCount: 0,
  frontierNeutralTargetCount: 0,
  canAttack: false,
  canExpand: false,
  noCommandReason
});

export const goapGoldReserveHealthy = (points: number): boolean =>
  points >= SETTLE_COST + FRONTIER_CLAIM_COST;
