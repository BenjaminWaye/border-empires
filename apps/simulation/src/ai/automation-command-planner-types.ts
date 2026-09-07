/**
 * Public types, constants, and small helpers for the automation command planner.
 *
 * Extracted from automation-command-planner.ts to keep that file under the
 * 500-line project limit.  All symbols are re-exported from the main planner
 * file so existing consumers don't need to change their import paths.
 */

import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";
import { type EconomicStructureType, type SlotResource, type Terrain } from "@border-empires/shared";
import type { DecisionClass } from "./utility/decisions.js";
import type { FrontierOriginExplanation } from "./planner-candidate-index.js";
import type { NeedVector } from "./build/build-need-vector.js";
import type { AutomationStrategicSnapshot, AutomationVictoryPath } from "./automation-strategic-snapshot.js";
import type { WarPostureLatchEntry } from "./ai-war-posture-latch.js";
import type { PlannerOwnedStructureCounts } from "./planner-owned-structure-counts.js";
import type { DecisionCooldownMap } from "./ai-rejection-cooldown.js";
import type { ReachLookup } from "./frontier-command-planner.js";

// Consecutive planner ticks an AI may spend with its narrow/hot-frontier
// scan alone actionable (broadFallbackSkipped: true — see
// automation-command-planner.ts) before the broad-fallback sweep of the
// rest of its frontier is forced regardless. Mirrors ai-spatial-focus.ts's
// AI_SPATIAL_FOCUS_MAX_UNPRODUCTIVE_STREAK idiom: bounds how long a
// persistent border skirmish can make the rest of the empire's frontier
// (economic opportunities, neutral towns) invisible to the planner.
export const AI_HOT_FRONTIER_MAX_STREAK_TICKS = 5;

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
  "upgrade_town_tier",
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
  economicStructure?: { ownerId?: string; type?: EconomicStructureType; status?: string; inactiveReason?: string | undefined } | null | undefined;
};

