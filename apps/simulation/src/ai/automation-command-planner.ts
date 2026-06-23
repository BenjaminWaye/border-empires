import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";
import {
  ATTACK_MANPOWER_MIN,
  DEVELOPMENT_PROCESS_LIMIT,
  FRONTIER_CLAIM_COST,
  SETTLE_COST,
  type EconomicStructureType,
  type Terrain
} from "@border-empires/shared";

const SKIP_BROAD_FALLBACK_OWNED_TILE_THRESHOLD = 500;

import { chooseBestSettlementTile, chooseBestStrategicSettlementTile } from "./ai-settlement-priority.js";
import { analyzeOwnedFrontierTargetsFromLookup, type FrontierAnalysis } from "./frontier-command-planner.js";
import { computeTownSupport } from "../town-support.js";
import {
  chooseBestEconomicBuild,
  chooseBestFortBuild,
  chooseBestSiegeOutpostBuild
} from "./structure-command-planner.js";
import { economyWeak, foodCoverageLow } from "./ai-economic-heuristics.js";
import { buildAutomationStrategicSnapshot } from "./automation-strategic-snapshot.js";
import type { AutomationStrategicSnapshot, AutomationVictoryPath } from "./automation-strategic-snapshot.js";
import type { PlannerOwnedStructureCounts } from "./planner-owned-structure-counts.js";
import { chooseAutomationGoapDecision, type AiSeasonVictoryPathId } from "./automation-goap.js";
import {
  buildPlannerCommand,
  buildPlannerFrontierCommand,
  buildPlannerSettleCommand,
  evaluateSettleCandidateDecision,
  hasActionableSettlementCandidate,
  shouldSettleCandidateNow,
  type AutomationPlannerDecisionContext
} from "./automation-command-planner-helpers.js";
import { AI_UTILITY_POLICY_ENABLED } from "@border-empires/shared";
import { runUtilityPolicy } from "./utility/utility-dispatch.js";

// The strategic snapshot classifies five victory paths but GOAP goal trees are
// still defined for the original three. Map the new paths onto the closest
// legacy goal tree until path-specific goals are added. Diversification is
// preserved at the snapshot/crowding level — only goal selection collapses.
const mapVictoryPathForGoap = (
  path: AutomationStrategicSnapshot["primaryVictoryPath"]
): AiSeasonVictoryPathId => {
  switch (path) {
    case "RESOURCE_MONOPOLY":
      return "ECONOMIC_HEGEMONY";
    case "MARITIME_SUPREMACY":
      return "DIPLOMATIC_DOMINANCE";
    default:
      return path;
  }
};

type StrategicResourceKey = DomainStrategicResourceKey;

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
  // Populated each tick the planner evaluates a settlement candidate (primary
  // OR fallback). Records why the candidate was settled / not settled and the
  // top score the candidate received. Wired into a metric so staging tells us
  // why AIs are not actually settling.
  settleDecisionReason?: import("./automation-command-planner-helpers.js").AutomationSettleDecisionReason;
  settleDecisionTopScore?: number;
  // Set when the broad-fallback path is skipped because the empire exceeds
  // SKIP_BROAD_FALLBACK_OWNED_TILE_THRESHOLD. Wired into a counter metric so
  // we know how often the skip fires at the current threshold.
  broadFallbackSkipped?: boolean | undefined;
  /** Set when the narrow analyze path hits the candidate cap (NARROW_ANALYZE_MAX_CANDIDATES). */
  narrowAnalyzeCapped?: boolean | undefined;
  /** Set when the planner acts on an expansion objective (directed expand). */
  expansionObjectiveKind?: "neutral_value" | "enemy" | "none";
};

export type AutomationPlannerPhase =
  | "choose_settlement"
  | "choose_frontier"
  | "summarize_frontier"
  // Frontier-analysis sub-phases (PR 1 measurement — flow through
  // the same onPhaseTiming channel so the worker emits them as
  // diagnostic phases).
  | "analyze_iter_total"
  | "analyze_per_candidate"
  | "analyze_neighbor_lookups"
  | "analyze_score_calc";

type AutomationPlannerInput<TTile extends AutomationPlannerTile> = {
  playerId: string;
  points: number;
  manpower: number;
  techIds?: readonly string[];
  domainIds?: readonly string[];
  strategicResources?: Partial<Record<StrategicResourceKey, number>>;
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
  isPendingSettlement?: (tile: TTile) => boolean;
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
  // Bounded BFS front of owned tile keys for this AI's current spatial focus.
  // When provided, frontier candidate enumeration is restricted to origins
  // inside this set, capping per-tick CPU regardless of empire size. See
  // ai-spatial-focus.ts for selection. Optional so test inputs and the no-AI
  // system planner keep working unchanged.
  spatialFocusFront?: ReadonlySet<string>;
};

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

const attackTargetsBarbarian = (attack: FrontierAnalysis["attack"] | undefined): boolean =>
  Boolean(attack && (attack.target.ownerId === "barbarian-1" || attack.target.ownershipState === "BARBARIAN"));