export type AutomationPlannerInput<TTile extends AutomationPlannerTile> = {
  playerId: string;
  points: number;
  manpower: number;
  techIds?: readonly string[];
  domainIds?: readonly string[];
  strategicResources?: Partial<Record<DomainStrategicResourceKey, number>>;
  settledTileCount?: number;
  townCount?: number;
  incomePerMinute?: number;
  hasActiveLock: boolean;
  activeDevelopmentProcessCount: number;
  reservedDevelopmentSlots?: number;
  frontierTiles: readonly TTile[];
  hotFrontierTiles?: readonly TTile[];
  strategicFrontierTiles?: readonly TTile[];
  buildCandidateTiles?: readonly TTile[];
  ownedTiles: readonly TTile[];
  ownedStructureCounts?: PlannerOwnedStructureCounts;
  tilesByKey: ReadonlyMap<string, TTile>;
  dockLinksByDockTileKey?: ReadonlyMap<string, readonly string[]>;
  clientSeq: number;
  issuedAt: number;
  sessionPrefix: AutomationSessionPrefix;
  playerScopeKeyCount?: number | undefined;
  playerScopeTileCount?: number | undefined;
  onPhaseTiming?: (sample: {
    phase: AutomationPlannerPhase;
    durationMs: number;
  }) => void;
  previousVictoryPath?: AutomationVictoryPath | undefined;
  /** Round-trips through this planner call exactly like previousVictoryPath
   *  — see ai-war-posture-latch.ts for the hysteresis it backs. */
  previousWarPostureLatch?: WarPostureLatchEntry | undefined;
  pathPopulationCounts?: Partial<Record<AutomationVictoryPath, number>> | undefined;
  onStrategicSnapshot?: (snapshot: AutomationStrategicSnapshot) => void;
  preplanProgressState?: AutomationPreplanProgressState | undefined;
  // Tile keys this player has been pounding without breakthrough — the
  // attack gates below skip targets in this set so the planner falls through
  // to SETTLE/EXPAND/BUILD. See ai-attack-stalemate.ts for the policy.
  attackStalemateTargetTileKeys?: ReadonlySet<string>;
  /** Nearest high-value neutral or enemy tile (from main-thread beacon index). */
  expansionObjective?: { x: number; y: number; kind: "neutral_value" | "enemy" };
  /** Number of muster flags this player currently has active. */
  activeMusterCount?: number;
  /** Tile keys of this player's currently active muster flags. */ musterTileKeys?: ReadonlySet<string>;
  /** Per-decision-class rejection cooldowns — true means the class is on cooldown. */
  decisionCooldowns?: DecisionCooldownMap;
  /** True on the boosted portion of this player's beacon build cadence — see ai-beacon-cadence.ts. */
  beaconBoostActive?: boolean;
  // Bounded BFS front of owned tile keys for this AI's current spatial focus.
  // When provided, frontier candidate enumeration is restricted to origins
  // inside this set, capping per-tick CPU regardless of empire size. See
  // ai-spatial-focus.ts for selection. Optional so test inputs and the no-AI
  // system planner keep working unchanged.
  spatialFocusFront?: ReadonlySet<string>;
  // Set by runtime.ts once AI_HOT_FRONTIER_MAX_STREAK_TICKS consecutive
  // hot-only-actionable ticks pass (ai-hot-frontier-streak.ts). Forces the
  // broad-fallback sweep below to run even though the narrow scan alone is
  // actionable, so a persistent skirmish can't hide the rest of the frontier.
  forceBroadFrontierScan?: boolean;
  /**
   * Reach lookup for fixed-border EXPAND gating (see frontier-command-planner.ts's
   * ReachLookup doc). Wired from SimulationRuntime.isPlayerTileInReach via
   * runtime.ts's planAutomationCommand call site. Optional so test inputs
   * and the no-AI system planner keep working unfiltered when omitted.
   */
  reachLookup?: ReachLookup;
  // Phase 1 (docs/ai-structure-building-rewrite-plan.md §9): diagnostic-only
  // needVector inputs — see needVectorFromPlannerInput's doc comment
  // (build/build-need-vector.ts) for the all-four-or-none gate.
  manpowerCapacity?: number;
  manpowerRegenPerMinute?: number;
  slotSupplyByResource?: Partial<Record<SlotResource, number>>;
  slotDemandByResource?: Partial<Record<SlotResource, number>>;
  /**
   * "x,y" tile keys of this player's economicStructures currently dormant
   * specifically on FOOD (Runtime.foodDormantEconomicStructureKeysForPlayer)
   * — feeds food-slot-relief.ts's chooseFoodConsumingStructureToDisable, the
   * FREE_FOOD_SLOT decision class's fallback disable target when FOOD slots
   * are fully exhausted, no FARMSTEAD/WATERWORKS/GRANARY build can grow
   * supply, and no RELAY_BEACON exists to disable instead. Preferred when
   * present, but no longer required — see that function's doc comment.
   */
  foodDormantEconomicStructureKeys?: ReadonlySet<string>;
};

export type AutomationPlannerDiagnostic = {
  playerId: string;
  sessionPrefix: AutomationSessionPrefix;
  frontierEnemyTargetCount: number;
  frontierEnemyPlayerTargetCount?: number;
  frontierBarbarianTargetCount?: number;
  frontierNeutralTargetCount: number;
  frontierOpportunityEconomic?: number;
  frontierOpportunityTownSupport?: number;
  frontierOpportunityScout?: number;
  frontierOpportunityScaffold?: number;
  frontierOpportunityWaste?: number;
  /** Diagnostic: neighbor candidate tiles the frontier scan visited vs how many were absent from the worker's tile map (sync-scope gap indicator). */
  neighborCandidateTotal?: number;
  missingNeighborTileCount?: number;
  canAttack: boolean;
  canExpand: boolean;
  ownedTileCount?: number;
  ownedFrontierTileCount?: number;
  frontierTileCountInput?: number;
  hotFrontierTileCountInput?: number;
  strategicFrontierTileCountInput?: number;
  frontierOriginCount?: number;
  dockOriginCount?: number;
  /** Debug-only: "x,y" of the first few frontier-scan origin tiles this tick
   *  (see baseFrontierOrigins in automation-command-planner.ts). Answers "what
   *  tile is the AI stuck scanning" without a live gRPC/SQLite lookup. */
  frontierOriginKeysSample?: string[];
  /** Debug-only: why each frontierOriginKeysSample tile was classified hot —
   *  recomputed live, so it also surfaces a stale hotFrontierTileKeys entry
   *  (reason "not_owned_frontier"/"none" despite being in the sample). */
  frontierOriginExplanations?: FrontierOriginExplanation[];
  /** Whether this tick's focus-restricted scan found any actionable frontier
   *  target, settlement candidate, or build candidate. Feeds
   *  ai-spatial-focus.ts's unproductive-streak rotation via runtime.ts.
   *  Undefined means "not evaluated this tick" (preplan short-circuit /
   *  no-command noop) — callers must treat that as productive. */
  scanFoundActionableCandidate?: boolean;
  playerScopeKeyCount?: number;
  playerScopeTileCount?: number;
  preplanReason?: AutomationPreplanReason;
  preplanNeedsEconomy?: boolean;
  preplanNeedsFood?: boolean;
  preplanTechChoiceAffordable?: boolean;
  preplanDomainChoiceAffordable?: boolean;
  preplanProgressState?: AutomationPreplanProgressState;
  noCommandReason?: AutomationNoopReason;
  broadFallbackSkipped?: boolean | undefined;
  /** Set when the narrow analyze path hits the candidate cap (NARROW_ANALYZE_MAX_CANDIDATES). */
  narrowAnalyzeCapped?: boolean | undefined;
  /** Set when the planner acts on an expansion objective (directed expand). */
  expansionObjectiveKind?: "neutral_value" | "enemy" | "none";
  /** Debug-only: "x,y:STRUCTURE_TYPE" of chooseBestEconomicBuild's pick, if any. */
  economicBuildCandidate?: string;
  /** Debug-only: "x,y" (+ ":needsSettle") of chooseBestRelayBeaconBuild's pick, if any. */
  relayBeaconBuildCandidate?: string;
  /** Debug-only: that pick's raw newCoverage.score — see decisions.ts's
   *  scoreBuildBeacon graduated consideration and RELAY_BEACON_SITE_VALUE_FLOOR/CEILING. */
  relayBeaconSiteValue?: number;
  // Utility AI fields — populated on every result from the main planner.
  utilityWinner?: DecisionClass;
  utilityWinnerScore?: number;
  utilityRunnerUp?: DecisionClass;
  utilityRunnerUpScore?: number;
  utilityVetoedClasses?: readonly DecisionClass[];
  /** Full per-class utility scores. Populated on every main-planner result so
   *  the AI decision diagnostics endpoint can show why every class scored 0. */
  utilityScores?: Record<string, number>;
  /** The gate inputs that veto ATTACK/MUSTER, surfaced so the diagnostics
   *  endpoint shows *why* a class scored 0 (stalemate vs readiness vs posture). */
  utilityGates?: {
    attackReady: boolean;
    musterReady: boolean;
    frontPosture: string;
    hasBarbTarget: boolean;
    hasWeakEnemyBorder: boolean;
    stalemated: boolean;
    pressureAttackScore: number;
  };
  /** Phase 1 of docs/ai-structure-building-rewrite-plan.md (§4/§9/§10.1):
   *  measured need deficits, reported for diagnostics only — nothing in the
   *  planner scores or acts on this yet. Undefined when the caller didn't
   *  supply the four optional AutomationPlannerInput fields it needs
   *  (manpowerCapacity, manpowerRegenPerMinute, slotSupplyByResource,
   *  slotDemandByResource). As of Phase 1 landing, runtime.ts's real
   *  ai-runtime call sites don't supply them yet either (deferred — see the
   *  plan's Phase 1 entry), so this is undefined on every current caller. */
  needVector?: NeedVector;
};

export type AutomationPlannerPhase =
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
  frontierEnemyTargetCount: 0,
  frontierNeutralTargetCount: 0,
  canAttack: false,
  canExpand: false,
  noCommandReason
});