export const goapGoldReserveHealthy = (points: number): boolean =>
  points >= SETTLE_COST + FRONTIER_CLAIM_COST;

const emptyFrontierAnalysis = (): FrontierAnalysis => ({
  frontierEnemyTargetCount: 0,
  frontierEnemyPlayerTargetCount: 0,
  frontierBarbarianTargetCount: 0,
  frontierNeutralTargetCount: 0,
  frontierOpportunityEconomic: 0,
  frontierOpportunityTownSupport: 0,
  frontierOpportunityScout: 0,
  frontierOpportunityScaffold: 0,
  frontierOpportunityWaste: 0,
  narrowAnalyzeCapped: false
});

const hasActionableFrontierAnalysis = (analysis: FrontierAnalysis): boolean =>
  analysis.frontierEnemyTargetCount > 0 ||
  analysis.frontierNeutralTargetCount > 0 ||
  Boolean(
    analysis.attack ||
      analysis.expand ||
      analysis.economicExpand ||
      analysis.directedExpand ||
      analysis.townSupportExpand || analysis.scaffoldExpand || analysis.scoutExpand
  );

const dedupeTiles = <TTile extends AutomationPlannerTile>(
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

const buildGoapFallbackResult = <TTile extends AutomationPlannerTile>(
  context: AutomationPlannerDecisionContext<TTile>,
  frontierAnalysis: FrontierAnalysis,
  points: number,
  manpower: number,
  strategic: AutomationStrategicSnapshot,
  canAttack: boolean,
  canExpand: boolean,
  actionableFallbackSettlementCandidate: TTile | undefined,
  economicBuild: ReturnType<typeof chooseBestEconomicBuild> | undefined,
  fortBuild: ReturnType<typeof chooseBestFortBuild> | undefined,
  siegeOutpostBuild: ReturnType<typeof chooseBestSiegeOutpostBuild> | undefined,
  attackStalemateTargetTileKeys: ReadonlySet<string> | undefined
): AutomationPlannerResult | undefined => {
  const isStalemated = (selection: FrontierAnalysis["attack"] | undefined): boolean =>
    Boolean(selection && attackStalemateTargetTileKeys?.has(`${selection.target.x},${selection.target.y}`));
  const hasBarbarianAttackTarget =
    frontierAnalysis.frontierBarbarianTargetCount > 0 && !isStalemated(frontierAnalysis.barbarianAttack);
  const hasWeakEnemyBorder =
    frontierAnalysis.frontierEnemyPlayerTargetCount > 0 && !isStalemated(frontierAnalysis.enemyAttack);
  const goapDecision = chooseAutomationGoapDecision({
    hasNeutralLandOpportunity: Boolean(frontierAnalysis.economicExpand && frontierAnalysis.frontierOpportunityEconomic > 0),
    hasScoutOpportunity: Boolean(frontierAnalysis.scoutExpand),
    hasScaffoldOpportunity: Boolean(frontierAnalysis.scaffoldExpand),
    hasBarbarianTarget: hasBarbarianAttackTarget,
    hasWeakEnemyBorder,
    hasSiegeOutpostSite: Boolean(siegeOutpostBuild && frontierAnalysis.enemyAttack),
    attackReady: strategic.attackReady,
    musterReady: strategic.musterReady,
    needsSettlement: Boolean(actionableFallbackSettlementCandidate),
    frontierDebtHigh: frontierAnalysis.frontierNeutralTargetCount >= 3,
    foodCoverageLow: context.needsFood,
    underThreat: strategic.underThreat,
    threatCritical: strategic.threatCritical,
    economyWeak: context.needsEconomy,
    needsFortifiedAnchor: Boolean(fortBuild) && frontierAnalysis.frontierEnemyTargetCount > 0,
    canAffordFrontierAction: canExpand,
    canAffordSettlement: Boolean(actionableFallbackSettlementCandidate),
    canBuildFort: Boolean(fortBuild),
    canBuildEconomy: Boolean(economicBuild),
    canBuildSiegeOutpost: Boolean(siegeOutpostBuild),
    goldHealthy: goapGoldReserveHealthy(points),
    // Use the same scaled-manpower gate as attackReady so the GOAP fallback
    // doesn't issue ATTACK actions while the primary planner refuses them.
    // The `|| !strategic.underThreat` softening still applies — when not
    // threatened, baseline manpower is enough for non-emergency attacks.
    staminaHealthy: strategic.manpowerSufficient || !strategic.underThreat
  }, mapVictoryPathForGoap(strategic.primaryVictoryPath));
  if (!goapDecision) return undefined;

  switch (goapDecision.actionKey) {
    case "claim_food_border_tile":
      if (frontierAnalysis.economicExpand && canExpand) return buildPlannerFrontierCommand(context, frontierAnalysis.economicExpand, "EXPAND");
      if (frontierAnalysis.expand && canExpand) return buildPlannerFrontierCommand(context, frontierAnalysis.expand, "EXPAND");
      return undefined;
    case "claim_neutral_border_tile":
      if (frontierAnalysis.economicExpand && canExpand && frontierAnalysis.frontierOpportunityEconomic > 0) {
        return buildPlannerFrontierCommand(context, frontierAnalysis.economicExpand, "EXPAND");
      }
      if (frontierAnalysis.expand && canExpand) return buildPlannerFrontierCommand(context, frontierAnalysis.expand, "EXPAND");
      return undefined;
    case "claim_scout_border_tile":
      return frontierAnalysis.scoutExpand && canExpand
        ? buildPlannerFrontierCommand(context, frontierAnalysis.scoutExpand, "EXPAND")
        : undefined;
    case "claim_scaffold_border_tile":
      return frontierAnalysis.scaffoldExpand && canExpand
        ? buildPlannerFrontierCommand(context, frontierAnalysis.scaffoldExpand, "EXPAND")
        : undefined;
    case "attack_barbarian_border_tile":
      return frontierAnalysis.barbarianAttack && canAttack && strategic.attackReady && hasBarbarianAttackTarget
        ? buildPlannerFrontierCommand(context, frontierAnalysis.barbarianAttack, "ATTACK")
        : undefined;
    case "attack_enemy_border_tile":
      return frontierAnalysis.enemyAttack && canAttack && strategic.attackReady && !strategic.musterReady && hasWeakEnemyBorder
        ? buildPlannerFrontierCommand(context, frontierAnalysis.enemyAttack, "ATTACK")
        : undefined;
    case "place_muster":
      // Under muster system, AI stages manpower on the best attack origin with ADVANCE
      // mode. The muster tick + ADVANCE auto-fire handle the actual attack.
      return frontierAnalysis.enemyAttack && strategic.musterReady && hasWeakEnemyBorder
        ? buildPlannerCommand(context, "SET_MUSTER", {
            x: frontierAnalysis.enemyAttack.from.x,
            y: frontierAnalysis.enemyAttack.from.y,
            mode: "ADVANCE"
          })
        : undefined;
    case "build_siege_outpost":
      return siegeOutpostBuild
        ? buildPlannerCommand(context, "BUILD_SIEGE_OUTPOST", { x: siegeOutpostBuild.x, y: siegeOutpostBuild.y })
        : undefined;
    case "settle_owned_frontier_tile":
      return actionableFallbackSettlementCandidate
        ? buildPlannerSettleCommand(context, actionableFallbackSettlementCandidate)
        : undefined;
    case "build_fort_on_exposed_tile":
      return fortBuild ? buildPlannerCommand(context, "BUILD_FORT", { x: fortBuild.x, y: fortBuild.y }) : undefined;
    case "build_economic_structure":
      return economicBuild
        ? buildPlannerCommand(context, "BUILD_ECONOMIC_STRUCTURE", {
            x: economicBuild.tile.x,
            y: economicBuild.tile.y,
            structureType: economicBuild.structureType
          })
        : undefined;
    case "wait_and_recover":
      if (
        frontierAnalysis.economicExpand ||
        frontierAnalysis.scaffoldExpand ||
        frontierAnalysis.attack ||
        !frontierAnalysis.scoutExpand
      ) {
        return undefined;
      }
      return {
        diagnostic: {
          ...context.diagnostic,
          noCommandReason: "wait_and_recover"
        }
      };
    default:
      return undefined;
  }
};

export const planAutomationCommand = <TTile extends AutomationPlannerTile>(
  input: AutomationPlannerInput<TTile>
): AutomationPlannerResult => {
  const recordPhaseTiming = (phase: AutomationPlannerPhase, startedAt: number): void => {
    input.onPhaseTiming?.({
      phase,
      durationMs: Math.max(0, Date.now() - startedAt)
    });
  };
  if (input.hasActiveLock) {
    return {
      diagnostic: createAutomationNoopDiagnostic(input.playerId, input.sessionPrefix, "active_lock")
    };
  }

  const settlementEligible =
    input.sessionPrefix === "ai-runtime" &&
    input.activeDevelopmentProcessCount < DEVELOPMENT_PROCESS_LIMIT &&
    input.points >= SETTLE_COST;
  const settlementStartedAt = Date.now();
  const ownedFrontierTiles = input.ownedTiles.filter(
    (tile) => tile.terrain === "LAND" && tile.ownerId === input.playerId && tile.ownershipState === "FRONTIER"
  ) as readonly TTile[];
  // Restrict per-AI candidate sets to the spatial focus front when present.
  // Without this, large empires made per-tick selectors (settle priority,
  // structure build) iterate the full owned/frontier set every tick — the
  // settle priority evaluator alone is O(neighborhood) per candidate, so
  // unbounded inputs produced multi-second AI ticks even after the frontier
  // candidate enumeration was bounded. Fall back to the unfiltered list when
  // the focus excludes everything, so the AI never starves on a bad focus.
  const focusFront = input.spatialFocusFront;
  const restrictToFocus = <T extends AutomationPlannerTile>(
    tiles: readonly T[]
  ): readonly T[] => {
    if (!focusFront || tiles.length === 0) return tiles;
    const filtered = tiles.filter((tile) => focusFront.has(`${tile.x},${tile.y}`));
    return filtered.length > 0 ? (filtered as readonly T[]) : tiles;
  };
  const settlementSources = (restrictToFocus(
    input.strategicFrontierTiles?.length
      ? input.strategicFrontierTiles
      : input.hotFrontierTiles?.length
        ? input.hotFrontierTiles
        : input.frontierTiles.length > 0
          ? input.frontierTiles
          : ownedFrontierTiles
  ) as readonly TTile[]) as unknown as Iterable<DomainTileState>;
  const fallbackSettlementSources = (restrictToFocus(
    input.hotFrontierTiles?.length
      ? input.hotFrontierTiles
      : input.frontierTiles.length > 0
        ? input.frontierTiles
        : ownedFrontierTiles
  ) as readonly TTile[]) as unknown as Iterable<DomainTileState>;
  const settlementCandidate = settlementEligible
    ? chooseBestStrategicSettlementTile(
        input.playerId,
        settlementSources,
        input.tilesByKey as ReadonlyMap<string, DomainTileState>,
        input.isPendingSettlement
          ? (tile) => input.isPendingSettlement?.(tile as unknown as TTile) ?? false
          : undefined
      )
    : undefined;
  const fallbackSettlementCandidate = settlementEligible
    ? chooseBestSettlementTile(input.playerId, fallbackSettlementSources, input.tilesByKey as ReadonlyMap<string, DomainTileState>, {
        ...(input.isPendingSettlement
          ? { isPending: (tile: DomainTileState) => input.isPendingSettlement?.(tile as unknown as TTile) ?? false }
          : {})
      })
    : undefined;
  recordPhaseTiming("choose_settlement", settlementStartedAt);

  const canAttack = input.points >= FRONTIER_CLAIM_COST && input.manpower >= ATTACK_MANPOWER_MIN;
  const canExpand = input.points >= FRONTIER_CLAIM_COST;
  const baseFrontierOrigins =
    (input.hotFrontierTiles?.length
      ? input.hotFrontierTiles
      : input.strategicFrontierTiles?.length
        ? input.strategicFrontierTiles
        : input.frontierTiles.length > 0
          ? input.frontierTiles
          : input.ownedTiles) as readonly TTile[];
  const dockOrigins = input.ownedTiles.filter(
    (tile) =>
      Boolean(tile.dockId) &&
      !baseFrontierOrigins.some((candidate) => candidate.x === tile.x && candidate.y === tile.y)
  );
  const townSupportOrigins = input.ownedTiles.filter((tile) => {
    if (tile.ownerId !== input.playerId || tile.ownershipState !== "SETTLED" || !tile.town) return false;
    if (tile.town.populationTier === "SETTLEMENT") return false;
    const storedMax = tile.town.supportMax;
    const storedCurrent = tile.town.supportCurrent;
    if (typeof storedMax === "number" && typeof storedCurrent === "number") {
      return storedMax > storedCurrent;
    }
    const { supportMax, supportCurrent } = computeTownSupport(input.playerId, tile.x, tile.y, input.tilesByKey);
    return supportMax > supportCurrent;
  });
  const unfilteredNarrowOrigins =
    dockOrigins.length > 0 || townSupportOrigins.length > 0
      ? dedupeTiles([...baseFrontierOrigins, ...townSupportOrigins, ...dockOrigins])
      : baseFrontierOrigins;
  const narrowFrontierOrigins = restrictToFocus(unfilteredNarrowOrigins);
  // Fold the per-state counts into a single owned-tiles sweep. Previously
  // three separate `.filter(...)` walks ran per plan (settled, controlled,
  // towns); at 1000+ owned tiles per AI × 5 AIs that allocated three
  // throwaway arrays per AI tick — pure GC pressure on a hot path.
  const needSettledCount = input.settledTileCount === undefined;
  const needTownCount = input.townCount === undefined;
  let computedSettledTileCount = 0;
  let computedTownCount = 0;
  let computedControlledTileCount = 0;
  for (const tile of input.ownedTiles) {
    const isSettled = tile.ownershipState === "SETTLED";
    const isFrontier = tile.ownershipState === "FRONTIER";
    if (isSettled || isFrontier) computedControlledTileCount += 1;
    if (needSettledCount && isSettled) computedSettledTileCount += 1;
    if (needTownCount && isSettled && tile.town) computedTownCount += 1;
  }
  const settledTileCount = input.settledTileCount ?? computedSettledTileCount;
  const controlledTileCount = computedControlledTileCount;
  const townCount = input.townCount ?? computedTownCount;
  const incomePerMinute = input.incomePerMinute ?? 0;
  const needsFood = foodCoverageLow(input.strategicResources, townCount);
  const needsEconomy = economyWeak(incomePerMinute, settledTileCount);
  const frontierStartedAt = Date.now();
  let frontierOrigins = narrowFrontierOrigins;
  let frontierAnalysis =
    canAttack || canExpand
      ? analyzeOwnedFrontierTargetsFromLookup(input.tilesByKey, frontierOrigins, input.playerId, {
          canAttack,
          canExpand,
          needsFood,
          ...(input.dockLinksByDockTileKey ? { dockLinksByDockTileKey: input.dockLinksByDockTileKey } : {}),
          ...(input.expansionObjective ? { expansionObjective: input.expansionObjective } : {}),
          onAnalyzeTiming: (phase, durationMs) => {
            input.onPhaseTiming?.({ phase: phase as AutomationPlannerPhase, durationMs });
          }
        })
      : emptyFrontierAnalysis();
  let broadFallbackSkipped = false;
  if ((canAttack || canExpand) && !hasActionableFrontierAnalysis(frontierAnalysis) && input.frontierTiles.length > 0) {
    if (input.ownedTiles.length > SKIP_BROAD_FALLBACK_OWNED_TILE_THRESHOLD) {
      // Broad fallback's second analyzeOwnedFrontierTargetsFromLookup
      // dominates the 587ms tail at this scale. The narrow result stands.
      broadFallbackSkipped = true;
    } else {
      const broadFrontierOriginsAll = dedupeTiles([
        ...narrowFrontierOrigins,
        ...input.frontierTiles,
        ...ownedFrontierTiles
      ]);
      // The broad fallback also respects the spatial focus front so a large
      // empire cannot blow up planner CPU through the fallback path.
      const broadFrontierOrigins = restrictToFocus(broadFrontierOriginsAll);
      if (broadFrontierOrigins.length > frontierOrigins.length) {
        const broadFrontierAnalysis = analyzeOwnedFrontierTargetsFromLookup(input.tilesByKey, broadFrontierOrigins, input.playerId, {
          canAttack,
          canExpand,
          needsFood,
          ...(input.dockLinksByDockTileKey ? { dockLinksByDockTileKey: input.dockLinksByDockTileKey } : {}),
          ...(input.expansionObjective ? { expansionObjective: input.expansionObjective } : {}),
          onAnalyzeTiming: (phase, durationMs) => {
            input.onPhaseTiming?.({ phase: phase as AutomationPlannerPhase, durationMs });
          }
        });
        if (hasActionableFrontierAnalysis(broadFrontierAnalysis)) {
          frontierOrigins = broadFrontierOrigins;
          frontierAnalysis = broadFrontierAnalysis;
        }
      }
    }
  }
  recordPhaseTiming("choose_frontier", frontierStartedAt);

  const diagnosticBase: AutomationPlannerDiagnostic = {
    playerId: input.playerId,
    sessionPrefix: input.sessionPrefix,
    settlementEligible,
    settlementCandidateFound: Boolean(settlementCandidate),
    frontierEnemyTargetCount: frontierAnalysis.frontierEnemyTargetCount,
    frontierEnemyPlayerTargetCount: frontierAnalysis.frontierEnemyPlayerTargetCount,
    frontierBarbarianTargetCount: frontierAnalysis.frontierBarbarianTargetCount,
    frontierNeutralTargetCount: frontierAnalysis.frontierNeutralTargetCount,
    frontierOpportunityEconomic: frontierAnalysis.frontierOpportunityEconomic,
    frontierOpportunityTownSupport: frontierAnalysis.frontierOpportunityTownSupport,
    frontierOpportunityScout: frontierAnalysis.frontierOpportunityScout,
    frontierOpportunityScaffold: frontierAnalysis.frontierOpportunityScaffold,
    frontierOpportunityWaste: frontierAnalysis.frontierOpportunityWaste,
    canAttack,
    canExpand,
    ownedTileCount: input.ownedTiles.length,
    ownedFrontierTileCount: ownedFrontierTiles.length,
    broadFallbackSkipped: broadFallbackSkipped || undefined,
    narrowAnalyzeCapped: frontierAnalysis.narrowAnalyzeCapped || undefined,
    frontierTileCountInput: input.frontierTiles.length,
    hotFrontierTileCountInput: input.hotFrontierTiles?.length ?? 0,
    strategicFrontierTileCountInput: input.strategicFrontierTiles?.length ?? 0,
    frontierOriginCount: frontierOrigins.length,
    dockOriginCount: dockOrigins.length,
    ...(typeof input.playerScopeKeyCount === "number" ? { playerScopeKeyCount: input.playerScopeKeyCount } : {}),
    ...(typeof input.playerScopeTileCount === "number" ? { playerScopeTileCount: input.playerScopeTileCount } : {})
  };

  const context: AutomationPlannerDecisionContext<TTile> = {
    playerId: input.playerId,
    clientSeq: input.clientSeq,
    issuedAt: input.issuedAt,
    sessionPrefix: input.sessionPrefix,
    diagnostic: diagnosticBase,
    settlementCandidate: settlementCandidate as TTile | undefined,
    fallbackSettlementCandidate: fallbackSettlementCandidate as TTile | undefined,
    frontierAnalysis,
    tilesByKey: input.tilesByKey,
    needsFood,
    needsEconomy,
    ...(input.preplanProgressState ? { preplanProgressState: input.preplanProgressState } : {})
  };
  const summarizeStartedAt = Date.now();
  // Prefer the primary candidate's decision for diagnostics (it's the highest-
  // scoring candidate). Fall back to the fallback candidate if no primary.
  const primarySettleDecision = settlementCandidate
    ? evaluateSettleCandidateDecision(context, settlementCandidate as TTile)
    : undefined;
  const fallbackSettleDecision = fallbackSettlementCandidate
    ? evaluateSettleCandidateDecision(context, fallbackSettlementCandidate as TTile)
    : undefined;
  const settleDecisionForDiagnostic = primarySettleDecision ?? fallbackSettleDecision;
  if (settleDecisionForDiagnostic) {
    diagnosticBase.settleDecisionReason = settleDecisionForDiagnostic.reason;
    diagnosticBase.settleDecisionTopScore = settleDecisionForDiagnostic.topScore;
  }
  const actionableFallbackSettlementCandidate = fallbackSettleDecision?.shouldSettle
    ? (fallbackSettlementCandidate as TTile)
    : undefined;
  const canSettleNow = Boolean(primarySettleDecision?.shouldSettle);
  const techUnaffordable = input.preplanProgressState === "tech_unaffordable";
  const preferredEnemyAttack = frontierAnalysis.enemyAttack ?? (frontierAnalysis.frontierEnemyPlayerTargetCount === 0 ? frontierAnalysis.attack : undefined);

  const effectiveDevelopmentProcessCount = Math.min(DEVELOPMENT_PROCESS_LIMIT, input.activeDevelopmentProcessCount + Math.max(0, input.reservedDevelopmentSlots ?? 0));
  // Action-class policy: if attack, expand, or settle is clearly available from
  // frontier analysis, skip the economy build selector entirely. Fort and
  // siege-outpost selectors still run because they feed GOAP defense decisions
  // independently of the main priority waterfall.
  const hasHigherPriorityAction =
    (canAttack && frontierAnalysis.frontierEnemyTargetCount > 0) ||
    (canExpand && (frontierAnalysis.frontierNeutralTargetCount > 0 || Boolean(frontierAnalysis.directedExpand))) ||
    Boolean(settlementCandidate);
  let economicBuild: ReturnType<typeof chooseBestEconomicBuild> | undefined;
  let fortBuild: ReturnType<typeof chooseBestFortBuild> | undefined;
  let siegeOutpostBuild: ReturnType<typeof chooseBestSiegeOutpostBuild> | undefined;
  if (input.sessionPrefix === "ai-runtime" && effectiveDevelopmentProcessCount < DEVELOPMENT_PROCESS_LIMIT) {
    const structurePlayer = {
      id: input.playerId,
      points: input.points,
      ...(input.techIds ? { techIds: input.techIds } : {}),
      ...(input.strategicResources ? { strategicResources: input.strategicResources } : {}),
      ...(input.ownedStructureCounts ? { ownedStructureCounts: input.ownedStructureCounts } : {}),
      settledTileCount,
      townCount,
      incomePerMinute
    };
    const structureCandidates = input.buildCandidateTiles?.length ? input.buildCandidateTiles : input.ownedTiles;
    const buildCandidates = restrictToFocus(structureCandidates);
    // Under utility policy the competition is resolved by scoring, not a boolean gate —
    // always compute so BUILD_ECONOMY can be scored even when frontier action is available.
    economicBuild = (!AI_UTILITY_POLICY_ENABLED && hasHigherPriorityAction)
      ? undefined
      : chooseBestEconomicBuild(structurePlayer, input.ownedTiles, input.tilesByKey, buildCandidates);
    fortBuild = chooseBestFortBuild(structurePlayer, input.ownedTiles, input.tilesByKey, buildCandidates);
    siegeOutpostBuild = chooseBestSiegeOutpostBuild(structurePlayer, input.ownedTiles, input.tilesByKey, buildCandidates);
  }
  const strategic = buildAutomationStrategicSnapshot({
    playerId: input.playerId,
    points: input.points,
    manpower: input.manpower,
    settledTileCount,
    controlledTileCount,
    townCount,
    incomePerMinute,
    ...(input.strategicResources ? { strategicResources: input.strategicResources } : {}),
    ownedTiles: input.ownedTiles,
    tilesByKey: input.tilesByKey,
    frontierAnalysis,
    ...(settlementCandidate ? { settlementCandidate: settlementCandidate as TTile } : {}),
    ...(fallbackSettlementCandidate ? { fallbackSettlementCandidate: fallbackSettlementCandidate as TTile } : {}),
    needsFood,
    needsEconomy,
    canAttack,
    canExpand,
    economicBuildAvailable: Boolean(economicBuild),
    fortBuildAvailable: Boolean(fortBuild),
    siegeOutpostBuildAvailable: Boolean(siegeOutpostBuild),
    ...(input.previousVictoryPath ? { previousVictoryPath: input.previousVictoryPath } : {}),
    ...(input.pathPopulationCounts ? { pathPopulationCounts: input.pathPopulationCounts } : {}),
    ...(typeof input.activeMusterCount === "number" ? { activeMusterCount: input.activeMusterCount } : {})
  });
  input.onStrategicSnapshot?.(strategic);

  if (AI_UTILITY_POLICY_ENABLED) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return runUtilityPolicy({
      context,
      strategic,
      canAttack,
      canExpand,
      canSettleNow,
      devSlotAvailable: effectiveDevelopmentProcessCount < DEVELOPMENT_PROCESS_LIMIT,
      actionableFallbackSettlementCandidate,
      preferredEnemyAttack,
      economicBuild,
      fortBuild,
      siegeOutpostBuild,
      attackStalemateTargetTileKeys: input.attackStalemateTargetTileKeys,
      points: input.points,
      manpower: input.manpower
    });
  }

  const isStalematedAttackTarget = (selection: typeof preferredEnemyAttack): boolean =>
    Boolean(
      selection &&
      input.attackStalemateTargetTileKeys?.has(`${selection.target.x},${selection.target.y}`)
    );

  if (
    preferredEnemyAttack &&
    !isStalematedAttackTarget(preferredEnemyAttack) &&
    strategic.attackReady &&
    !strategic.musterReady &&
    strategic.frontPosture === "BREAK" &&
    strategic.pressureThreatensCore &&
    strategic.pressureAttackScore >= 220
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, preferredEnemyAttack, "ATTACK");
  }

  if (settlementCandidate && canSettleNow) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerSettleCommand(context, settlementCandidate as TTile);
  }

  // Expand into directly valuable adjacent tiles first (resource, town, dock).
  // Frontier tiles decay in ~10 minutes, so aimless expansion onto waste land
  // just burns gold.
  if (frontierAnalysis.economicExpand && canExpand) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.economicExpand, "EXPAND");
  }

  // Expand toward the nearest high-value beacon (distant town, dock, or enemy territory)
  // when a direct adjacent target isn't available. Only steps that reduce Chebyshev
  // distance to the objective are considered — waste without direction is suppressed.
  if (frontierAnalysis.directedExpand && canExpand) {
    context.diagnostic.expansionObjectiveKind = input.expansionObjective?.kind ?? "none";
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.directedExpand, "EXPAND");
  }

  if (strategic.townSupportSettlementAvailable && actionableFallbackSettlementCandidate && !strategic.pressureThreatensCore) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerSettleCommand(context, actionableFallbackSettlementCandidate);
  }
  if (
    strategic.townSupportExpandAvailable &&
    frontierAnalysis.townSupportExpand &&
    canExpand &&
    !strategic.pressureThreatensCore &&
    !actionableFallbackSettlementCandidate
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.townSupportExpand, "EXPAND");
  }
  if (
    frontierAnalysis.attack &&
    strategic.attackReady &&
    !strategic.musterReady &&
    strategic.frontPosture === "BREAK" &&
    (
      strategic.primaryVictoryPath === "TOWN_CONTROL" ||
      strategic.primaryVictoryPath === "ECONOMIC_HEGEMONY" ||
      strategic.victoryPathContender ||
      strategic.pressureAttackScore >= 200
    ) &&
    !actionableFallbackSettlementCandidate
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.attack, "ATTACK");
  }

  if (
    frontierAnalysis.economicExpand &&
    canExpand &&
    !actionableFallbackSettlementCandidate &&
    (
      needsFood ||
      needsEconomy ||
      (!settlementCandidate && frontierAnalysis.frontierOpportunityEconomic > 0)
    )
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.economicExpand, "EXPAND");
  }

  if (strategic.islandSettlementAvailable && actionableFallbackSettlementCandidate && !strategic.pressureThreatensCore) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerSettleCommand(context, actionableFallbackSettlementCandidate);
  }
  if (
    strategic.islandExpandAvailable &&
    canExpand &&
    !canSettleNow &&
    !actionableFallbackSettlementCandidate &&
    frontierAnalysis.expand
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.expand, "EXPAND");
  }

  if (
    techUnaffordable &&
    frontierAnalysis.scoutExpand &&
    canExpand &&
    !canSettleNow &&
    !actionableFallbackSettlementCandidate
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.scoutExpand, "EXPAND");
  }

  if (actionableFallbackSettlementCandidate) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerSettleCommand(context, actionableFallbackSettlementCandidate);
  }

  const goapFallbackResult = buildGoapFallbackResult(
    context,
    frontierAnalysis,
    input.points,
    input.manpower,
    strategic,
    canAttack,
    canExpand,
    actionableFallbackSettlementCandidate,
    undefined,
    fortBuild,
    siegeOutpostBuild,
    input.attackStalemateTargetTileKeys
  );
  if (goapFallbackResult) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return goapFallbackResult;
  }
  // NOTE: this siege-outpost gate is intentionally NOT stalemate-aware. A
  // siege outpost is one of the few ways an attacker can break an
  // entrenched defender (it reduces target defence), so when ATTACK has
  // been demoted by stalemate we still want this build path to fire as
  // the antidote, not block it as more of the same.
  if (
    siegeOutpostBuild &&
    preferredEnemyAttack &&
    strategic.frontPosture !== "TRUCE" &&
    !strategic.underThreat &&
    (strategic.primaryVictoryPath === "TOWN_CONTROL" || strategic.primaryVictoryPath === "ECONOMIC_HEGEMONY") &&
    (strategic.victoryPathContender || strategic.pressureAttackScore >= 180) &&
    !hasActionableSettlementCandidate(context)
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerCommand(context, "BUILD_SIEGE_OUTPOST", {
      x: siegeOutpostBuild.x,
      y: siegeOutpostBuild.y
    });
  }

  if (
    fortBuild &&
    strategic.frontPosture === "CONTAIN" &&
    frontierAnalysis.frontierEnemyTargetCount > 0 &&
    !hasActionableSettlementCandidate(context)
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerCommand(context, "BUILD_FORT", {
      x: fortBuild.x,
      y: fortBuild.y
    });
  }

  if (
    fortBuild &&
    frontierAnalysis.frontierEnemyTargetCount > 0 &&
    frontierAnalysis.frontierNeutralTargetCount === 0 &&
    !settlementCandidate &&
    !actionableFallbackSettlementCandidate
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerCommand(context, "BUILD_FORT", {
      x: fortBuild.x,
      y: fortBuild.y
    });
  }

  if (
    frontierAnalysis.scaffoldExpand &&
    canExpand &&
    (!fallbackSettlementCandidate || frontierAnalysis.frontierOpportunityScaffold > 0)
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.scaffoldExpand, "EXPAND");
  }

  if (strategic.openingScoutAvailable && frontierAnalysis.scoutExpand && canExpand) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.scoutExpand, "EXPAND");
  }

  if (
    frontierAnalysis.scoutExpand &&
    canExpand &&
    strategic.scoutExpandWorthwhile
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, frontierAnalysis.scoutExpand, "EXPAND");
  }

  if (
    preferredEnemyAttack &&
    !isStalematedAttackTarget(preferredEnemyAttack) &&
    strategic.attackReady &&
    !strategic.musterReady &&
    frontierAnalysis.frontierEnemyTargetCount > 0 &&
    (frontierAnalysis.frontierNeutralTargetCount === 0 ||
      (!needsFood && !needsEconomy && !settlementCandidate && frontierAnalysis.frontierEnemyTargetCount > 1))
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, preferredEnemyAttack, "ATTACK");
  }

  if (
    preferredEnemyAttack &&
    !isStalematedAttackTarget(preferredEnemyAttack) &&
    !strategic.musterReady &&
    !(
      strategic.frontPosture === "CONTAIN" &&
      frontierAnalysis.frontierNeutralTargetCount > 0 &&
      (frontierAnalysis.expand || frontierAnalysis.economicExpand)
    )
  ) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerFrontierCommand(context, preferredEnemyAttack, "ATTACK");
  }

  if (economicBuild) {
    recordPhaseTiming("summarize_frontier", summarizeStartedAt);
    return buildPlannerCommand(context, "BUILD_ECONOMIC_STRUCTURE", {
      x: economicBuild.tile.x,
      y: economicBuild.tile.y,
      structureType: economicBuild.structureType
    });
  }

  let noCommandReason: AutomationNoopReason;
  const hasAnyFrontierOpportunity =
    frontierAnalysis.frontierEnemyTargetCount > 0 || frontierAnalysis.frontierNeutralTargetCount > 0;
  const hasAnyActionableSettlementCandidate = hasActionableSettlementCandidate(context);
  if (effectiveDevelopmentProcessCount >= DEVELOPMENT_PROCESS_LIMIT && frontierAnalysis.frontierEnemyTargetCount === 0 && frontierAnalysis.frontierNeutralTargetCount === 0) {
    noCommandReason = "development_process_limit";
  } else if (!canExpand) {
    noCommandReason = "insufficient_points";
  } else if (!canAttack && frontierAnalysis.frontierEnemyTargetCount > 0 && frontierAnalysis.frontierNeutralTargetCount === 0) {
    noCommandReason = "insufficient_manpower_for_attack";
  } else if (!hasAnyFrontierOpportunity && !hasAnyActionableSettlementCandidate) {
    noCommandReason = "no_frontier_targets";
  } else if (settlementEligible) {
    noCommandReason = "no_settlement_target";
  } else if (frontierAnalysis.frontierNeutralTargetCount > 0 && !input.expansionObjective && !frontierAnalysis.economicExpand) {
    noCommandReason = "no_objective_idle";
  } else {
    noCommandReason = "no_frontier_targets";
  }
  recordPhaseTiming("summarize_frontier", summarizeStartedAt);

  return {
    diagnostic: {
      ...diagnosticBase,
      noCommandReason
    }
  };
};
